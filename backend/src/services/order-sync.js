const { pool, query } = require('../db');
const {
  extractAqsiFiscalData,
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
  if (!order?.client_id) {
    return;
  }

  const { rows: serviceItems } = await client.query(
    `SELECT
       oi.product_id,
       MAX(oi.kind) AS kind,
       SUM(oi.quantity)::int AS quantity,
       psp.subscription_type,
       psp.visits_total,
       psp.validity_days,
       psp.activation_type,
       psp.is_family
     FROM order_items oi
     LEFT JOIN product_subscription_params psp ON psp.product_id = oi.product_id
     WHERE oi.order_id = $1
       AND oi.kind IN ('service', 'subscription')
     GROUP BY
       oi.product_id,
       psp.subscription_type,
       psp.visits_total,
       psp.validity_days,
       psp.activation_type,
       psp.is_family`,
    [order.id]
  );

  for (const item of serviceItems) {
    if (!item.product_id || !item.subscription_type) {
      continue;
    }

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
         AND status = 'active'`,
      [order.client_id, item.product_id]
    );

    await client.query(
      `INSERT INTO client_subscriptions
        (client_id, product_id, type, visits_total, visits_left,
         started_at, expires_at, is_family, order_id, status)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, 'active')`,
      [
        order.client_id,
        item.product_id,
        item.subscription_type,
        totalVisits,
        startedAt,
        expiresAt,
        item.is_family === true,
        order.id,
      ]
    );
  }
}

async function confirmOpenOrderPayment(orderId, paymentType = null) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );
    const order = orderRows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return { order: null, changed: false, reason: 'not_found' };
    }

    if (order.status !== 'open') {
      await client.query('COMMIT');
      return { order, changed: false, reason: 'already_closed' };
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
        await client.query('ROLLBACK');
        throw new Error(`Недостаточно товара для списания (id: ${item.product_id})`);
      }

      await client.query(
        'UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    await activateOrderServices(client, order);

    const { rows: confirmedRows } = await client.query(
      `UPDATE orders SET
         status = 'confirmed',
         payment_type = COALESCE($2, payment_type),
         confirmed_at = COALESCE(confirmed_at, NOW()),
         aqsi_sync_attempted_at = COALESCE(aqsi_sync_attempted_at, NOW())
       WHERE id = $1
       RETURNING *`,
      [orderId, paymentType]
    );

    await client.query('COMMIT');
    return { order: confirmedRows[0], changed: true, reason: 'confirmed' };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Order payment finalize rollback failed', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
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

  if (!order.aqsi_receipt_id) {
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
      if (markAttempt) {
        await query(
          'UPDATE orders SET aqsi_sync_attempted_at = COALESCE(aqsi_sync_attempted_at, NOW()) WHERE id = $1',
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
    await query(
      'UPDATE orders SET aqsi_sync_attempted_at = COALESCE(aqsi_sync_attempted_at, NOW()) WHERE id = $1',
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

let delayedSyncRunning = false;

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
         AND aqsi_receipt_id IS NOT NULL
         AND aqsi_sent_at IS NOT NULL
         AND aqsi_sent_at <= NOW() - INTERVAL '30 minutes'
         AND aqsi_sync_attempted_at IS NULL
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

let delayedSyncTimer = null;

function startDelayedAqsiSyncScheduler() {
  if (delayedSyncTimer) {
    return;
  }

  const intervalMs = Number(process.env.AQSI_SYNC_INTERVAL_MS || 5 * 60 * 1000);

  delayedSyncTimer = setInterval(() => {
    runDelayedAqsiSyncPass().catch((error) => {
      console.error('AQSI delayed sync pass failed', error);
    });
  }, intervalMs);

  if (typeof delayedSyncTimer.unref === 'function') {
    delayedSyncTimer.unref();
  }

  const initialRun = setTimeout(() => {
    runDelayedAqsiSyncPass().catch((error) => {
      console.error('AQSI initial delayed sync pass failed', error);
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
  saveOrderFiscalData,
  startDelayedAqsiSyncScheduler,
  syncOrderWithAqsi,
};
