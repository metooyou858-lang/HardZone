'use strict';

const { pool, withTransaction } = require('../db');
const aqsi = require('./aqsi');
const logger = require('./logger');

function recoveryError(message) {
  return Object.assign(new Error(message), { statusCode: 409 });
}

async function findReceiptForOrder(order) {
  if (!order.aqsi_slip_id) return null;
  const since = new Date(order.aqsi_payment_operation_at || order.created_at).getTime();
  const until = new Date().toISOString();
  const matches = [];
  let checked = 0;
  for (let page = 1; page <= 100; page += 1) {
    const response = await aqsi.listAqsiReceipts({
      'filtered.processedAtTzFrom': new Date(since - 24 * 60 * 60 * 1000).toISOString(),
      'filtered.processedAtTzTo': until,
      'filtered.type': 1,
      pageSize: 100,
      page,
    });
    if (!Array.isArray(response?.rows) || !Number.isInteger(response.pages) || !Number.isInteger(response.count)) {
      throw recoveryError('Не удалось проверить журнал чеков AQSI. Повторная отправка остановлена.');
    }
    checked += response.rows.length;
    for (const receipt of response.rows) {
      const linked = receipt.payments?.some((payment) => payment.slip?.id === order.aqsi_slip_id);
      if (linked) {
        if (receipt.isNonFiscal || Number(receipt.info?.sum) !== Math.round(Number(order.total_amount) * 100)) {
          throw recoveryError('В AQSI найден чек с несовпадающими реквизитами. Требуется сверка.');
        }
        matches.push(receipt);
      }
    }
    if (page >= response.pages) {
      if (checked !== response.count) throw recoveryError('Журнал чеков AQSI проверен не полностью. Повторите сверку.');
      if (matches.length > 1) throw recoveryError('В AQSI найдено несколько чеков по одной оплате. Требуется сверка.');
      return matches[0] || null;
    }
  }
  throw recoveryError('Журнал чеков AQSI проверен не полностью. Повторная отправка остановлена.');
}

async function retryFailedReceipt(order, failedOperation) {
  const found = await findReceiptForOrder(order);
  if (found) return { operation: { status: 'Completed', result: found } };
  if (!order.aqsi_slip_id || !['Canceled', 'Error', 'Timeout'].includes(failedOperation.status)) {
    throw recoveryError('Для повторной фискализации требуется подтверждённая оплата и завершённая неуспешная операция чека.');
  }
  if (aqsi.extractReceiptFiscalData(failedOperation)) {
    throw recoveryError('Операция содержит фискальные данные, но они неполны. Требуется сверка с AQSI; новый чек не отправлен.');
  }
  const slip = await aqsi.getAqsiSlip(order.aqsi_slip_id);
  if (slip?.id !== order.aqsi_slip_id || !aqsi.isSlipPaid(slip) || slip.content?.type !== 'purchase'
      || Number(slip.content.amount) !== Math.round(Number(order.total_amount) * 100)) {
    throw recoveryError('AQSI не подтвердил оплату на сумму заказа. Повторная фискализация остановлена.');
  }

  const attempt = await withTransaction(async (client) => {
    const { rows: [current] } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [order.id]);
    if (current.status !== 'open' || current.fiscal_fd || current.aqsi_receipt_operation_id !== order.aqsi_receipt_operation_id) return null;
    if (current.aqsi_slip_id !== order.aqsi_slip_id || Number(current.total_amount) !== Number(order.total_amount)) {
      throw recoveryError('Заказ изменился во время проверки. Повторите восстановление.');
    }
    const { rows: [existing] } = await client.query(
      `SELECT status FROM aqsi_receipt_recovery_attempts
       WHERE order_id = $1 AND previous_operation_id = $2 AND status <> 'rejected'`,
      [order.id, order.aqsi_receipt_operation_id]
    );
    if (existing) {
      throw recoveryError('Повторная отправка уже выполнялась. Результат требует сверки с AQSI; новый чек не отправлен.');
    }
    const { rows: items } = await client.query(
      'SELECT oi.*, p.marking_type FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY oi.created_at',
      [order.id]
    );
    if (!items.length || items.some((item) => item.marking_required && !item.marking_code)) {
      throw recoveryError('Не заполнен состав чека или код маркировки. Повторная отправка остановлена.');
    }
    const payload = aqsi.buildAqsiV4ReceiptPayload({ ...current, items }, 'card', slip.id, slip.content);
    const { rows: [record] } = await client.query(
      `INSERT INTO aqsi_receipt_recovery_attempts (order_id, previous_operation_id, status)
       VALUES ($1, $2, 'sending') RETURNING id`, [order.id, order.aqsi_receipt_operation_id]
    );
    return { id: record.id, payload };
  });
  if (!attempt) return { status: 'receipt_pending' };

  let response;
  try {
    response = await aqsi.sendV4ReceiptRequest(attempt.payload);
    if (!response?.operationId) throw new Error('AQSI не вернул идентификатор операции');
  } catch (error) {
    let reason;
    try { reason = JSON.parse(error.message).reason; } catch { /* Ответ сети может не быть JSON. */ }
    // Только явный отказ до создания операции разрешает следующую ручную попытку.
    const rejected = error.isAqsiRejection && reason === 'OperationInProgress';
    await pool.query('UPDATE aqsi_receipt_recovery_attempts SET status = $2, error = $3 WHERE id = $1',
      [attempt.id, rejected ? 'rejected' : 'uncertain', error.message]);
    return { status: 'receipt_error', message: rejected
      ? 'Касса занята другой операцией. Повторите восстановление после её завершения.'
      : 'Результат отправки неизвестен. Требуется сверка с AQSI; повторный чек автоматически не отправляется.' };
  }
  logger.info('orders', { action: 'receipt_recovery_sent', order_id: order.id,
    previous_operation_id: order.aqsi_receipt_operation_id, operation_id: response.operationId, attempt_id: attempt.id });
  await withTransaction(async (client) => {
    await client.query("UPDATE aqsi_receipt_recovery_attempts SET operation_id = $2, status = 'sent' WHERE id = $1", [attempt.id, response.operationId]);
    const updated = await client.query(
      `UPDATE orders SET aqsi_receipt_operation_id = $2, aqsi_receipt_status = 'pending',
       aqsi_payment_status = 'completed', aqsi_error = NULL
       WHERE id = $1 AND status = 'open' AND aqsi_receipt_operation_id = $3`,
      [order.id, response.operationId, order.aqsi_receipt_operation_id]
    );
    if (updated.rowCount !== 1) {
      logger.error('orders', { action: 'receipt_recovery_order_changed', order_id: order.id, operation_id: response.operationId });
    }
  });
  return { status: 'receipt_pending', operation_status: 'Pending' };
}

module.exports = { findReceiptForOrder, retryFailedReceipt };
