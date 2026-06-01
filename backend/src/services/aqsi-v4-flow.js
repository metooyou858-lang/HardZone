'use strict';

const { pool } = require('../db');
const {
  startSlipPurchase,
  getOperation,
  cancelOperation,
  extractSlipResultData,
  isSlipPaid,
  extractReceiptFiscalData,
  buildAqsiV4ReceiptPayload,
  sendV4ReceiptRequest,
  listAqsiReceipts,
  listAqsiSlips,
  getAqsiSlip,
} = require('./aqsi');
const { confirmOpenOrderPayment } = require('./order-sync');
const logger = require('./logger');

const TERMINAL_CANCELLED_STATUSES = new Set(['Canceled', 'Timeout', 'Error']);
const TERMINAL_ACTIVE_STATUSES = new Set(['Pending', 'Processing', 'Finishing']);

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Сбрасывает все поля платёжного состояния. Единая точка очистки — не забыть ни одно поле.
// Бросает если БД недоступна — не глотает ошибку молча.
async function clearPaymentState(orderId, { status = null, error = null } = {}) {
  try {
    await pool.query(
      `UPDATE orders SET
         aqsi_payment_operation_id = NULL,
         aqsi_payment_operation_at = NULL,
         aqsi_payment_status = $2,
         aqsi_error = $3
       WHERE id = $1`,
      [orderId, status, error]
    );
  } catch (dbErr) {
    logger.error('orders', { action: 'clear_payment_state_failed', order_id: orderId, target_status: status, message: dbErr.message });
    throw dbErr;
  }
}

async function clearPaymentStateByOperation(operationId, { status = 'cancelled', error = null } = {}) {
  await pool.query(
    `UPDATE orders SET
       aqsi_payment_operation_id = NULL,
       aqsi_payment_operation_at = NULL,
       aqsi_payment_status = $2,
       aqsi_error = $3
     WHERE aqsi_payment_operation_id = $1
       AND status = 'open'
       AND aqsi_slip_id IS NULL
       AND aqsi_receipt_operation_id IS NULL
       AND aqsi_receipt_id IS NULL`,
    [operationId, status, error]
  );
}

async function resolveBlockerRecord(operationId, resolvedStatus) {
  await pool.query(
    `UPDATE aqsi_terminal_blockers
       SET resolved_at = NOW(), resolved_status = $2, op_status = COALESCE($3, op_status), last_seen_at = NOW()
     WHERE operation_id = $1 AND resolved_at IS NULL`,
    [operationId, resolvedStatus, resolvedStatus]
  ).catch((err) => logger.error('orders', { action: 'blocker_resolve_db_failed', operation_id: operationId, message: err.message }));
}

// ── checkReceiptOp ────────────────────────────────────────────────────────────
// Internal helper: один GET к AQSI, без polling. Вызывается из syncSlip
// когда receipt_operation_id уже сохранён в БД.

async function checkReceiptOp(orderId, receiptOperationId) {
  let receiptOp;
  try {
    receiptOp = await getOperation(receiptOperationId);
  } catch (err) {
    throw err;
  }

  const PENDING = new Set(['Pending', 'Processing', 'Finishing']);
  if (PENDING.has(receiptOp.status)) {
    return { status: 'pending', operation_status: receiptOp.status };
  }

  if (receiptOp.status !== 'Completed') {
    const msg = receiptOp.status === 'Timeout'
      ? 'Тайм-аут фискализации чека'
      : (receiptOp.message || `Ошибка фискализации (${receiptOp.status})`);
    logger.error('orders', { action: 'receipt_op_non_completed', order_id: orderId, status: receiptOp.status, receipt_op_id: receiptOperationId });
    await pool.query(
      'UPDATE orders SET aqsi_receipt_operation_id = NULL, aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
      [orderId, 'error', msg]
    ).catch(() => {});
    return { status: 'receipt_error', message: msg };
  }

  logger.info('orders', { action: 'receipt_operation_done', order_id: orderId, status: receiptOp.status, receipt_op_id: receiptOperationId });

  const fiscalData = extractReceiptFiscalData(receiptOp);

  if (!fiscalData || !fiscalData.fiscal_fd || !fiscalData.fiscal_fn || !fiscalData.fiscal_fp) {
    const noFiscalMsg = 'Чек завершён, но реквизиты ФД/ФН/ФП не получены — используйте «Восстановить»';
    logger.error('orders', { action: 'receipt_no_docinfo', order_id: orderId, raw_result: receiptOp.result });
    await pool.query(
      'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
      [orderId, 'error', noFiscalMsg]
    ).catch(() => {});
    return { status: 'receipt_error', message: noFiscalMsg };
  }

  const hasMarkingErrors = Boolean(fiscalData.has_marking_errors);
  if (hasMarkingErrors) {
    logger.warn('orders', { action: 'marking_code_errors_in_receipt', order_id: orderId });
  }

  try {
    await pool.query(
      `UPDATE orders SET
         fiscal_fd = COALESCE($2, fiscal_fd),
         fiscal_fn = COALESCE($3, fiscal_fn),
         fiscal_fp = COALESCE($4, fiscal_fp),
         fiscal_kkt_reg = COALESCE($5, fiscal_kkt_reg),
         fiscal_date = COALESCE($6, fiscal_date),
         aqsi_receipt_id = COALESCE($9, aqsi_receipt_id),
         aqsi_receipt_status = $7,
         aqsi_error = CASE WHEN $8 THEN 'Ошибка маркировки ГИС МТ (тег 2107 ФФД 1.2)' ELSE aqsi_error END
       WHERE id = $1`,
      [orderId, fiscalData.fiscal_fd, fiscalData.fiscal_fn, fiscalData.fiscal_fp, fiscalData.fiscal_kkt_reg, fiscalData.fiscal_date, hasMarkingErrors ? 'marking_error' : 'completed', hasMarkingErrors, fiscalData.receipt_id ?? null]
    );
  } catch (dbErr) {
    logger.error('orders', { action: 'save_fiscal_failed', order_id: orderId, message: dbErr.message });
    throw httpError(500, `Чек фискализирован, но реквизиты не сохранились в CRM: ${dbErr.message}`);
  }

  try {
    await confirmOpenOrderPayment(orderId, 'card');
  } catch (err) {
    logger.error('orders', { action: 'confirm_after_slip_failed', order_id: orderId, message: err.message });
    throw httpError(500, `Фискализация прошла, но ошибка закрытия заказа: ${err.message}`);
  }

  await pool.query(
    `UPDATE orders SET
       aqsi_payment_operation_id = NULL,
       aqsi_payment_operation_at = NULL,
       aqsi_payment_status = NULL,
       aqsi_receipt_operation_id = NULL,
       aqsi_error = NULL
     WHERE id = $1`,
    [orderId]
  ).catch(() => {});

  return { status: 'confirmed', has_marking_errors: hasMarkingErrors };
}

// ── startReceiptOp ────────────────────────────────────────────────────────────
// Internal helper: отправляет запрос на фискализацию и сохраняет receipt_operation_id.
// Не ждёт завершения — возвращает pending, следующий sync-slip проверит статус.

async function startReceiptOp(orderId, slipId, slipContent) {
  // Race condition guard: перечитываем заказ
  const { rows: freshRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const fresh = freshRows[0];

  if (fresh.aqsi_receipt_operation_id) {
    return { status: 'pending' };
  }
  if (fresh.aqsi_receipt_status === 'error') {
    return { status: 'receipt_error', message: fresh.aqsi_error || 'Фискализация завершилась с ошибкой — используйте «Восстановить»' };
  }

  const { rows: itemRows } = await pool.query(
    'SELECT oi.*, p.marking_type FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY oi.created_at',
    [orderId]
  );
  const freshOrder = { ...fresh, items: itemRows };

  const markedItems = itemRows.filter((i) => i.marking_code);
  logger.info('orders', {
    action: 'receipt_fiscalize',
    order_id: orderId,
    slip_id: slipId,
    marked_items: markedItems.map((i) => ({
      name: i.name,
      marking_code_hex: Buffer.from(String(i.marking_code)).toString('hex'),
      nomenclature_code: i.marking_code,
      marking_type: i.marking_type,
    })),
  });

  let receiptOpId = null;

  try {
    const receiptPayload = buildAqsiV4ReceiptPayload(freshOrder, 'card', slipId, slipContent);
    const receiptOpResponse = await sendV4ReceiptRequest(receiptPayload);
    receiptOpId = receiptOpResponse.operationId;

    await pool.query(
      'UPDATE orders SET aqsi_receipt_operation_id = $1, aqsi_receipt_status = $2 WHERE id = $3',
      [receiptOpId, 'pending', orderId]
    ).catch(() => {});

    return { status: 'pending' };
  } catch (err) {
    logger.error('orders', { action: 'receipt_fiscalization_failed', order_id: orderId, message: err.message });
    if (receiptOpId) {
      await pool.query(
        'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
        [orderId, 'error', err.message]
      ).catch(() => {});
    } else {
      await pool.query(
        'UPDATE orders SET aqsi_receipt_operation_id = NULL, aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
        [orderId, 'error', err.message]
      ).catch(() => {});
    }
    return { status: 'receipt_error', message: 'Оплата прошла, но фискализация не выполнена. Используйте кнопку «Восстановить» для повторной попытки.' };
  }
}

async function recoverSlipContentForReceipt(order, slipId, action) {
  if (order.aqsi_payment_operation_id) {
    try {
      const paymentOp = await getOperation(order.aqsi_payment_operation_id);
      const slipData = extractSlipResultData(paymentOp);
      if (slipData?.content) return slipData.content;
    } catch (err) {
      logger.warn('orders', {
        action: `${action}_recover_slip_content_from_operation_failed`,
        order_id: order.id,
        payment_operation_id: order.aqsi_payment_operation_id,
        message: err.message,
      });
    }
  }

  if (slipId) {
    try {
      const slip = await getAqsiSlip(slipId);
      if (slip?.content) return slip.content;
    } catch (err) {
      logger.warn('orders', {
        action: `${action}_recover_slip_content_from_slip_failed`,
        order_id: order.id,
        slip_id: slipId,
        message: err.message,
      });
    }
  }

  return null;
}

// ── initiatePayment ───────────────────────────────────────────────────────────
// Returns: { type: 'ok', operationId } | { type: 'conflict', conflictingOperationId }
// Throws: httpError(statusCode) for 404/409/422, plain Error for 500

async function initiatePayment(orderId) {
  const pgClient = await pool.connect();
  let order;
  let txError = null;

  try {
    await pgClient.query('BEGIN');

    const { rows: orderRows } = await pgClient.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );
    order = orderRows[0];

    if (!order) {
      txError = httpError(404, 'Заказ не найден');
    } else if (order.status !== 'open') {
      txError = httpError(409, 'Заказ уже закрыт');
    } else if (order.aqsi_sent_at) {
      txError = httpError(409, 'Заказ уже передан на кассу (v2)');
    } else if (order.aqsi_payment_status === 'starting') {
      txError = httpError(409, 'Оплата уже инициируется');
    } else if (order.aqsi_payment_operation_id) {
      txError = httpError(409, 'Оплата уже инициирована');
    } else if (order.aqsi_slip_id) {
      txError = httpError(409, 'Оплата уже прошла — используйте «Восстановить» для фискализации');
    } else if (order.aqsi_receipt_operation_id || order.aqsi_receipt_status === 'pending' || order.aqsi_receipt_status === 'error') {
      txError = httpError(409, 'Фискализация в процессе или с ошибкой — используйте «Восстановить»');
    } else if (order.items_count === 0) {
      txError = httpError(422, 'Чек пустой');
    }

    if (!txError) {
      const { rows: itemRows } = await pgClient.query(
        `SELECT oi.*, p.marking_type
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1
         ORDER BY oi.created_at`,
        [orderId]
      );

      const missingMarkedItem = itemRows.find((item) => item.marking_required && !item.marking_code);
      if (missingMarkedItem) {
        txError = httpError(422, `Для товара "${missingMarkedItem.name}" нужно отсканировать код маркировки`);
      }

      if (!txError) {
        const itemWithoutMarkingType = itemRows.find((item) => item.marking_code && !item.marking_type);
        if (itemWithoutMarkingType) {
          txError = httpError(422, `Для товара "${itemWithoutMarkingType.name}" не задан тип маркировки`);
        }
      }
    }

    if (!txError) {
      await pgClient.query('UPDATE orders SET aqsi_payment_status = $2 WHERE id = $1', [orderId, 'starting']);
    }

    if (txError) {
      await pgClient.query('ROLLBACK');
    } else {
      await pgClient.query('COMMIT');
    }
  } catch (err) {
    try { await pgClient.query('ROLLBACK'); } catch (_) {}
    pgClient.release();
    throw err;
  }
  pgClient.release();

  if (txError) throw txError;

  const amountKopeks = Math.round(parseFloat(order.total_amount || 0) * 100);
  const deviceId = Number(process.env.AQSI_DEVICE_ID || 705334);
  const TTL_MS = 300000;
  const STALE_BUFFER_MS = 120000;

  let slipOp;
  try {
    slipOp = await startSlipPurchase(deviceId, amountKopeks);
  } catch (err) {
    await pool.query('UPDATE orders SET aqsi_payment_status = NULL WHERE id = $1', [orderId]).catch(() => {});

    if (err.isAqsiRejection) {
      let parsedError = null;
      try { parsedError = JSON.parse(err.message); } catch (_) {}

      if (parsedError?.reason === 'OperationInProgress') {
        const conflictingOpId = parsedError.info?.operationId ?? null;
        logger.warn('orders', { action: 'initiate_payment_blocked', order_id: orderId, conflicting_op_id: conflictingOpId });

        if (conflictingOpId) {
          try {
            const conflictingOp = await getOperation(conflictingOpId);
            const ageMs = conflictingOp?.createdAt
              ? Date.now() - new Date(conflictingOp.createdAt).getTime()
              : 0;
            const isStale = ageMs > TTL_MS + STALE_BUFFER_MS;
            const isSafe = conflictingOp?.status !== 'Completed';

            if (isStale && isSafe) {
              logger.info('orders', { action: 'auto_cancel_stale_op', order_id: orderId, conflicting_op_id: conflictingOpId, age_ms: ageMs, status: conflictingOp.status });
              await cancelOperation(conflictingOpId).catch(() => {});
              await new Promise((resolve) => setTimeout(resolve, 2000));
              const opAfterCancel = await getOperation(conflictingOpId).catch(() => null);
              const statusAfterCancel = opAfterCancel?.status ?? null;
              const TERMINAL_DONE = new Set(['Canceled', 'Timeout', 'Error']);
              if (statusAfterCancel && TERMINAL_DONE.has(statusAfterCancel)) {
                await pool.query('UPDATE orders SET aqsi_payment_status = $2 WHERE id = $1', [orderId, 'starting']);
                try {
                  slipOp = await startSlipPurchase(deviceId, amountKopeks);
                  logger.info('orders', { action: 'initiate_payment_retry_ok', order_id: orderId });
                } catch (retryErr) {
                  await pool.query('UPDATE orders SET aqsi_payment_status = NULL WHERE id = $1', [orderId]).catch(() => {});
                }
              } else {
                logger.warn('orders', { action: 'auto_cancel_stale_op_unconfirmed', order_id: orderId, conflicting_op_id: conflictingOpId, status_after: statusAfterCancel });
              }
            }
          } catch (_) {}
        }

        if (!slipOp) {
          if (conflictingOpId) {
            try {
              const { rows: ownerRows } = await pool.query(
                'SELECT id FROM orders WHERE aqsi_payment_operation_id = $1 LIMIT 1',
                [conflictingOpId]
              );
              if (ownerRows.length === 0) {
                const blockerOp = await getOperation(conflictingOpId).catch(() => null);
                const blockerStatus = blockerOp?.status ?? null;
                const blockerCancelFlag = Boolean(blockerOp?.isCancellationRequested);

                let linkedOrderId = null;
                let blockerSource = 'orphaned';
                if (blockerOp?.createdAt) {
                  const opTs = new Date(blockerOp.createdAt).getTime();
                  const windowStart = new Date(opTs - 10 * 60 * 1000).toISOString();
                  const windowEnd = new Date(opTs + 10 * 60 * 1000).toISOString();
                  const { rows: candidateOrders } = await pool.query(
                    `SELECT id FROM orders
                     WHERE status = 'open'
                       AND aqsi_payment_operation_id IS NULL
                       AND aqsi_payment_operation_at IS NOT NULL
                       AND aqsi_payment_operation_at BETWEEN $1 AND $2
                     ORDER BY aqsi_payment_operation_at DESC
                     LIMIT 1`,
                    [windowStart, windowEnd]
                  ).catch(() => ({ rows: [] }));
                  if (candidateOrders.length > 0) {
                    linkedOrderId = candidateOrders[0].id;
                    blockerSource = 'stale_order';
                  }
                }

                await pool.query(
                  `INSERT INTO aqsi_terminal_blockers
                     (device_id, operation_id, op_status, is_cancellation_requested, source, order_id, last_seen_at)
                   VALUES ($1, $2, $3, $4, $5, $6, NOW())
                   ON CONFLICT (operation_id) DO UPDATE SET
                     op_status = EXCLUDED.op_status,
                     is_cancellation_requested = EXCLUDED.is_cancellation_requested,
                     last_seen_at = NOW()`,
                  [deviceId, conflictingOpId, blockerStatus, blockerCancelFlag, blockerSource, linkedOrderId]
                ).catch((e) => logger.error('orders', { action: 'blocker_insert_failed', operation_id: conflictingOpId, message: e.message }));

                logger.warn('orders', {
                  action: 'terminal_blocker_recorded',
                  order_id: orderId,
                  operation_id: conflictingOpId,
                  op_status: blockerStatus,
                  source: blockerSource,
                  linked_order_id: linkedOrderId,
                });
              }
            } catch (_) {}
          }
          return { type: 'conflict', conflictingOperationId: conflictingOpId };
        }
        // slipOp set by retry — fall through to normal flow
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const paymentOperationId = slipOp.operationId;

  try {
    await pool.query(
      'UPDATE orders SET aqsi_payment_operation_id = $1, aqsi_payment_operation_at = NOW(), aqsi_payment_status = NULL WHERE id = $2',
      [paymentOperationId, orderId]
    );
  } catch (dbErr) {
    logger.error('orders', { action: 'save_payment_op_id_CRITICAL', order_id: orderId, payment_operation_id: paymentOperationId, message: dbErr.message });

    try { await cancelOperation(paymentOperationId); } catch (cancelErr) {
      logger.error('orders', { action: 'cancel_lost_payment_failed', order_id: orderId, payment_operation_id: paymentOperationId, message: cancelErr.message });
    }

    let actualStatus = null;
    try {
      const op = await getOperation(paymentOperationId);
      actualStatus = op.status;
    } catch (getErr) {
      logger.error('orders', { action: 'get_lost_payment_status_failed', order_id: orderId, payment_operation_id: paymentOperationId, message: getErr.message });
    }

    const TERMINAL_FAILED = new Set(['Canceled', 'Timeout', 'Error']);
    if (TERMINAL_FAILED.has(actualStatus)) {
      await pool.query('UPDATE orders SET aqsi_payment_status = NULL WHERE id = $1', [orderId]).catch(() => {});
      throw httpError(500, 'Ошибка сохранения ID платежа — операция отменена на кассе, повторите попытку');
    }

    const detail = `Ошибка сохранения данных платежа. Статус на кассе: ${actualStatus ?? 'неизвестен'} (ID: ${paymentOperationId}). Проверьте терминал и обратитесь к администратору.`;
    const specialErr = new Error(detail);
    specialErr.statusCode = 500;
    specialErr.payment_operation_id = paymentOperationId;
    throw specialErr;
  }

  logger.info('orders', { action: 'payment_initiated', order_id: orderId, payment_operation_id: paymentOperationId, amount_kopeks: amountKopeks });
  return { type: 'ok', operationId: paymentOperationId };
}

// ── syncSlip ──────────────────────────────────────────────────────────────────
// Один вызов — максимум один GET к AQSI (без polling).
// Если slip оплачен → создаёт receipt op и возвращает pending.
// Если receipt op создана → проверяет её статус одним GET.
// Returns: { status, ... }
// Throws: httpError(404), plain Error for 500

async function syncSlip(orderId) {
  const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = orderRows[0];

  if (!order) throw httpError(404, 'Заказ не найден');

  // Slip paid and receipt operation already created → check receipt status (single GET, no polling)
  if (order.aqsi_slip_id && order.aqsi_receipt_operation_id) {
    return checkReceiptOp(orderId, order.aqsi_receipt_operation_id);
  }

  // Slip paid but receipt not yet created → create receipt operation and return pending
  if (order.aqsi_slip_id && !order.aqsi_receipt_operation_id) {
    const slipContent = await recoverSlipContentForReceipt(order, order.aqsi_slip_id, 'sync_slip');
    if (!slipContent) {
      const msg = 'Оплата прошла, но не удалось восстановить данные слипа для фискализации — используйте «Восстановить» или проверьте операцию в AQSI';
      logger.error('orders', { action: 'sync_slip_missing_slip_content', order_id: orderId, slip_id: order.aqsi_slip_id });
      await pool.query(
        'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
        [orderId, 'error', msg]
      ).catch(() => {});
      return { status: 'receipt_error', message: msg };
    }
    return startReceiptOp(orderId, order.aqsi_slip_id, slipContent);
  }

  // No payment operation at all
  if (!order.aqsi_payment_operation_id) return { status: 'no_payment_operation' };

  // Payment operation active — check its status
  let paymentOp;
  try {
    paymentOp = await getOperation(order.aqsi_payment_operation_id);
  } catch (err) {
    throw err;
  }

  const PENDING = new Set(['Pending', 'Processing', 'Finishing']);
  if (PENDING.has(paymentOp.status)) {
    return { status: 'pending', operation_status: paymentOp.status };
  }

  if (paymentOp.status === 'Canceled') {
    await clearPaymentState(orderId, { status: 'cancelled' });
    return { status: 'cancelled' };
  }

  if (paymentOp.status === 'Timeout' || paymentOp.status === 'Error') {
    const msg = paymentOp.status === 'Timeout' ? 'Время ожидания оплаты истекло' : (paymentOp.message || 'Ошибка оплаты');
    await clearPaymentState(orderId, { status: 'failed', error: msg });
    return { status: 'failed', message: msg };
  }

  if (paymentOp.status !== 'Completed') {
    return { status: 'pending', operation_status: paymentOp.status };
  }

  // Completed — parse result to verify actual payment success
  const slipData = extractSlipResultData(paymentOp);
  if (!slipData || !slipData.content) {
    await clearPaymentState(orderId, { status: 'failed', error: 'Нет данных результата оплаты' });
    logger.error('orders', { action: 'slip_result_missing', order_id: orderId, result: paymentOp.result });
    return { status: 'failed', message: 'Нет данных результата оплаты' };
  }

  if (!isSlipPaid(slipData)) {
    await clearPaymentState(orderId, { status: 'declined' });
    const rc = slipData.content.responseCode;
    const msg = slipData.content.responseMessage || `Оплата отклонена (код ${rc || '?'})`;
    logger.info('orders', { action: 'slip_declined', order_id: orderId, response_code: rc });
    return { status: 'declined', message: msg };
  }

  // Payment confirmed — save slip ID, then create receipt operation
  const realSlipId = slipData.id ?? null;
  logger.info('orders', { action: 'slip_paid', order_id: orderId, slip_id: realSlipId });

  await pool.query(
    'UPDATE orders SET aqsi_slip_id = $1, aqsi_payment_status = $2 WHERE id = $3',
    [realSlipId, 'completed', orderId]
  ).catch(() => {});

  // Create receipt operation and return pending — receipt status checked on next poll
  return startReceiptOp(orderId, realSlipId, slipData.content ?? null);
}

// ── syncAqsiV4 ────────────────────────────────────────────────────────────────
// Recovery: resume from any intermediate v4 state.
// Returns: { status, ... }
// Throws: httpError(404), plain Error for 500

async function syncAqsiV4(orderId) {
  const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  let currentOrder = orderRows[0];

  if (!currentOrder) throw httpError(404, 'Заказ не найден');
  if (currentOrder.status !== 'open') return { status: 'already_closed' };

  if (!currentOrder.aqsi_payment_operation_id && !currentOrder.aqsi_slip_id && !currentOrder.aqsi_receipt_operation_id) {
    return { status: 'no_active_flow' };
  }

  // Step 1: payment operation active but slip not yet saved
  if (currentOrder.aqsi_payment_operation_id && !currentOrder.aqsi_slip_id) {
    let paymentOp;
    try {
      paymentOp = await getOperation(currentOrder.aqsi_payment_operation_id);
    } catch (err) {
      throw err;
    }

    const PENDING = new Set(['Pending', 'Processing', 'Finishing']);
    if (PENDING.has(paymentOp.status)) {
      return { status: 'payment_pending', operation_status: paymentOp.status };
    }

    if (paymentOp.status !== 'Completed') {
      const msg = paymentOp.message || `Оплата не прошла (${paymentOp.status})`;
      await clearPaymentState(orderId, { status: 'failed', error: msg });
      return { status: 'payment_failed', message: msg };
    }

    const slipData = extractSlipResultData(paymentOp);
    if (!slipData || !isSlipPaid(slipData)) {
      await clearPaymentState(orderId, { status: 'declined' });
      const rc = slipData?.content?.responseCode;
      return { status: 'payment_declined', message: slipData?.content?.responseMessage || `Оплата отклонена (код ${rc || '?'})` };
    }

    const realSlipId = slipData.id ?? null;
    await pool.query(
      'UPDATE orders SET aqsi_slip_id = $1, aqsi_payment_status = $2 WHERE id = $3',
      [realSlipId, 'completed', orderId]
    ).catch(() => {});

    const { rows: refreshed } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    currentOrder = refreshed[0];
  }

  // Step 2: slip saved but no receipt operation — create one
  if (currentOrder.aqsi_slip_id && !currentOrder.aqsi_receipt_operation_id) {
    // Atomically claim receipt creation — prevents parallel sync-aqsi-v4 calls
    // from each creating their own receipt for the same slip
    const { rowCount: claimed } = await pool.query(
      `UPDATE orders SET aqsi_receipt_status = 'pending', aqsi_error = NULL
       WHERE id = $1 AND aqsi_slip_id IS NOT NULL AND aqsi_receipt_operation_id IS NULL
         AND (aqsi_receipt_status IS NULL OR aqsi_receipt_status = 'error')`,
      [orderId]
    ).catch(() => ({ rowCount: 0 }));

    if (claimed === 0) {
      return { status: 'receipt_pending', message: 'Фискализация в процессе' };
    }

    const { rows: itemRows } = await pool.query(
      'SELECT oi.*, p.marking_type FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY oi.created_at',
      [orderId]
    );
    const freshOrder = { ...currentOrder, items: itemRows };

    const markedItems = itemRows.filter((i) => i.marking_code);
    logger.info('orders', {
      action: 'sync_v4_create_receipt',
      order_id: orderId,
      slip_id: currentOrder.aqsi_slip_id,
      marked_items: markedItems.map((i) => ({
        name: i.name,
        marking_code_hex: Buffer.from(String(i.marking_code)).toString('hex'),
        nomenclature_code: i.marking_code,
        marking_type: i.marking_type,
      })),
    });

    // Try to recover slip content for the receipt payload.
    const slipContentForReceipt = await recoverSlipContentForReceipt(
      currentOrder,
      currentOrder.aqsi_slip_id,
      'sync_v4'
    );
    if (!slipContentForReceipt) {
      const msg = 'Оплата прошла, но не удалось восстановить данные слипа для фискализации';
      logger.error('orders', { action: 'sync_v4_missing_slip_content', order_id: orderId, slip_id: currentOrder.aqsi_slip_id });
      await pool.query(
        'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
        [orderId, 'error', msg]
      ).catch(() => {});
      return { status: 'receipt_error', message: msg };
    }

    let receiptOpId;
    try {
      const receiptPayload = buildAqsiV4ReceiptPayload(freshOrder, 'card', currentOrder.aqsi_slip_id, slipContentForReceipt);
      const receiptOpResponse = await sendV4ReceiptRequest(receiptPayload);
      receiptOpId = receiptOpResponse.operationId;
    } catch (err) {
      await pool.query(
        'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
        [orderId, 'error', err.message]
      ).catch(() => {});
      return { status: 'receipt_error', message: err.message };
    }

    await pool.query(
      'UPDATE orders SET aqsi_receipt_operation_id = $1, aqsi_receipt_status = $2, aqsi_error = NULL WHERE id = $3',
      [receiptOpId, 'pending', orderId]
    ).catch(() => {});

    const { rows: refreshed } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    currentOrder = refreshed[0];
  }

  // Step 3: check receipt operation
  if (!currentOrder.aqsi_receipt_operation_id) {
    return { status: currentOrder.aqsi_receipt_status || 'no_receipt_op' };
  }

  let receiptOp;
  try {
    receiptOp = await getOperation(currentOrder.aqsi_receipt_operation_id);
  } catch (err) {
    throw err;
  }

  const PENDING_RECEIPT = new Set(['Pending', 'Processing', 'Finishing']);
  if (PENDING_RECEIPT.has(receiptOp.status)) {
    return { status: 'receipt_pending', operation_status: receiptOp.status };
  }

  if (receiptOp.status !== 'Completed') {
    const msg = receiptOp.status === 'Timeout' ? 'Тайм-аут фискализации' : (receiptOp.message || `Ошибка фискализации (${receiptOp.status})`);
    await pool.query(
      'UPDATE orders SET aqsi_receipt_operation_id = NULL, aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
      [orderId, 'error', msg]
    ).catch(() => {});
    return { status: 'receipt_error', message: msg };
  }

  const fiscalData = extractReceiptFiscalData(receiptOp);

  // Completed без docInfo — пробуем найти чек через список AQSI по slip ID
  if (!fiscalData || !fiscalData.fiscal_fd || !fiscalData.fiscal_fn || !fiscalData.fiscal_fp) {
    const noFiscalMsg = 'Чек завершён, но реквизиты ФД/ФН/ФП не получены — используйте «Восстановить»';
    logger.error('orders', { action: 'sync_v4_receipt_no_docinfo', order_id: orderId, raw_result: receiptOp.result });

    if (currentOrder.aqsi_slip_id) {
      try {
        // listAqsiReceipts требует обязательные filtered.processedAtTzFrom/To — берём из времени операции
        const opTs = currentOrder.aqsi_payment_operation_at
          ? new Date(currentOrder.aqsi_payment_operation_at).getTime()
          : Date.now();
        const receiptsResponse = await listAqsiReceipts({
          'filtered.processedAtTzFrom': new Date(opTs - 2 * 60 * 60 * 1000).toISOString(),
          'filtered.processedAtTzTo': new Date(opTs + 2 * 60 * 60 * 1000).toISOString(),
          'filtered.type': 1,
        });
        const items = Array.isArray(receiptsResponse?.items) ? receiptsResponse.items : [];
        const found = items.find((r) => r.slipId === currentOrder.aqsi_slip_id || r.slip?.id === currentOrder.aqsi_slip_id) ?? items[0] ?? null;
        if (found) {
          logger.info('orders', { action: 'sync_v4_found_receipt_in_list', order_id: orderId, receipt_id: found.id });
          const docInfo = found.docInfo ?? found.info?.docInfo ?? null;
          const fd = docInfo?.docNumber != null ? String(docInfo.docNumber) : null;
          const fn = docInfo?.fiscalStorageNumber ?? null;
          const fp = docInfo?.docFiscalAttributeInt != null
            ? String(docInfo.docFiscalAttributeInt)
            : (docInfo?.docFiscalAttribute ?? null);

          if (fd && fn && fp) {
            const fiscal_kkt_reg = docInfo?.deviceRegNumber ?? null;
            const fiscal_date = found.info?.dateTime ?? found.dateTime ?? null;
            const receipt_id = found.id ?? null;

            await pool.query(
              `UPDATE orders SET
                 fiscal_fd = COALESCE($2, fiscal_fd),
                 fiscal_fn = COALESCE($3, fiscal_fn),
                 fiscal_fp = COALESCE($4, fiscal_fp),
                 fiscal_kkt_reg = COALESCE($5, fiscal_kkt_reg),
                 fiscal_date = COALESCE($6, fiscal_date),
                 aqsi_receipt_id = COALESCE($7, aqsi_receipt_id),
                 aqsi_receipt_status = 'completed'
               WHERE id = $1`,
              [orderId, fd, fn, fp, fiscal_kkt_reg, fiscal_date, receipt_id]
            );

            await confirmOpenOrderPayment(orderId, 'card');

            await pool.query(
              `UPDATE orders SET
                 aqsi_payment_operation_id = NULL,
                 aqsi_payment_operation_at = NULL,
                 aqsi_payment_status = NULL,
                 aqsi_receipt_operation_id = NULL,
                 aqsi_error = NULL
               WHERE id = $1`,
              [orderId]
            ).catch(() => {});

            logger.info('orders', { action: 'sync_v4_recovered_from_receipt_list', order_id: orderId });
            return { status: 'confirmed', has_marking_errors: false };
          }
        }
      } catch (searchErr) {
        logger.warn('orders', { action: 'sync_v4_receipt_search_failed', order_id: orderId, message: searchErr.message });
      }
    }

    await pool.query(
      'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
      [orderId, 'error', noFiscalMsg]
    ).catch(() => {});
    return { status: 'receipt_error', message: noFiscalMsg };
  }

  const hasMarkingErrors = Boolean(fiscalData.has_marking_errors);
  if (hasMarkingErrors) {
    logger.warn('orders', { action: 'marking_code_errors_sync_v4', order_id: orderId });
  }

  try {
    await pool.query(
      `UPDATE orders SET
         fiscal_fd = COALESCE($2, fiscal_fd),
         fiscal_fn = COALESCE($3, fiscal_fn),
         fiscal_fp = COALESCE($4, fiscal_fp),
         fiscal_kkt_reg = COALESCE($5, fiscal_kkt_reg),
         fiscal_date = COALESCE($6, fiscal_date),
         aqsi_receipt_id = COALESCE($9, aqsi_receipt_id),
         aqsi_receipt_status = $7,
         aqsi_error = CASE WHEN $8 THEN 'Ошибка маркировки ГИС МТ (тег 2107 ФФД 1.2)' ELSE aqsi_error END
       WHERE id = $1`,
      [orderId, fiscalData.fiscal_fd, fiscalData.fiscal_fn, fiscalData.fiscal_fp, fiscalData.fiscal_kkt_reg, fiscalData.fiscal_date, hasMarkingErrors ? 'marking_error' : 'completed', hasMarkingErrors, fiscalData.receipt_id ?? null]
    );
  } catch (dbErr) {
    logger.error('orders', { action: 'sync_v4_save_fiscal_failed', order_id: orderId, message: dbErr.message });
    throw httpError(500, `Чек фискализирован, но реквизиты не сохранились в CRM: ${dbErr.message}`);
  }

  try {
    await confirmOpenOrderPayment(orderId, 'card');
  } catch (err) {
    logger.error('orders', { action: 'confirm_sync_v4_failed', order_id: orderId, message: err.message });
    throw httpError(500, `Фискализация прошла, но ошибка закрытия заказа: ${err.message}`);
  }

  await pool.query(
    `UPDATE orders SET
       aqsi_payment_operation_id = NULL,
       aqsi_payment_operation_at = NULL,
       aqsi_payment_status = NULL,
       aqsi_receipt_operation_id = NULL,
       aqsi_error = NULL
     WHERE id = $1`,
    [orderId]
  ).catch(() => {});

  return { status: 'confirmed', has_marking_errors: hasMarkingErrors };
}

// ── cancelPayment ─────────────────────────────────────────────────────────────
// Returns: { status, operation_status?, message? }
// Throws: httpError(404/409/500)

async function cancelPayment(orderId) {
  const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = orderRows[0];

  if (!order) throw httpError(404, 'Заказ не найден');
  if (!order.aqsi_payment_operation_id) throw httpError(409, 'Нет активного платежа');

  const operationId = order.aqsi_payment_operation_id;
  let op = null;
  if (order.aqsi_payment_status !== 'cancelling') {
    try {
      op = await cancelOperation(operationId);
    } catch (err) {
      logger.error('orders', { action: 'cancel_payment_op_failed', order_id: orderId, message: err.message });
    }
  }

  if (!op) {
    try {
      op = await getOperation(operationId);
    } catch (err) {
      logger.error('orders', { action: 'cancel_payment_get_op_failed', order_id: orderId, message: err.message });
      throw httpError(500, `Не удалось проверить статус операции на кассе: ${err.message}`);
    }
  }

  const opStatus = op?.status ?? null;
  if (opStatus === 'Completed' || opStatus === 'Finishing') {
    return resolvePaymentCancelStatus(orderId, operationId, op);
  }

  await clearPaymentState(orderId, { status: 'cancelled' });
  await resolveBlockerRecord(operationId, opStatus && TERMINAL_CANCELLED_STATUSES.has(opStatus) ? opStatus : 'cancel_requested');

  logger.info('orders', {
    action: 'cancel_payment_released_order',
    order_id: orderId,
    operation_id: operationId,
    op_status: opStatus,
    cancellation_requested: Boolean(op?.isCancellationRequested),
  });

  return {
    status: 'cancelled',
    operation_status: opStatus,
    cancellation_requested: Boolean(op?.isCancellationRequested),
    message: 'Отмена отправлена на кассу. Чек разблокирован, можно изменить товары и отправить оплату заново.',
  };
}

async function resolvePaymentCancelStatus(orderId, operationId, op = null) {
  const operation = op ?? await getOperation(operationId);
  const opStatus = operation?.status ?? null;

  if (TERMINAL_CANCELLED_STATUSES.has(opStatus)) {
    await clearPaymentState(orderId, { status: 'cancelled' });
    await resolveBlockerRecord(operationId, opStatus);
    logger.info('orders', { action: 'cancel_payment_ok', order_id: orderId, op_status: opStatus });
    return { status: 'cancelled', operation_status: opStatus };
  }

  if (opStatus === 'Completed' || opStatus === 'Finishing') {
    logger.warn('orders', { action: 'cancel_payment_too_late', order_id: orderId, op_status: opStatus });
    return {
      status: opStatus === 'Completed' ? 'completed' : 'finishing',
      operation_status: opStatus,
      message: opStatus === 'Completed'
        ? 'Оплата прошла до отмены — продолжаем фискализацию'
        : 'Операция уже завершается и не может быть отменена — ожидаем результат оплаты',
    };
  }

  await pool.query(
    'UPDATE orders SET aqsi_payment_status = $2, aqsi_error = $3 WHERE id = $1',
    [orderId, 'cancelling', 'Отмена отправлена на терминал. Подтвердите отмену на кассе.']
  ).catch(() => {});

  logger.info('orders', {
    action: 'cancel_payment_waiting_terminal',
    order_id: orderId,
    op_status: opStatus,
    cancellation_requested: Boolean(operation?.isCancellationRequested),
  });
  return {
    status: 'cancel_pending',
    operation_status: opStatus,
    cancellation_requested: Boolean(operation?.isCancellationRequested),
    message: 'Отмена отправлена на терминал. Подтвердите отмену на кассе.',
  };
}

async function checkPaymentCancelStatus(orderId) {
  const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = orderRows[0];

  if (!order) throw httpError(404, 'Заказ не найден');
  if (!order.aqsi_payment_operation_id) {
    return { status: 'no_payment_operation' };
  }

  return resolvePaymentCancelStatus(orderId, order.aqsi_payment_operation_id);
}

// ── cancelAqsiOperation ───────────────────────────────────────────────────────
// Polls up to 30s after cancel (10 × 3s) to confirm terminal response.
// Returns: { cancelled, paid?, status? }
// Throws: plain Error for 500

async function cancelAqsiOperation(orderId, operationId) {
  const BLOCKER_SAFE = new Set(['Canceled', 'Timeout', 'Error']);
  const TERMINAL = new Set(['Canceled', 'Timeout', 'Error', 'Completed']);

  await cancelOperation(operationId).catch(() => {});

  let op = null;
  let status = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
    try {
      op = await getOperation(operationId);
      status = op?.status ?? null;
    } catch (_) {}
    if (status && TERMINAL.has(status)) break;
  }

  if (status && BLOCKER_SAFE.has(status)) {
    await resolveBlockerRecord(operationId, status);
    await clearPaymentStateByOperation(operationId, { status: 'cancelled' }).catch((err) => {
      logger.error('orders', { action: 'clear_order_by_operation_failed', operation_id: operationId, message: err.message });
    });
  } else if (status === 'Completed') {
    await pool.query(
      `UPDATE aqsi_terminal_blockers
         SET op_status = 'completed_needs_reconciliation', last_seen_at = NOW()
       WHERE operation_id = $1`,
      [operationId]
    ).catch((err) => logger.error('orders', { action: 'blocker_update_db_failed', operation_id: operationId, message: err.message }));
  } else if (status) {
    await pool.query(
      `UPDATE aqsi_terminal_blockers
         SET op_status = $2, is_cancellation_requested = $3, last_seen_at = NOW()
       WHERE operation_id = $1`,
      [operationId, status, Boolean(op?.isCancellationRequested)]
    ).catch((err) => logger.error('orders', { action: 'blocker_update_db_failed', operation_id: operationId, message: err.message }));
  }

  if (status && BLOCKER_SAFE.has(status)) {
    logger.info('orders', { action: 'cancel_aqsi_operation_ok', order_id: orderId, operation_id: operationId, status });
    return { cancelled: true };
  }

  if (status === 'Completed') {
    logger.warn('orders', { action: 'cancel_aqsi_operation_completed', order_id: orderId, operation_id: operationId });
    return { cancelled: false, paid: true, status: 'Completed' };
  }

  logger.warn('orders', { action: 'cancel_aqsi_operation_pending', order_id: orderId, operation_id: operationId, status });
  return { cancelled: false, status };
}

// ── forceClearBlocker ─────────────────────────────────────────────────────────
// Принудительная очистка блокирующей операции.
// Пытается отменить через AQSI, ждёт 5с, затем снимает блокировку в нашей БД
// вне зависимости от ответа AQSI — кроме Completed (деньги могли быть списаны).
// Returns: { resolved, was_status, message? }
// Throws: plain Error for 500

async function forceClearBlocker(operationId) {
  // Try to cancel on AQSI side
  await cancelOperation(operationId).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));

  let op = null;
  let status = null;
  try {
    op = await getOperation(operationId);
    status = op?.status ?? null;
  } catch (err) {
    logger.warn('orders', { action: 'force_clear_get_op_failed', operation_id: operationId, message: err.message });
    status = null;
  }

  if (status === 'Completed') {
    logger.warn('orders', { action: 'force_clear_blocked_completed', operation_id: operationId });
    return {
      resolved: false,
      was_status: status,
      message: 'Операция завершена с оплатой — возможно, деньги были списаны. Проверьте терминал.',
    };
  }

  // Anything else (Processing, Pending, Canceled, Error, null) — force-resolve our DB record
  await resolveBlockerRecord(operationId, status && TERMINAL_CANCELLED_STATUSES.has(status) ? status : 'manual_cleared');
  await clearPaymentStateByOperation(operationId, {
    status: 'cancelled',
    error: status && TERMINAL_ACTIVE_STATUSES.has(status)
      ? 'Оплата вручную помечена как отмененная на кассе. Если AQSI снова вернет блокировку, проверьте терминал.'
      : null,
  });

  logger.info('orders', { action: 'force_clear_blocker_ok', operation_id: operationId, was_status: status });
  return { resolved: true, was_status: status };
}

// ── recoverTerminalBlocker ────────────────────────────────────────────────────
// resolved=true только для Canceled/Timeout/Error.
// Completed НЕ считается resolved — возможна оплата, нужна ручная reconciliation.
// Returns: { resolved, status, paid?, slip_id?, message? }
// Throws: httpError(500)

async function recoverTerminalBlocker(operationId) {
  let op;
  try {
    op = await getOperation(operationId);
  } catch (err) {
    throw httpError(500, `Не удалось получить статус операции: ${err.message}`);
  }

  const status = op?.status ?? null;
  if (TERMINAL_CANCELLED_STATUSES.has(status)) {
    await resolveBlockerRecord(operationId, status);
    await clearPaymentStateByOperation(operationId, { status: 'cancelled' }).catch((err) => {
      logger.error('orders', { action: 'clear_order_by_operation_failed', operation_id: operationId, message: err.message });
    });
    logger.info('orders', { action: 'recover_blocker_resolved', operation_id: operationId, status });
    return { resolved: true, status };
  }

  if (status === 'Completed') {
    const slipData = extractSlipResultData(op);
    const paid = slipData ? isSlipPaid(slipData) : false;
    const slipId = slipData?.id ?? slipData?.content?.slipId ?? null;

    let foundSlipId = slipId;
    if (!foundSlipId && op.createdAt) {
      try {
        const opTs = new Date(op.createdAt).getTime();
        const from = new Date(opTs - 30 * 60 * 1000).toISOString();
        const to = new Date(opTs + 30 * 60 * 1000).toISOString();
        const slipsResponse = await listAqsiSlips({
          'filtered.processedAtTzFrom': from,
          'filtered.processedAtTzTo': to,
        });
        const items = Array.isArray(slipsResponse?.items) ? slipsResponse.items : [];

        const amountKopeks = slipData?.content?.amount ?? slipData?.amount ?? null;

        let candidate = items.find((s) => s.operationId === operationId) ?? null;
        if (!candidate) {
          const purchaseItems = items.filter((s) => {
            const t = s.slipType ?? s.type ?? s.operationType ?? null;
            return !t || t === 'Purchase' || t === 'purchase';
          });
          if (amountKopeks !== null) {
            candidate = purchaseItems.find((s) => {
              const sAmt = s.amount ?? s.totalAmount ?? null;
              return sAmt !== null && Math.abs(Number(sAmt) - Number(amountKopeks)) <= 1;
            }) ?? null;
          }
          if (!candidate && purchaseItems.length === 1) candidate = purchaseItems[0];
          if (!candidate && purchaseItems.length > 1) {
            logger.warn('orders', { action: 'recover_blocker_slip_ambiguous', operation_id: operationId, count: purchaseItems.length });
          }
        }
        if (candidate) foundSlipId = candidate.id ?? null;
      } catch (slipErr) {
        logger.warn('orders', { action: 'recover_blocker_slip_search_failed', operation_id: operationId, message: slipErr.message });
      }
    }

    await pool.query(
      `UPDATE aqsi_terminal_blockers
         SET op_status = 'completed_needs_reconciliation',
             is_cancellation_requested = $2,
             last_seen_at = NOW()
       WHERE operation_id = $1`,
      [operationId, Boolean(op?.isCancellationRequested)]
    ).catch((err) => logger.error('orders', { action: 'blocker_update_db_failed', operation_id: operationId, message: err.message }));

    logger.warn('orders', { action: 'recover_blocker_completed', operation_id: operationId, paid, slip_id: foundSlipId });
    if (!paid) {
      await resolveBlockerRecord(operationId, 'completed_without_payment');
      await clearPaymentStateByOperation(operationId, { status: 'cancelled' }).catch((err) => {
        logger.error('orders', { action: 'clear_order_by_operation_failed', operation_id: operationId, message: err.message });
      });
      return {
        resolved: true,
        status,
        paid,
        slip_id: foundSlipId,
        message: 'Операция завершена без оплаты. Блокировка снята, можно повторить оплату.',
      };
    }

    return {
      resolved: false,
      status,
      paid,
      slip_id: foundSlipId,
      message: paid
        ? `Операция завершена с оплатой (slip ${foundSlipId ?? '?'}). Требует ручной проверки — обратитесь к администратору.`
        : 'Операция завершена без оплаты. Можно повторить оплату.',
    };
  }

  // Pending/Processing/Finishing — ещё занято
  await pool.query(
    `UPDATE aqsi_terminal_blockers
       SET op_status = $2, is_cancellation_requested = $3, last_seen_at = NOW()
     WHERE operation_id = $1`,
    [operationId, status, Boolean(op?.isCancellationRequested)]
  ).catch((err) => logger.error('orders', { action: 'blocker_update_db_failed', operation_id: operationId, message: err.message }));

  return { resolved: false, status, message: 'Терминал занят. Подождите или перезагрузите терминал.' };
}

module.exports = {
  clearPaymentState,
  initiatePayment,
  syncSlip,
  syncAqsiV4,
  cancelPayment,
  checkPaymentCancelStatus,
  cancelAqsiOperation,
  forceClearBlocker,
  recoverTerminalBlocker,
};
