const { pool, query } = require('../db');
const {
  extractAqsiFiscalData,
  extractReceiptFiscalData,
  getAqsiOrder,
  isAqsiOrderNotFoundError,
} = require('./aqsi');

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isPaidAqsiOrder(aqsiOrder) {
  if (!aqsiOrder) {
    return false;
  }

  if (aqsiOrder.isPaid === true) {
    return true;
  }

  const status = normalizeStatus(aqsiOrder.status);
  return status === '\u043e\u043f\u043b\u0430\u0447\u0435\u043d' || status === 'paid' || status === 'completed';
}

function detectPaymentType(aqsiOrder) {
  const receipt = aqsiOrder?.receipts?.[0] || null;
  const amounts = receipt?.info?.amounts || null;

  if (amounts) {
    const cash = Number(amounts.cash || 0);
    const cashless = Number(amounts.cashless || 0);

    if (cash > 0 && cashless === 0) {
      return 'cash';
    }

    if (cashless > 0 && cash === 0) {
      return 'card';
    }
  }

  const payments = Array.isArray(receipt?.payments) ? receipt.payments : [];

  for (const payment of payments) {
    const type = Number(payment?.type);

    if (type === 0) {
      return 'cash';
    }

    if (type === 1) {
      return 'card';
    }
  }

  return null;
}

function toPositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toDateOnly(value) {
  return value.toISOString().slice(0, 10);
}

function addDays(dateOnly, days) {
  const start = new Date(`${dateOnly}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + days);
  return toDateOnly(start);
}

async function activateOrderServices(client, order) {
  const { rows: serviceItems } = await client.query(
    `SELECT
       oi.id,
       COALESCE(oi.recipient_client_id, $2) AS recipient_client_id,
       oi.product_id,
       oi.kind,
       oi.quantity,
       psp.subscription_type,
       psp.visits_total,
       psp.validity_days,
       psp.activation_type
     FROM order_items oi
     LEFT JOIN product_subscription_params psp ON psp.product_id = oi.product_id
     WHERE oi.order_id = $1
       AND oi.kind IN ('service', 'subscription')`,
    [order.id, order.client_id]
  );

  for (const item of serviceItems) {
    if (!item.product_id || !item.subscription_type) {
      continue;
    }
    if (!item.recipient_client_id) throw new Error('Выберите получателя каждой услуги');
    await client.query('UPDATE order_items SET recipient_client_id = $2 WHERE id = $1', [item.id, item.recipient_client_id]);

    const quantity = toPositiveInteger(item.quantity) ?? 1;
    const visitsPerUnit =
      toPositiveInteger(item.visits_total) ?? (item.subscription_type === 'single' ? 1 : null);
    const totalVisits = visitsPerUnit ? visitsPerUnit * quantity : null;
    const validityPerUnit = toPositiveInteger(item.validity_days);
    const validityDays = validityPerUnit ? validityPerUnit * quantity : null;
    const startedAt =
      item.activation_type === 'purchase' ? toDateOnly(new Date()) : null;
    const expiresAt =
      validityDays && startedAt ? addDays(startedAt, validityDays) : null;

    await client.query(
      `UPDATE client_subscriptions
       SET status = 'expired', updated_at = NOW()
       WHERE client_id = $1
         AND product_id = $2
         AND status = 'active'
         AND order_id IS DISTINCT FROM $3`,
      [item.recipient_client_id, item.product_id, order.id]
    );

    await client.query(
      `INSERT INTO client_subscriptions
        (client_id, product_id, type, visits_total, visits_left,
         started_at, expires_at, order_id, status, order_item_id)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, 'active', $8)`,
      [
        item.recipient_client_id,
        item.product_id,
        item.subscription_type,
        totalVisits,
        startedAt,
        expiresAt,
        order.id,
        item.id,
      ]
    );
  }
}

async function fulfillConfirmedOrder(orderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: orderRows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = orderRows[0];
    if (!order || order.status !== 'confirmed' || order.fulfillment_status === 'completed') {
      await client.query('COMMIT');
      return { completed: order?.fulfillment_status === 'completed', error: order?.fulfillment_error ?? null };
    }

    const { rows: items } = await client.query(
      `SELECT oi.*, pt.has_stock
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN product_types pt ON pt.id = p.product_type_id
       WHERE oi.order_id = $1
         AND oi.kind = 'product'
         AND oi.product_id IS NOT NULL`,
      [orderId]
    );

    for (const item of items) {
      if (!item.has_stock) {
        continue;
      }

      const { rows: stockRows } = await client.query(
        'SELECT stock FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      const currentStock = Number(stockRows[0]?.stock || 0);

      if (currentStock < Number(item.quantity)) {
        throw new Error(`Недостаточно товара для списания (id: ${item.product_id})`);
      }

      await client.query(
        'UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await activateOrderServices(client, order);
    await client.query(
      `UPDATE orders SET
         fulfillment_status = 'completed',
         fulfillment_error = NULL,
         fulfilled_at = COALESCE(fulfilled_at, NOW())
       WHERE id = $1`,
      [orderId]
    );
    await client.query('COMMIT');
    return { completed: true, error: null };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    await pool.query(
      `UPDATE orders SET fulfillment_status = 'error', fulfillment_error = $2 WHERE id = $1`,
      [orderId, error.message]
    );
    console.error(`Order ${orderId} fulfillment failed after payment confirmation`, error);
    return { completed: false, error: error.message };
  } finally {
    client.release();
  }
}

async function confirmOpenOrderPayment(orderId, paymentType = null) {
  const client = await pool.connect();
  let order;
  let changed = false;

  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    order = rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      return { order: null, changed: false, reason: 'not_found' };
    }
    if (order.status === 'open') {
      const confirmed = await client.query(
        `UPDATE orders SET
           status = 'confirmed',
           payment_type = COALESCE($2, payment_type),
           confirmed_at = COALESCE(confirmed_at, NOW()),
           aqsi_sync_attempted_at = COALESCE(aqsi_sync_attempted_at, NOW())
         WHERE id = $1
         RETURNING *`,
        [orderId, paymentType]
      );
      order = confirmed.rows[0];
      changed = true;
    }
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }

  const fulfillment = await fulfillConfirmedOrder(orderId);
  const { rows: [fresh] } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  return {
    order: fresh,
    changed,
    reason: changed ? 'confirmed' : 'already_closed',
    fulfillment,
  };
}

async function saveOrderFiscalData(executor, orderId, aqsiOrder) {
  const fiscalData = extractAqsiFiscalData(aqsiOrder);

  if (!fiscalData) {
    return null;
  }

  const { rows } = await executor.query(
    `UPDATE orders SET
       fiscal_fd = COALESCE($2, fiscal_fd),
       fiscal_fn = COALESCE($3, fiscal_fn),
       fiscal_fp = COALESCE($4, fiscal_fp),
       fiscal_kkt_reg = COALESCE($5, fiscal_kkt_reg),
       fiscal_date = COALESCE($6, fiscal_date)
     WHERE id = $1
     RETURNING *`,
    [
      orderId,
      fiscalData.fiscal_fd ? String(fiscalData.fiscal_fd) : null,
      fiscalData.fiscal_fn ? String(fiscalData.fiscal_fn) : null,
      fiscalData.fiscal_fp ? String(fiscalData.fiscal_fp) : null,
      fiscalData.fiscal_kkt_reg ? String(fiscalData.fiscal_kkt_reg) : null,
      fiscalData.fiscal_date,
    ]
  );

  return rows[0] ?? null;
}

async function fetchAqsiOrderWithFallback(order) {
  const candidates = [order.id];

  if (order.aqsi_receipt_id && order.aqsi_receipt_id !== order.id) {
    candidates.push(order.aqsi_receipt_id);
  }

  let lastError = null;

  for (const candidate of candidates) {
    try {
      return await getAqsiOrder(candidate);
    } catch (error) {
      if (!isAqsiOrderNotFoundError(error)) {
        throw error;
      }

      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

async function syncOrderWithAqsi(orderId, options = {}) {
  const { markAttempt = false } = options;

  const { rows: orderRows } = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = orderRows[0];

  if (!order) {
    return {
      order: null,
      aqsiOrder: null,
      paid: false,
      paymentType: null,
      reason: 'not_found',
    };
  }

  // aqsi_sent_at set but receipt_id missing means send succeeded but DB write of receipt_id failed
  if (!order.aqsi_receipt_id && !order.aqsi_sent_at) {
    return {
      order,
      aqsiOrder: null,
      paid: false,
      paymentType: null,
      reason: 'not_sent',
    };
  }

  if (order.status !== 'open') {
    if (!order.fiscal_fd) {
      try {
        const aqsiOrder = await fetchAqsiOrderWithFallback(order);
        const updatedOrder = await saveOrderFiscalData({ query }, orderId, aqsiOrder);

        return {
          order: updatedOrder ?? order,
          aqsiOrder,
          paid: order.status === 'confirmed',
          paymentType: detectPaymentType(aqsiOrder) || order.payment_type || null,
          reason: 'already_closed',
        };
      } catch (error) {
        console.error(`AQSI fiscal backfill failed for closed order ${orderId}`, error);
      }
    }

    return {
      order,
      aqsiOrder: null,
      paid: order.status === 'confirmed',
      paymentType: order.payment_type || null,
      reason: 'already_closed',
    };
  }

  let aqsiOrder;

  try {
    aqsiOrder = await fetchAqsiOrderWithFallback(order);
  } catch (error) {
    if (isAqsiOrderNotFoundError(error)) {
      if (
        order.aqsi_receipt_status === 'error' &&
        !order.aqsi_receipt_operation_id &&
        !order.aqsi_receipt_id
      ) {
        await query(
          `UPDATE orders SET
             aqsi_sent_at = NULL,
             aqsi_sync_attempted_at = NULL,
             aqsi_receipt_status = NULL,
             aqsi_error = $2
           WHERE id = $1`,
          [orderId, 'AQSI не нашла чек после сетевой ошибки. Заказ разблокирован для повторной отправки.']
        );

        return {
          order,
          aqsiOrder: null,
          paid: false,
          paymentType: null,
          reason: 'aqsi_not_found_unlocked',
        };
      }

      if (markAttempt) {
        // Always update to NOW() so the order gets rechecked on the next pass
        await query(
          'UPDATE orders SET aqsi_sync_attempted_at = NOW() WHERE id = $1',
          [orderId]
        );
      }

      return {
        order,
        aqsiOrder: null,
        paid: false,
        paymentType: null,
        reason: 'aqsi_not_found',
      };
    }

    throw error;
  }

  // Recover missing receipt_id: aqsi_sent_at was set but DB write of receipt_id failed
  if (!order.aqsi_receipt_id && aqsiOrder) {
    await query(
      `UPDATE orders SET aqsi_receipt_id = $1 WHERE id = $2`,
      [String(aqsiOrder.guid || aqsiOrder.id || orderId), orderId]
    );
  }

  const paid = isPaidAqsiOrder(aqsiOrder);
  const paymentType = detectPaymentType(aqsiOrder);

  if (paid) {
    const finalized = await confirmOpenOrderPayment(orderId, paymentType);
    const orderWithFiscalData = (await saveOrderFiscalData({ query }, orderId, aqsiOrder)) ?? finalized.order;

    return {
      order: orderWithFiscalData,
      aqsiOrder,
      paid: true,
      paymentType,
      reason: finalized.reason,
    };
  }

  if (markAttempt) {
    // Always update to NOW() so the order gets rechecked on the next pass
    await query(
      'UPDATE orders SET aqsi_sync_attempted_at = NOW() WHERE id = $1',
      [orderId]
    );
  }

  return {
    order,
    aqsiOrder,
    paid: false,
    paymentType,
    reason: 'not_paid',
  };
}

let recentSyncRunning = false;

// Fast pass: checks open orders sent within the last hour.
// Runs every 30s; skips orders checked within the last 20 seconds.
async function runRecentAqsiSyncPass(limit = 20) {
  if (recentSyncRunning) {
    return 0;
  }

  recentSyncRunning = true;

  try {
    const { rows } = await query(
      `SELECT id
       FROM orders
       WHERE status = 'open'
         AND aqsi_sent_at IS NOT NULL
         AND aqsi_payment_operation_id IS NULL
         AND aqsi_slip_id IS NULL
         AND aqsi_receipt_operation_id IS NULL
         AND aqsi_receipt_status IS NULL
         AND aqsi_sent_at >= NOW() - INTERVAL '1 hour'
         AND (aqsi_sync_attempted_at IS NULL OR aqsi_sync_attempted_at <= NOW() - INTERVAL '20 seconds')
       ORDER BY aqsi_sent_at ASC
       LIMIT $1`,
      [limit]
    );

    for (const row of rows) {
      try {
        await syncOrderWithAqsi(row.id, { markAttempt: true });
      } catch (error) {
        console.error(`AQSI recent sync failed for order ${row.id}`, error);
      }
    }

    return rows.length;
  } finally {
    recentSyncRunning = false;
  }
}

let delayedSyncRunning = false;

// Slow pass: catches open orders older than 30 minutes that slipped through.
// Runs every 5 minutes; skips orders checked within the last 5 minutes.
async function runDelayedAqsiSyncPass(limit = 20) {
  if (delayedSyncRunning) {
    return 0;
  }

  delayedSyncRunning = true;

  try {
    const { rows } = await query(
      `SELECT id
       FROM orders
       WHERE status = 'open'
         AND aqsi_sent_at IS NOT NULL
         AND aqsi_payment_operation_id IS NULL
         AND aqsi_slip_id IS NULL
         AND aqsi_receipt_operation_id IS NULL
         AND aqsi_receipt_status IS NULL
         AND aqsi_sent_at <= NOW() - INTERVAL '30 minutes'
         AND (aqsi_sync_attempted_at IS NULL OR aqsi_sync_attempted_at <= NOW() - INTERVAL '5 minutes')
       ORDER BY aqsi_sent_at ASC
       LIMIT $1`,
      [limit]
    );

    for (const row of rows) {
      try {
        await syncOrderWithAqsi(row.id, { markAttempt: true });
      } catch (error) {
        console.error(`AQSI delayed sync failed for order ${row.id}`, error);
      }
    }

    return rows.length;
  } finally {
    delayedSyncRunning = false;
  }
}

let v4SyncRunning = false;

// The background worker uses the same V4 state machine as manual recovery.
async function runV4SlipSyncPass(limit = 10) {
  if (v4SyncRunning) return 0;
  v4SyncRunning = true;
  try {
    const configuredGraceMs = Number(process.env.AQSI_RECEIPT_GRACE_MS);
    const receiptGraceMs = Number.isFinite(configuredGraceMs) && configuredGraceMs >= 0
      ? configuredGraceMs
      : 10000;
    const { rows } = await query(
      `SELECT *
       FROM orders
       WHERE (
           status = 'open'
           OR (
             status = 'confirmed'
             AND (
               aqsi_receipt_status = 'pending'
               OR (
                 aqsi_slip_id IS NOT NULL
                 AND aqsi_receipt_operation_id IS NULL
                 AND aqsi_receipt_status IS NULL
                 AND confirmed_at <= NOW() - ($2::double precision * INTERVAL '1 millisecond')
               )
             )
           )
         )
         AND (
           aqsi_payment_operation_id IS NOT NULL
           OR aqsi_slip_id IS NOT NULL
           OR aqsi_receipt_operation_id IS NOT NULL
         )
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit, receiptGraceMs]
    );

    for (const row of rows) {
      try {
        // Lazy import avoids the order-sync <-> v4-flow module initialization cycle.
        const { syncAqsiV4 } = require('./aqsi-v4-flow');
        await syncAqsiV4(row.id, { allowReceiptRetry: false });
      } catch (err) {
        console.error(`[v4-sync] failed for order ${row.id}:`, err.message);
      }
    }

    return rows.length;
  } finally {
    v4SyncRunning = false;
  }
}

let delayedSyncTimer = null;

function startDelayedAqsiSyncScheduler() {
  if (!process.env.AQSI_BASE_URL || !process.env.AQSI_API_KEY || !process.env.AQSI_SHOP_ID) {
    return;
  }

  if (delayedSyncTimer) {
    return;
  }

  // Fast scheduler: recent orders every 30 seconds
  const fastIntervalMs = Number(process.env.AQSI_FAST_SYNC_INTERVAL_MS || 30 * 1000);
  const fastTimer = setInterval(() => {
    runRecentAqsiSyncPass().catch((error) => {
      console.error('AQSI recent sync pass failed', error);
    });
  }, fastIntervalMs);
  if (typeof fastTimer.unref === 'function') {
    fastTimer.unref();
  }

  // Slow scheduler: old orders every 5 minutes
  const slowIntervalMs = Number(process.env.AQSI_SYNC_INTERVAL_MS || 5 * 60 * 1000);
  delayedSyncTimer = setInterval(() => {
    runDelayedAqsiSyncPass().catch((error) => {
      console.error('AQSI delayed sync pass failed', error);
    });
  }, slowIntervalMs);
  if (typeof delayedSyncTimer.unref === 'function') {
    delayedSyncTimer.unref();
  }

  // v4 orphan cleanup: every 2 minutes
  const v4Timer = setInterval(() => {
    runV4SlipSyncPass().catch((error) => {
      console.error('AQSI v4 slip sync pass failed', error);
    });
  }, 2 * 60 * 1000);
  if (typeof v4Timer.unref === 'function') {
    v4Timer.unref();
  }

  // Initial run 15 seconds after startup
  const initialRun = setTimeout(() => {
    runRecentAqsiSyncPass().catch((error) => {
      console.error('AQSI initial recent sync pass failed', error);
    });
    runDelayedAqsiSyncPass().catch((error) => {
      console.error('AQSI initial delayed sync pass failed', error);
    });
    runV4SlipSyncPass().catch((error) => {
      console.error('AQSI initial v4 slip sync pass failed', error);
    });
  }, 15000);
  if (typeof initialRun.unref === 'function') {
    initialRun.unref();
  }
}

module.exports = {
  confirmOpenOrderPayment,
  detectPaymentType,
  isPaidAqsiOrder,
  runDelayedAqsiSyncPass,
  runRecentAqsiSyncPass,
  runV4SlipSyncPass,
  saveOrderFiscalData,
  startDelayedAqsiSyncScheduler,
  syncOrderWithAqsi,
};
