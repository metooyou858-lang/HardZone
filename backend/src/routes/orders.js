const express = require('express');

const { pool } = require('../db');
const {
  sendOrderToAqsi,
  sendOrderToAqsiV4,
  pollOperation,
  extractReceiptFiscalData,
  sendRefundToAqsi,
  ensureAqsiShiftOpen,
} = require('../services/aqsi');
const { confirmOpenOrderPayment, syncOrderWithAqsi } = require('../services/order-sync');
const logger = require('../services/logger');
const authMiddleware = require('../middleware/auth');
const { getPublicErrorMessage, sendInternalError } = require('../utils/http-response');

const router = express.Router();
const requireSalesCreate = authMiddleware.requireModule('sales_create');
const requireSalesPay = authMiddleware.requireModule('sales_pay');
const requireSalesRefund = authMiddleware.requireModule('sales_refund');
const requireSalesAqsiRecovery = authMiddleware.requireModule('sales_aqsi_recovery');

function asNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDiscountPercent(value) {
  const parsed = asNumber(value);

  if (parsed === null || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

function parseDiscountMoney(value) {
  const parsed = asNumber(value);

  if (parsed === null || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseClientId(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

const GS1_GROUP_SEPARATOR = String.fromCharCode(29);
const SCANNER_LAYOUT_MAP = {
  ё: '`',
  Ё: '~',
  й: 'q',
  Й: 'Q',
  ц: 'w',
  Ц: 'W',
  у: 'e',
  У: 'E',
  к: 'r',
  К: 'R',
  е: 't',
  Е: 'T',
  н: 'y',
  Н: 'Y',
  г: 'u',
  Г: 'U',
  ш: 'i',
  Ш: 'I',
  щ: 'o',
  Щ: 'O',
  з: 'p',
  З: 'P',
  х: '[',
  Х: '{',
  ъ: ']',
  Ъ: '}',
  ф: 'a',
  Ф: 'A',
  ы: 's',
  Ы: 'S',
  в: 'd',
  В: 'D',
  а: 'f',
  А: 'F',
  п: 'g',
  П: 'G',
  р: 'h',
  Р: 'H',
  о: 'j',
  О: 'J',
  л: 'k',
  Л: 'K',
  д: 'l',
  Д: 'L',
  ж: ';',
  Ж: ':',
  э: "'",
  Э: '"',
  я: 'z',
  Я: 'Z',
  ч: 'x',
  Ч: 'X',
  с: 'c',
  С: 'C',
  м: 'v',
  М: 'V',
  и: 'b',
  И: 'B',
  т: 'n',
  Т: 'N',
  ь: 'm',
  Ь: 'M',
  б: ',',
  Б: '<',
  ю: '.',
  Ю: '>',
};

function normalizeScannerLayout(value) {
  // When keyboard is in Russian mode, the '/' key sends '.'.
  // The '.' key sends 'ю' (map converts it back to '.').
  // So if any Cyrillic chars present — full scan was in Russian mode, convert '.' → '/'.
  const hasCyrillic = /[а-яёА-ЯЁ]/u.test(String(value));
  return Array.from(String(value), (char) => {
    if (SCANNER_LAYOUT_MAP[char]) return SCANNER_LAYOUT_MAP[char];
    if (hasCyrillic && char === '.') return '/';
    if (hasCyrillic && char === ',') return '?';
    return char;
  }).join('');
}

function splitMarkingTailWithAis(tail) {
  if (!tail) {
    return null;
  }

  // Try AI 93 with CRC lengths 4, 3, 2 (most common is 4)
  for (const crcLen of [4, 3, 2]) {
    const suffixLen = 2 + crcLen;
    if (tail.length > suffixLen && tail.slice(-suffixLen, -crcLen) === '93') {
      return {
        serial: tail.slice(0, -suffixLen),
        parts: [`93${tail.slice(-crcLen)}`],
      };
    }
  }

  if (tail.length > 52 && tail.slice(-52, -50) === '91' && tail.slice(-46, -44) === '92') {
    return {
      serial: tail.slice(0, -52),
      parts: [`91${tail.slice(-50, -46)}`, `92${tail.slice(-44)}`],
    };
  }

  if (tail.length > 46 && tail.slice(-46, -44) === '92') {
    return {
      serial: tail.slice(0, -46),
      parts: [`92${tail.slice(-44)}`],
    };
  }

  return null;
}

function restoreImplicitGs1Separators(value) {
  if (!value || value.includes(GS1_GROUP_SEPARATOR) || !/^01\d{14}21/.test(value)) {
    return value;
  }

  const prefix = value.slice(0, 18);
  const tail = value.slice(18);
  const parsedTail = splitMarkingTailWithAis(tail);

  if (!parsedTail || !parsedTail.serial) {
    return value;
  }

  return `${prefix}${parsedTail.serial}${GS1_GROUP_SEPARATOR}${parsedTail.parts.join(GS1_GROUP_SEPARATOR)}`;
}

function normalizeMarkingCode(rawValue) {
  let normalized = String(rawValue);

  normalized = normalized
    .replace(/\\u001d/gi, GS1_GROUP_SEPARATOR)
    .replace(/\\x1d/gi, GS1_GROUP_SEPARATOR)
    .replace(/<\s*(?:GS|FNC1)\s*>/gi, GS1_GROUP_SEPARATOR)
    .replace(/\[\s*(?:GS|FNC1)\s*\]/gi, GS1_GROUP_SEPARATOR)
    .replace(/\(\s*(?:GS|FNC1)\s*\)/gi, GS1_GROUP_SEPARATOR)
    .replace(/\u00a0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ');

  normalized = normalizeScannerLayout(normalized).trim();
  normalized = normalized.replace(/^\]d2/i, '');

  if (!normalized) {
    return null;
  }

  // Keyboard scanners often turn GS separators into visible spaces in browser inputs.
  // Only replace spaces if there is no real GS yet — otherwise accidental spaces corrupt the serial.
  if (!normalized.includes(GS1_GROUP_SEPARATOR)) {
    normalized = normalized.replace(/ +/g, GS1_GROUP_SEPARATOR);
  }

  // ChZ requires GS between AIs (tag 2000). Reinsert if scanner dropped FNC1.
  return restoreImplicitGs1Separators(normalized);
}

function parseMarkingCode(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return normalizeMarkingCode(value);
}

function normalizeDiscounts(discountPercent, discountMoney) {
  const nextPercent = discountPercent && discountPercent > 0 ? discountPercent : 0;
  const nextMoney = discountMoney && discountMoney > 0 ? discountMoney : 0;

  if (nextMoney > 0) {
    return { discountPercent: 0, discountMoney: nextMoney };
  }

  return { discountPercent: nextPercent, discountMoney: 0 };
}

function resolveDiscountMoney(baseAmount, discountPercent, discountMoney) {
  const safeBase = Math.max(0, Number.parseFloat(String(baseAmount || 0)) || 0);
  const fixedMoney = Math.max(0, Number.parseFloat(String(discountMoney || 0)) || 0);
  const percent = Math.max(0, Number.parseFloat(String(discountPercent || 0)) || 0);
  const rawDiscount = fixedMoney > 0 ? fixedMoney : safeBase * (percent / 100);

  return Math.min(safeBase, rawDiscount);
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getRefundableQuantity(item) {
  return Math.max(0, Number(item.quantity || 0) - Number(item.refunded_quantity || 0));
}

function getItemNetTotal(item, quantity = Number(item.quantity || 0)) {
  const safeQuantity = Math.max(0, Number(quantity || 0));
  const grossTotal = roundMoney(Number(item.sale_price || 0) * safeQuantity);

  if (safeQuantity === 0) {
    return { grossTotal: 0, discountTotal: 0, total: 0 };
  }

  const fullGross = roundMoney(Number(item.sale_price || 0) * Number(item.quantity || 0));
  const fullDiscount = resolveDiscountMoney(fullGross, item.discount_percent, item.discount_money);
  const proportionalDiscount =
    Number(item.quantity || 0) > 0 ? roundMoney((fullDiscount / Number(item.quantity || 0)) * safeQuantity) : 0;

  return {
    grossTotal,
    discountTotal: proportionalDiscount,
    total: Math.max(0, roundMoney(grossTotal - proportionalDiscount)),
  };
}

function buildRefundItem(item, quantity) {
  const summary = getItemNetTotal(item, quantity);

  return {
    ...item,
    quantity,
    total: summary.grossTotal,
    discount_percent: 0,
    discount_money: summary.discountTotal,
  };
}

function calculateRefundAmount(items) {
  return roundMoney(
    items.reduce((sum, item) => {
      const summary = getItemNetTotal(item, item.quantity);
      return sum + summary.total;
    }, 0)
  );
}

async function refreshOrderRefundStatus(client, orderId) {
  const { rows: itemRows } = await client.query(
    'SELECT quantity, refunded_quantity FROM order_items WHERE order_id = $1',
    [orderId]
  );

  const allRefunded = itemRows.length > 0 && itemRows.every((item) => Number(item.refunded_quantity || 0) >= Number(item.quantity || 0));
  const nextStatus = allRefunded ? 'refunded' : 'partially_refunded';

  const { rows } = await client.query(
    `UPDATE orders
     SET status = $2
     WHERE id = $1
     RETURNING *`,
    [orderId, nextStatus]
  );

  return rows[0];
}

function parseRefundRequests(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return null;
  }

  const seen = new Set();

  return rawItems.map((item) => {
    const itemId = typeof item?.item_id === 'string' ? item.item_id : '';
    const quantity = Number.parseInt(String(item?.quantity), 10);

    if (!itemId) {
      throw createHttpError(422, 'Укажите позицию для возврата');
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw createHttpError(422, 'Некорректное количество для возврата');
    }

    if (seen.has(itemId)) {
      throw createHttpError(422, 'Позиции возврата не должны повторяться');
    }
    seen.add(itemId);

    return { itemId, quantity };
  });
}

function toDateOnly(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function diffDateOnlyDays(startDate, endDate) {
  if (!startDate || !endDate) {
    return null;
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

function addDateOnlyDays(startDate, days) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + Number(days || 0));
  return start.toISOString().slice(0, 10);
}

async function buildServiceRefundAdjustments(client, order, orderItemsById, refundItems) {
  const adjustments = [];

  for (const refundItem of refundItems) {
    const sourceItem = orderItemsById.get(refundItem.id);
    if (!sourceItem || !['service', 'subscription'].includes(sourceItem.kind) || !sourceItem.product_id) {
      continue;
    }

    const { rows: paramRows } = await client.query(
      `SELECT subscription_type, visits_total, validity_days
       FROM product_subscription_params
       WHERE product_id = $1`,
      [sourceItem.product_id]
    );
    const params = paramRows[0];

    if (!params?.subscription_type || !order.client_id) {
      continue;
    }

    const { rows: subscriptionRows } = await client.query(
      `SELECT *
       FROM client_subscriptions
       WHERE order_id = $1
         AND client_id = $2
         AND product_id = $3
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [order.id, order.client_id, sourceItem.product_id]
    );
    const subscription = subscriptionRows[0];

    if (!subscription) {
      continue;
    }

    const { rows: visitRows } = await client.query(
      'SELECT COUNT(*)::int AS count FROM client_visits WHERE subscription_id = $1',
      [subscription.id]
    );
    const { rows: bookingRows } = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM bookings
       WHERE subscription_id = $1
         AND status != 'cancelled'`,
      [subscription.id]
    );

    if ((visitRows[0]?.count || 0) > 0 || (bookingRows[0]?.count || 0) > 0) {
      throw createHttpError(
        409,
        `Нельзя автоматически вернуть услугу "${sourceItem.name}": по ней уже есть посещения или записи`
      );
    }

    const remainingUnits = getRefundableQuantity(sourceItem);
    const refundUnits = Number(refundItem.quantity || 0);
    const refundAllRemaining = refundUnits === remainingUnits;

    if (['single', 'visits'].includes(subscription.type)) {
      if (Number(subscription.visits_left || 0) !== Number(subscription.visits_total || 0)) {
        throw createHttpError(
          409,
          `Нельзя автоматически вернуть услугу "${sourceItem.name}": абонемент уже частично использован`
        );
      }

      const unitVisitsFromCurrent =
        remainingUnits > 0 && Number(subscription.visits_total || 0) > 0
          ? Number(subscription.visits_total || 0) / remainingUnits
          : null;
      const unitVisits =
        Number(params.visits_total || 0) > 0
          ? Number(params.visits_total)
          : subscription.type === 'single'
            ? 1
            : unitVisitsFromCurrent;

      if (!unitVisits || !Number.isFinite(unitVisits)) {
        throw createHttpError(
          409,
          `Не удалось безопасно рассчитать возврат по услуге "${sourceItem.name}"`
        );
      }

      const nextVisits = Number(subscription.visits_total || 0) - unitVisits * refundUnits;
      if (nextVisits < 0) {
        throw createHttpError(409, `Возврат по услуге "${sourceItem.name}" превышает остаток доступа`);
      }

      adjustments.push({
        kind: 'subscription',
        subscriptionId: subscription.id,
        values:
          nextVisits === 0
            ? {
                visits_total: 0,
                visits_left: 0,
                status: 'expired',
              }
            : {
                visits_total: nextVisits,
                visits_left: nextVisits,
                status: subscription.status,
              },
      });
      continue;
    }

    if (refundAllRemaining) {
      adjustments.push({
        kind: 'subscription',
        subscriptionId: subscription.id,
        values: {
          status: 'expired',
        },
      });
      continue;
    }

    if (!subscription.started_at || !subscription.expires_at) {
      throw createHttpError(
        409,
        `Частичный возврат по услуге "${sourceItem.name}" пока возможен только целиком, пока доступ ещё не использован`
      );
    }

    const totalValidityDays = diffDateOnlyDays(subscription.started_at, subscription.expires_at);
    const unitValidity =
      Number(params.validity_days || 0) > 0
        ? Number(params.validity_days)
        : remainingUnits > 0 && totalValidityDays && totalValidityDays > 0
          ? totalValidityDays / remainingUnits
          : null;

    if (!unitValidity || !Number.isFinite(unitValidity)) {
      throw createHttpError(
        409,
        `Не удалось безопасно сократить срок доступа по услуге "${sourceItem.name}"`
      );
    }

    const nextValidityDays = totalValidityDays - unitValidity * refundUnits;
    if (nextValidityDays <= 0) {
      adjustments.push({
        kind: 'subscription',
        subscriptionId: subscription.id,
        values: {
          status: 'expired',
        },
      });
      continue;
    }

    adjustments.push({
      kind: 'subscription',
      subscriptionId: subscription.id,
      values: {
        status: subscription.status,
        expires_at: addDateOnlyDays(subscription.started_at, nextValidityDays),
      },
    });
  }

  return adjustments;
}

async function applyRefundSideEffects(client, orderItemsById, refundItems, serviceAdjustments) {
  for (const refundItem of refundItems) {
    const sourceItem = orderItemsById.get(refundItem.id);

    if (sourceItem?.has_stock && sourceItem.product_id) {
      await client.query(
        `UPDATE products
         SET stock = stock + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [refundItem.quantity, sourceItem.product_id]
      );
    }
  }

  for (const adjustment of serviceAdjustments) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(adjustment.values)) {
      values.push(value ?? null);
      fields.push(`${key} = $${values.length}`);
    }

    values.push(adjustment.subscriptionId);
    await client.query(
      `UPDATE client_subscriptions
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${values.length}`,
      values
    );
  }
}

async function recalcOrderSummary(client, orderId) {
  const { rows: orderRows } = await client.query(
    'SELECT discount_percent, discount_money FROM orders WHERE id = $1',
    [orderId]
  );
  const order = orderRows[0];

  if (!order) {
    return null;
  }

  const { rows: items } = await client.query(
    'SELECT sale_price, quantity, total, discount_percent, discount_money FROM order_items WHERE order_id = $1',
    [orderId]
  );

  const subtotal = items.reduce((sum, item) => {
    const gross =
      item.total != null
        ? Number.parseFloat(String(item.total))
        : Number(item.sale_price || 0) * Number(item.quantity || 0);
    const lineDiscount = resolveDiscountMoney(gross, item.discount_percent, item.discount_money);

    return sum + Math.max(0, gross - lineDiscount);
  }, 0);

  const orderDiscount = resolveDiscountMoney(subtotal, order.discount_percent, order.discount_money);
  const total = Math.max(0, subtotal - orderDiscount);

  const { rows } = await client.query(
    `UPDATE orders SET
       total_amount = $2,
       items_count = $3
     WHERE id = $1
     RETURNING *`,
    [orderId, total.toFixed(2), items.length]
  );

  return rows[0];
}

async function clientExists(client, clientId) {
  if (clientId === null || clientId === undefined) {
    return true;
  }

  const { rows } = await client.query('SELECT id FROM clients WHERE id = $1', [clientId]);
  return Boolean(rows[0]);
}

function orderRequiresClient(items) {
  return items.some((item) => item.kind === 'service' || item.kind === 'subscription');
}

function hasAqsiReceiptLock(order) {
  return (
    order.aqsi_receipt_status === 'pending' ||
    (
      order.aqsi_receipt_status === 'error' &&
      Boolean(order.aqsi_sent_at || order.aqsi_receipt_operation_id || order.aqsi_receipt_id)
    )
  );
}

async function getOpenOrder(client, orderId) {
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = rows[0];

  if (!order) {
    return { error: { code: 404, message: 'Заказ не найден' } };
  }

  if (order.status !== 'open') {
    return { error: { code: 409, message: 'Заказ уже закрыт' } };
  }

  if (
    order.aqsi_sent_at ||
    order.aqsi_payment_operation_id ||
    order.aqsi_slip_id ||
    order.aqsi_receipt_operation_id ||
    hasAqsiReceiptLock(order)
  ) {
    return { error: { code: 409, message: 'Заказ уже передан на кассу' } };
  }

  return { order };
}

async function validateProductAvailability(client, productId, quantity) {
  const { rows: productRows } = await client.query(
    `SELECT p.*, pt.has_stock, pt.has_marking,
            EXISTS (
              SELECT 1
              FROM product_subscription_params psp
              WHERE psp.product_id = p.id
            ) AS has_subscription_params
     FROM products p
     JOIN product_types pt ON pt.id = p.product_type_id
     WHERE p.id = $1 AND p.is_archived = false`,
    [productId]
  );
  const product = productRows[0];

  if (!product) {
    return { error: { code: 404, message: 'Товар не найден' } };
  }

  if (product.has_stock && Number(product.stock) < quantity) {
    return {
      error: { code: 409, message: `Недостаточно товара: в наличии ${product.stock}` },
    };
  }

  return { product };
}

router.get('/', async (req, res) => {
  try {
    const { status, paid, limit = 20, offset = 0 } = req.query;
    const parsedLimit = parsePositiveInteger(limit);
    const parsedOffset = parseNonNegativeInteger(offset);
    const allowedStatuses = new Set(['open', 'confirmed', 'cancelled', 'partially_refunded', 'refunded']);

    if (status && !allowedStatuses.has(status)) {
      return res.status(422).json({ success: false, error: 'Некорректный статус заказа' });
    }
    if (parsedLimit === null || parsedLimit > 100) {
      return res.status(422).json({ success: false, error: 'limit должен быть целым числом от 1 до 100' });
    }
    if (parsedOffset === null) {
      return res.status(422).json({ success: false, error: 'offset должен быть целым неотрицательным числом' });
    }

    let sql = `
      SELECT o.*, COUNT(oi.id)::int AS items_count_actual
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
    `;
    const params = [];

    if (paid === 'true') {
      sql += ` WHERE (
        o.aqsi_payment_status = 'completed'
        OR o.aqsi_receipt_status IN ('error', 'marking_error')
        OR (o.aqsi_error IS NOT NULL AND (o.aqsi_sent_at IS NOT NULL OR o.aqsi_receipt_operation_id IS NOT NULL))
        OR o.status IN ('confirmed', 'partially_refunded', 'refunded')
      )`;
      if (status) {
        params.push(status);
        sql += ` AND o.status = $${params.length}`;
      }
    } else if (status) {
      params.push(status);
      sql += ` WHERE o.status = $${params.length}`;
    }

    sql += ` GROUP BY o.id ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parsedLimit, parsedOffset);

    const { rows } = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'orders.list' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = orderRows[0];

    if (!order) {
      return res.status(404).json({ success: false, error: 'Заказ не найден' });
    }

    const { rows: items } = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
      [req.params.id]
    );

    return res.json({ success: true, data: { ...order, items } });
  } catch (err) {
    return sendInternalError(res, err, { route: 'orders.get' });
  }
});

router.post('/', requireSalesCreate, async (req, res) => {
  try {
    const { comment } = req.body;
    const clientId = parseClientId(req.body?.client_id);

    if (Number.isNaN(clientId)) {
      return res.status(422).json({ success: false, error: 'Некорректный client_id' });
    }

    if (clientId !== null && clientId !== undefined) {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE id = $1', [clientId]);
      if (!clientRows[0]) {
        return res.status(404).json({ success: false, error: 'Клиент не найден' });
      }
    }

    const { rows } = await pool.query(
      'INSERT INTO orders (comment, client_id) VALUES ($1, $2) RETURNING *',
      [comment || null, clientId ?? null]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    return sendInternalError(res, err, { route: 'orders.create' });
  }
});

router.patch('/:id', requireSalesCreate, async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await getOpenOrder(client, req.params.id);
    if (result.error) {
      return res.status(result.error.code).json({ success: false, error: result.error.message });
    }

    const order = result.order;
    if (
      req.body.discount_percent === undefined &&
      req.body.discount_money === undefined &&
      req.body.client_id === undefined
    ) {
      return res.status(422).json({ success: false, error: 'Нет данных для обновления' });
    }
    const rawDiscountPercent =
      req.body.discount_percent !== undefined
        ? parseDiscountPercent(req.body.discount_percent)
        : Number.parseFloat(String(order.discount_percent || 0)) || 0;
    const rawDiscountMoney =
      req.body.discount_money !== undefined
        ? parseDiscountMoney(req.body.discount_money)
        : Number.parseFloat(String(order.discount_money || 0)) || 0;
    const clientId =
      req.body.client_id !== undefined ? parseClientId(req.body.client_id) : order.client_id;

    if (rawDiscountPercent === null) {
      return res.status(422).json({ success: false, error: 'Некорректная скидка в процентах' });
    }
    if (rawDiscountMoney === null) {
      return res.status(422).json({ success: false, error: 'Некорректная сумма скидки' });
    }

    if (Number.isNaN(clientId)) {
      return res.status(422).json({ success: false, error: 'Некорректный client_id' });
    }
    if (!(await clientExists(client, clientId))) {
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    const normalizedDiscounts = normalizeDiscounts(rawDiscountPercent, rawDiscountMoney);

    await client.query('BEGIN');
    await client.query(
      `UPDATE orders SET
         discount_percent = $2,
         discount_money = $3,
         client_id = $4
       WHERE id = $1`,
      [
        req.params.id,
        normalizedDiscounts.discountPercent,
        normalizedDiscounts.discountMoney,
        clientId ?? null,
      ]
    );

    const updatedOrder = await recalcOrderSummary(client, req.params.id);
    await client.query('COMMIT');

    return res.json({ success: true, data: updatedOrder });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Order patch rollback failed', rollbackError);
    }
    return sendInternalError(res, err, { route: 'orders.update' });
  } finally {
    client.release();
  }
});

router.post('/:id/items', requireSalesCreate, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      product_id,
      quantity,
      discount_percent,
      discount_money,
      marking_code,
    } = req.body;

    const qty = parsePositiveInteger(quantity);
    const parsedDiscountPercent = discount_percent === undefined ? 0 : parseDiscountPercent(discount_percent);
    const parsedDiscountMoney = discount_money === undefined ? 0 : parseDiscountMoney(discount_money);
    const parsedMarkingCode = parseMarkingCode(marking_code);

    const result = await getOpenOrder(client, req.params.id);
    if (result.error) {
      return res.status(result.error.code).json({ success: false, error: result.error.message });
    }
    if (qty === null) {
      return res.status(422).json({
        success: false,
        error: 'Количество должно быть больше нуля',
      });
    }
    if (parsedDiscountPercent === null) {
      return res.status(422).json({ success: false, error: 'Некорректная скидка в процентах' });
    }
    if (parsedDiscountMoney === null) {
      return res.status(422).json({ success: false, error: 'Некорректная сумма скидки' });
    }

    const normalizedDiscounts = normalizeDiscounts(parsedDiscountPercent, parsedDiscountMoney);

    if (!product_id) {
      return res.status(422).json({ success: false, error: 'Выберите позицию из каталога' });
    }

    const productResult = await validateProductAvailability(client, product_id, qty);
    if (productResult.error) {
      return res
        .status(productResult.error.code)
        .json({ success: false, error: productResult.error.message });
    }

    const product = productResult.product;
    const kind = product.has_stock
      ? 'product'
      : product.has_subscription_params
        ? 'subscription'
        : 'service';
    const resolvedName = product.name;
    const resolvedSku = product.sku;
    const resolvedSalePrice = Number(product.sale_price);
    const resolvedCostPrice = product.cost_price == null ? null : Number(product.cost_price);
    const markingRequired = Boolean(product.is_marked);

    if (markingRequired && qty !== 1) {
      return res.status(422).json({
        success: false,
        error: 'Маркированный товар добавляется в чек по одной единице',
      });
    }

    if (!Number.isFinite(resolvedSalePrice) || resolvedSalePrice <= 0) {
      return res.status(422).json({ success: false, error: 'Для позиции не задана корректная цена продажи' });
    }

    await client.query('BEGIN');

    if (markingRequired && parsedMarkingCode) {
      const { rows: duplicateMarkingRows } = await client.query(
        `SELECT id
         FROM order_items
         WHERE order_id = $1
           AND marking_code = $2
         LIMIT 1`,
        [req.params.id, parsedMarkingCode]
      );

      if (duplicateMarkingRows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: 'Этот код маркировки уже добавлен в текущий чек',
        });
      }
    }

    const { rows: itemRows } = await client.query(
      `INSERT INTO order_items (
         order_id,
         kind,
         product_id,
         name,
         sku,
         sale_price,
         cost_price,
         quantity,
         discount_percent,
         discount_money,
         marking_required,
         marking_code
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        req.params.id,
        kind,
        product_id || null,
        resolvedName,
        resolvedSku || null,
        resolvedSalePrice,
        resolvedCostPrice,
        qty,
        normalizedDiscounts.discountPercent,
        normalizedDiscounts.discountMoney,
        markingRequired,
        markingRequired ? parsedMarkingCode ?? null : null,
      ]
    );

    const updatedOrder = await recalcOrderSummary(client, req.params.id);
    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      data: { order: updatedOrder, item: itemRows[0] },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Order item create rollback failed', rollbackError);
    }
    return sendInternalError(res, err, { route: 'orders.add_item' });
  } finally {
    client.release();
  }
});

router.patch('/:id/items/:itemId', requireSalesCreate, async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await getOpenOrder(client, req.params.id);
    if (result.error) {
      return res.status(result.error.code).json({ success: false, error: result.error.message });
    }

    const { rows: itemRows } = await client.query(
      'SELECT * FROM order_items WHERE id = $1 AND order_id = $2',
      [req.params.itemId, req.params.id]
    );
    const item = itemRows[0];

    if (!item) {
      return res.status(404).json({ success: false, error: 'Позиция не найдена' });
    }

    const nextQuantity = req.body.quantity !== undefined
      ? parsePositiveInteger(req.body.quantity)
      : Number(item.quantity);
    if (req.body.marking_code !== undefined && req.body.marking_code !== null) {
      const raw = req.body.marking_code;
      logger.info('marking_raw', {
        raw,
        raw_hex: Buffer.from(String(raw)).toString('hex'),
        has_gs: String(raw).includes('\x1d'),
      });
    }
    const nextMarkingCode =
      req.body.marking_code !== undefined ? parseMarkingCode(req.body.marking_code) : item.marking_code;
    if (nextQuantity === null) {
      return res.status(422).json({
        success: false,
        error: 'Количество должно быть больше нуля',
      });
    }

    const rawDiscountPercent =
      req.body.discount_percent !== undefined
        ? parseDiscountPercent(req.body.discount_percent)
        : Number.parseFloat(String(item.discount_percent || 0)) || 0;
    const rawDiscountMoney =
      req.body.discount_money !== undefined
        ? parseDiscountMoney(req.body.discount_money)
        : Number.parseFloat(String(item.discount_money || 0)) || 0;

    if (rawDiscountPercent === null) {
      return res.status(422).json({ success: false, error: 'Некорректная скидка в процентах' });
    }
    if (rawDiscountMoney === null) {
      return res.status(422).json({ success: false, error: 'Некорректная сумма скидки' });
    }

    if (item.kind === 'product' && item.product_id) {
      const productResult = await validateProductAvailability(client, item.product_id, nextQuantity);
      if (productResult.error) {
        return res
          .status(productResult.error.code)
          .json({ success: false, error: productResult.error.message });
      }
    }

    if (item.marking_required && nextQuantity !== 1) {
      return res.status(422).json({
        success: false,
        error: 'Количество маркированного товара в строке должно быть равно 1',
      });
    }

    if (!item.marking_required && req.body.marking_code !== undefined) {
      return res.status(422).json({
        success: false,
        error: 'Код маркировки можно сохранить только для маркированного товара',
      });
    }

    const normalizedDiscounts = normalizeDiscounts(rawDiscountPercent, rawDiscountMoney);

    await client.query('BEGIN');

    if (item.marking_required && nextMarkingCode) {
      const { rows: duplicateMarkingRows } = await client.query(
        `SELECT id
         FROM order_items
         WHERE order_id = $1
           AND id != $2
           AND marking_code = $3
         LIMIT 1`,
        [req.params.id, req.params.itemId, nextMarkingCode]
      );

      if (duplicateMarkingRows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: 'Этот код маркировки уже добавлен в текущий чек',
        });
      }
    }

    const { rows: updatedItems } = await client.query(
      `UPDATE order_items SET
         quantity = $3,
         discount_percent = $4,
         discount_money = $5,
         marking_code = $6
       WHERE id = $1 AND order_id = $2
       RETURNING *`,
      [
        req.params.itemId,
        req.params.id,
        nextQuantity,
        normalizedDiscounts.discountPercent,
        normalizedDiscounts.discountMoney,
        item.marking_required ? nextMarkingCode ?? null : item.marking_code,
      ]
    );

    const updatedOrder = await recalcOrderSummary(client, req.params.id);
    await client.query('COMMIT');

    return res.json({
      success: true,
      data: { order: updatedOrder, item: updatedItems[0] },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Order item patch rollback failed', rollbackError);
    }
    return sendInternalError(res, err, { route: 'orders.update_item_quantity' });
  } finally {
    client.release();
  }
});

router.delete('/:id/items/:itemId', requireSalesCreate, async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await getOpenOrder(client, req.params.id);
    if (result.error) {
      return res.status(result.error.code).json({ success: false, error: result.error.message });
    }

    await client.query('BEGIN');

    const { rows: deleted } = await client.query(
      'DELETE FROM order_items WHERE id = $1 AND order_id = $2 RETURNING *',
      [req.params.itemId, req.params.id]
    );

    if (!deleted[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Позиция не найдена' });
    }

    const updatedOrder = await recalcOrderSummary(client, req.params.id);
    await client.query('COMMIT');

    return res.json({ success: true, data: updatedOrder });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Order item delete rollback failed', rollbackError);
    }
    return sendInternalError(res, err, { route: 'orders.remove_item' });
  } finally {
    client.release();
  }
});

router.post('/:id/send-to-aqsi', requireSalesPay, async (req, res) => {
  const clientId = parseClientId(req.body?.client_id);
  if (Number.isNaN(clientId)) {
    return res.status(422).json({ success: false, error: 'Некорректный client_id' });
  }

  if (req.body?.payment_type && req.body.payment_type !== 'cash') {
    return res.status(422).json({ success: false, error: 'Этот endpoint поддерживает только оплату наличными' });
  }

  // Phase 1: validate + lock order atomically to prevent concurrent or duplicate sends
  let preparedOrder;
  let preparedItems;
  let validationError = null;

  const pgClient = await pool.connect();
  try {
    await pgClient.query('BEGIN');

    const { rows: orderRows } = await pgClient.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    const order = orderRows[0];

    if (!order) {
      validationError = { code: 404, message: 'Заказ не найден' };
    } else if (order.status !== 'open') {
      validationError = { code: 409, message: 'Заказ уже закрыт' };
    } else if (
      order.aqsi_sent_at ||
      order.aqsi_payment_operation_id ||
      order.aqsi_slip_id ||
      order.aqsi_receipt_operation_id ||
      hasAqsiReceiptLock(order)
    ) {
      validationError = { code: 409, message: 'Заказ уже передан на кассу' };
    } else if (order.items_count === 0) {
      validationError = { code: 422, message: 'Чек пустой' };
    }

    if (!validationError) {
      const { rows: itemRows } = await pgClient.query(
        `SELECT oi.*, p.marking_type
         FROM order_items oi
         LEFT JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id = $1
         ORDER BY oi.created_at`,
        [req.params.id]
      );

      const nextClientId = clientId === undefined ? order.client_id : clientId;

      if (nextClientId != null) {
        const { rows: clientRows } = await pgClient.query(
          'SELECT id FROM clients WHERE id = $1',
          [nextClientId]
        );
        if (!clientRows[0]) {
          validationError = { code: 404, message: 'Клиент не найден' };
        }
      }

      if (!validationError && orderRequiresClient(itemRows) && !nextClientId) {
        validationError = { code: 422, message: 'Выберите клиента для услуги' };
      }

      if (!validationError) {
        const missingMarkedItem = itemRows.find((item) => item.marking_required && !item.marking_code);
        if (missingMarkedItem) {
          validationError = {
            code: 422,
            message: `Для товара "${missingMarkedItem.name}" нужно отсканировать код маркировки`,
          };
        }
      }

      if (!validationError) {
        const itemWithoutMarkingType = itemRows.find((item) => item.marking_code && !item.marking_type);
        if (itemWithoutMarkingType) {
          validationError = {
            code: 422,
            message: `Для товара "${itemWithoutMarkingType.name}" не задан тип маркировки`,
          };
        }
      }

      if (!validationError) {
        const { rows: preparedRows } = await pgClient.query(
          `UPDATE orders SET client_id = $2, aqsi_sent_at = NOW() WHERE id = $1 RETURNING *`,
          [req.params.id, nextClientId ?? null]
        );
        preparedOrder = preparedRows[0];
        preparedItems = itemRows;
      }
    }

    if (validationError) {
      await pgClient.query('ROLLBACK');
    } else {
      await pgClient.query('COMMIT');
    }
  } catch (err) {
    try { await pgClient.query('ROLLBACK'); } catch (_) {}
    pgClient.release();
    return sendInternalError(res, err, { route: 'orders.initiate_payment' });
  }
  pgClient.release();

  if (validationError) {
    return res.status(validationError.code).json({ success: false, error: validationError.message });
  }

  // Phase 2: send to AQSI v4 (cash) — no marking check on terminal side, no itemCode
  const orderId = req.params.id;
  let receiptOpId;
  try {
    await ensureAqsiShiftOpen();
    const aqsiResult = await sendOrderToAqsiV4({ ...preparedOrder, items: preparedItems }, 'cash');
    receiptOpId = aqsiResult?.operationId ?? aqsiResult?.id ?? aqsiResult?.guid;
  } catch (err) {
    // AQSI validation errors are definite failures. Network/timeouts are uncertain:
    // keep aqsi_sent_at so recovery/manual reconciliation can inspect the order.
    if (err.isAqsiRejection) {
      await pool.query(
        'UPDATE orders SET aqsi_sent_at = NULL, aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
        [orderId, 'error', err.message]
      ).catch(() => {});
    } else if (err.isAqsiShiftClosed) {
      await pool.query(
        'UPDATE orders SET aqsi_sent_at = NULL, aqsi_receipt_status = NULL, aqsi_error = $2 WHERE id = $1',
        [orderId, err.message]
      ).catch(() => {});
      return res.status(err.statusCode || 409).json({ success: false, error: err.message });
    } else {
      await pool.query(
        'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
        [orderId, 'error', `Неизвестный результат отправки чека в AQSI: ${err.message}. Требуется ручная сверка.`]
      ).catch(() => {});
    }
    return sendInternalError(res, err, { route: 'orders.sync_slip' });
  }

  if (!receiptOpId) {
    return res.status(500).json({ success: false, error: 'AQSI не вернул operationId' });
  }

  await pool.query(
    'UPDATE orders SET aqsi_receipt_operation_id = $2, aqsi_receipt_status = $3, aqsi_error = NULL WHERE id = $1',
    [orderId, receiptOpId, 'pending']
  ).catch((dbErr) => logger.error('orders', { action: 'save_cash_receipt_op_failed', order_id: orderId, message: dbErr.message }));

  // Poll until terminal completes receipt (usually 2-5 seconds for cash)
  let finalOp;
  try {
    finalOp = await pollOperation(receiptOpId, 2000, 30000);
  } catch (err) {
    await pool.query(
      'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
      [orderId, 'pending', `Не удалось дождаться результата фискализации: ${err.message}`]
    ).catch(() => {});
    return sendInternalError(res, err, { route: 'orders.sync' });
  }

  if (finalOp.status !== 'Completed') {
    await pool.query(
      'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
      [orderId, 'error', `Касса не подтвердила чек: ${finalOp.status}`]
    ).catch(() => {});
    return res.status(500).json({ success: false, error: `Касса не подтвердила чек: ${finalOp.status}` });
  }

  // Save receipt + fiscal data
  const fiscal = extractReceiptFiscalData(finalOp);
  if (!fiscal || !fiscal.fiscal_fd || !fiscal.fiscal_fn || !fiscal.fiscal_fp) {
    await pool.query(
      'UPDATE orders SET aqsi_receipt_status = $2, aqsi_error = $3 WHERE id = $1',
      [orderId, 'error', 'Чек завершён, но реквизиты ФД/ФН/ФП не получены — требуется ручная проверка']
    ).catch(() => {});
    return res.status(500).json({ success: false, error: 'Чек завершён, но реквизиты ФД/ФН/ФП не получены' });
  }

  const hasMarkingErrors = Boolean(fiscal.has_marking_errors);
  await pool.query(
    `UPDATE orders SET
       aqsi_receipt_id   = COALESCE($2, aqsi_receipt_id),
       aqsi_receipt_status = $8,
       aqsi_receipt_operation_id = CASE
         WHEN $9 THEN aqsi_receipt_operation_id
         ELSE NULL
       END,
       fiscal_fd         = COALESCE($3, fiscal_fd),
       fiscal_fn         = COALESCE($4, fiscal_fn),
       fiscal_fp         = COALESCE($5, fiscal_fp),
       fiscal_kkt_reg    = COALESCE($6, fiscal_kkt_reg),
       fiscal_date       = COALESCE($7, fiscal_date),
       aqsi_error        = CASE
         WHEN $9 THEN 'Ошибка маркировки ГИС МТ (тег 2107 ФФД 1.2)'
         ELSE aqsi_error
       END
     WHERE id = $1`,
    [
      orderId,
      fiscal?.receipt_id ?? null,
      fiscal?.fiscal_fd ?? null,
      fiscal?.fiscal_fn ?? null,
      fiscal?.fiscal_fp ?? null,
      fiscal?.fiscal_kkt_reg ?? null,
      fiscal?.fiscal_date ?? null,
      hasMarkingErrors ? 'marking_error' : 'completed',
      hasMarkingErrors,
    ]
  ).catch((dbErr) => logger.error('orders', { action: 'save_cash_receipt_failed', order_id: orderId, message: dbErr.message }));

  // Confirm order and deduct stock
  const confirmed = await confirmOpenOrderPayment(orderId, 'cash');
  return res.json({ success: true, data: confirmed.order });
});


router.post('/:id/sync-aqsi', requireSalesAqsiRecovery, async (req, res) => {
  try {
    const result = await syncOrderWithAqsi(req.params.id);

    if (!result.order) {
      return res.status(404).json({ success: false, error: 'Заказ не найден' });
    }

    if (result.reason === 'not_sent') {
      return res.status(409).json({ success: false, error: 'Заказ ещё не отправлен на кассу' });
    }

    return res.json({
      success: true,
      data: {
        paid: result.paid,
        payment_type: result.paymentType,
        aqsi_status: result.aqsiOrder?.status ?? null,
        order: result.order,
      },
    });
  } catch (err) {
    return sendInternalError(res, err, { route: 'orders.refund' });
  }
});

router.post('/:id/confirm', requireSalesPay, (_req, res) => {
  return res.status(409).json({
    success: false,
    error: 'Прямое подтверждение отключено: используйте штатную оплату через AQSI',
  });
});

router.post('/:id/refund', requireSalesRefund, async (req, res) => {
  const client = await pool.connect();

  try {
    const requestedRefunds = parseRefundRequests(req.body?.items);

    await client.query('BEGIN');

    const { rows: orderRows } = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    const order = orderRows[0];

    if (!order) {
      throw createHttpError(404, 'Заказ не найден');
    }

    if (!['confirmed', 'partially_refunded'].includes(order.status)) {
      throw createHttpError(409, 'Можно вернуть только оплаченный заказ');
    }

    if (!order.fiscal_fd || !order.fiscal_fn || !order.fiscal_fp || !order.fiscal_kkt_reg || !order.fiscal_date) {
      throw createHttpError(422, 'Нет фискальных данных для возврата');
    }

    const { rows: items } = await client.query(
      `SELECT oi.*, pt.has_stock
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       LEFT JOIN product_types pt ON pt.id = p.product_type_id
       WHERE oi.order_id = $1
       ORDER BY oi.created_at
       FOR UPDATE OF oi`,
      [req.params.id]
    );

    if (items.length === 0) {
      throw createHttpError(422, 'В заказе нет позиций для возврата');
    }

    const refundItems =
      requestedRefunds === null
        ? items
            .filter((item) => getRefundableQuantity(item) > 0)
            .map((item) => buildRefundItem(item, getRefundableQuantity(item)))
        : requestedRefunds.map((request) => {
            const item = items.find((candidate) => candidate.id === request.itemId);

            if (!item) {
              throw createHttpError(404, 'Позиция для возврата не найдена');
            }

            const refundableQuantity = getRefundableQuantity(item);
            if (refundableQuantity === 0) {
              throw createHttpError(409, `Позиция "${item.name}" уже возвращена полностью`);
            }

            if (request.quantity > refundableQuantity) {
              throw createHttpError(
                409,
                `Для позиции "${item.name}" доступно к возврату только ${refundableQuantity}`
              );
            }

            return buildRefundItem(item, request.quantity);
          });

    if (refundItems.length === 0) {
      throw createHttpError(422, 'В заказе не осталось позиций для возврата');
    }

    const orderItemsById = new Map(items.map((item) => [item.id, item]));
    const serviceAdjustments = await buildServiceRefundAdjustments(client, order, orderItemsById, refundItems);
    const refundAmount = calculateRefundAmount(refundItems);
    if (refundAmount <= 0) {
      throw createHttpError(422, 'Сумма возврата должна быть больше нуля');
    }

    const aqsiResult = await sendRefundToAqsi(order, refundItems, refundAmount);

    await applyRefundSideEffects(client, orderItemsById, refundItems, serviceAdjustments);

    for (const refundItem of refundItems) {
      await client.query(
        `UPDATE order_items
         SET refunded_quantity = refunded_quantity + $2,
             last_refunded_at = NOW()
         WHERE id = $1`,
        [refundItem.id, refundItem.quantity]
      );
    }

    const updatedOrder = await refreshOrderRefundStatus(client, req.params.id);

    await client.query('COMMIT');

    return res.json({
      success: true,
      data: {
        order: updatedOrder,
        aqsi: aqsiResult,
        refund_amount: refundAmount.toFixed(2),
        items: refundItems.map((item) => ({
          item_id: item.id,
          name: item.name,
          quantity: item.quantity,
        })),
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Order refund rollback failed', rollbackError);
    }

    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  } finally {
    client.release();
  }
});

module.exports = router;
