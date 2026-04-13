const express = require('express');

const { pool } = require('../db');
const { sendOrderToAqsi, sendRefundToAqsi } = require('../services/aqsi');
const { confirmOpenOrderPayment, syncOrderWithAqsi } = require('../services/order-sync');

const router = express.Router();

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

function parseMarkingCode(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
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

async function getOpenOrder(client, orderId) {
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = rows[0];

  if (!order) {
    return { error: { code: 404, message: 'Р—Р°РєР°Р· РЅРµ РЅР°Р№РґРµРЅ' } };
  }

  if (order.status !== 'open') {
    return { error: { code: 409, message: 'Р—Р°РєР°Р· СѓР¶Рµ Р·Р°РєСЂС‹С‚' } };
  }

  return { order };
}

async function validateProductAvailability(client, productId, quantity) {
  const { rows: productRows } = await client.query(
    `SELECT p.*, pt.has_stock, pt.has_marking
     FROM products p
     JOIN product_types pt ON pt.id = p.product_type_id
     WHERE p.id = $1 AND p.is_archived = false`,
    [productId]
  );
  const product = productRows[0];

  if (!product) {
    return { error: { code: 404, message: 'РўРѕРІР°СЂ РЅРµ РЅР°Р№РґРµРЅ' } };
  }

  if (product.has_stock && Number(product.stock) < quantity) {
    return {
      error: { code: 409, message: `РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ С‚РѕРІР°СЂР°: РІ РЅР°Р»РёС‡РёРё ${product.stock}` },
    };
  }

  return { product };
}

router.get('/', async (req, res) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    let sql = `
      SELECT o.*, COUNT(oi.id)::int AS items_count_actual
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
    `;
    const params = [];

    if (status) {
      params.push(status);
      sql += ` WHERE o.status = $${params.length}`;
    }

    sql += ` GROUP BY o.id ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(Number(limit), Number(offset));

    const { rows } = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = orderRows[0];

    if (!order) {
      return res.status(404).json({ success: false, error: 'Р—Р°РєР°Р· РЅРµ РЅР°Р№РґРµРЅ' });
    }

    const { rows: items } = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
      [req.params.id]
    );

    return res.json({ success: true, data: { ...order, items } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { comment } = req.body;
    const clientId = parseClientId(req.body?.client_id);

    if (Number.isNaN(clientId)) {
      return res.status(422).json({ success: false, error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ client_id' });
    }

    if (clientId !== null && clientId !== undefined) {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE id = $1', [clientId]);
      if (!clientRows[0]) {
        return res.status(404).json({ success: false, error: 'РљР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ' });
      }
    }

    const { rows } = await pool.query(
      'INSERT INTO orders (comment, client_id) VALUES ($1, $2) RETURNING *',
      [comment || null, clientId ?? null]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
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
      return res.status(422).json({ success: false, error: 'РќРµС‚ РґР°РЅРЅС‹С… РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ' });
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
      return res.status(422).json({ success: false, error: 'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ СЃРєРёРґРєР° РІ РїСЂРѕС†РµРЅС‚Р°С…' });
    }
    if (rawDiscountMoney === null) {
      return res.status(422).json({ success: false, error: 'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ СЃСѓРјРјР° СЃРєРёРґРєРё' });
    }

    if (Number.isNaN(clientId)) {
      return res.status(422).json({ success: false, error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ client_id' });
    }
    if (!(await clientExists(client, clientId))) {
      return res.status(404).json({ success: false, error: 'РљР»РёРµРЅС‚ РЅРµ РЅР°Р№РґРµРЅ' });
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
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

router.post('/:id/items', async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      kind = 'product',
      product_id,
      name,
      sku,
      sale_price,
      cost_price,
      quantity,
      discount_percent,
      discount_money,
      marking_code,
    } = req.body;

    const qty = parseInt(quantity, 10);
    const parsedDiscountPercent = discount_percent === undefined ? 0 : parseDiscountPercent(discount_percent);
    const parsedDiscountMoney = discount_money === undefined ? 0 : parseDiscountMoney(discount_money);
    const parsedMarkingCode = parseMarkingCode(marking_code);

    const result = await getOpenOrder(client, req.params.id);
    if (result.error) {
      return res.status(result.error.code).json({ success: false, error: result.error.message });
    }
    if (!qty || qty <= 0) {
      return res.status(422).json({
        success: false,
        error: 'РљРѕР»РёС‡РµСЃС‚РІРѕ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ Р±РѕР»СЊС€Рµ РЅСѓР»СЏ',
      });
    }
    if (parsedDiscountPercent === null) {
      return res.status(422).json({ success: false, error: 'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ СЃРєРёРґРєР° РІ РїСЂРѕС†РµРЅС‚Р°С…' });
    }
    if (parsedDiscountMoney === null) {
      return res.status(422).json({ success: false, error: 'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ СЃСѓРјРјР° СЃРєРёРґРєРё' });
    }

    const normalizedDiscounts = normalizeDiscounts(parsedDiscountPercent, parsedDiscountMoney);

    let resolvedName = name;
    let resolvedSalePrice = sale_price;
    let resolvedCostPrice = cost_price;
    let resolvedSku = sku;
    let markingRequired = false;

    if (kind === 'product' && product_id) {
      const productResult = await validateProductAvailability(client, product_id, qty);
      if (productResult.error) {
        return res
          .status(productResult.error.code)
          .json({ success: false, error: productResult.error.message });
      }

      const product = productResult.product;
      resolvedName = resolvedName || product.name;
      resolvedSku = resolvedSku || product.sku;
      resolvedSalePrice = resolvedSalePrice || Number(product.sale_price);
      resolvedCostPrice = resolvedCostPrice || Number(product.cost_price);
      markingRequired = Boolean(product.is_marked || product.has_marking);
    }

    if (markingRequired && qty !== 1) {
      return res.status(422).json({
        success: false,
        error: 'Маркированный товар добавляется в чек по одной единице',
      });
    }

    if (!resolvedName) {
      return res.status(422).json({ success: false, error: 'РЈРєР°Р¶РёС‚Рµ РЅР°Р·РІР°РЅРёРµ РїРѕР·РёС†РёРё' });
    }
    if (!resolvedSalePrice) {
      return res.status(422).json({ success: false, error: 'РЈРєР°Р¶РёС‚Рµ С†РµРЅСѓ' });
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
        resolvedCostPrice || null,
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
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

router.patch('/:id/items/:itemId', async (req, res) => {
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
      return res.status(404).json({ success: false, error: 'РџРѕР·РёС†РёСЏ РЅРµ РЅР°Р№РґРµРЅР°' });
    }

    const nextQuantity = req.body.quantity !== undefined ? parseInt(req.body.quantity, 10) : item.quantity;
    const nextMarkingCode =
      req.body.marking_code !== undefined ? parseMarkingCode(req.body.marking_code) : item.marking_code;
    if (!nextQuantity || nextQuantity <= 0) {
      return res.status(422).json({
        success: false,
        error: 'РљРѕР»РёС‡РµСЃС‚РІРѕ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ Р±РѕР»СЊС€Рµ РЅСѓР»СЏ',
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
      return res.status(422).json({ success: false, error: 'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ СЃРєРёРґРєР° РІ РїСЂРѕС†РµРЅС‚Р°С…' });
    }
    if (rawDiscountMoney === null) {
      return res.status(422).json({ success: false, error: 'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ СЃСѓРјРјР° СЃРєРёРґРєРё' });
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
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/:id/items/:itemId', async (req, res) => {
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
      return res.status(404).json({ success: false, error: 'РџРѕР·РёС†РёСЏ РЅРµ РЅР°Р№РґРµРЅР°' });
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
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

router.post('/:id/send-to-aqsi', async (req, res) => {
  try {
    const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = orderRows[0];
    const clientId = parseClientId(req.body?.client_id);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Заказ не найден' });
    }
    if (Number.isNaN(clientId)) {
      return res.status(422).json({ success: false, error: 'Некорректный client_id' });
    }
    if (order.status !== 'open') {
      return res.status(409).json({ success: false, error: 'Заказ уже закрыт' });
    }
    if (order.items_count === 0) {
      return res.status(422).json({ success: false, error: 'Чек пустой' });
    }

    const { rows: items } = await pool.query(
      'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
      [req.params.id]
    );

    const nextClientId = clientId === undefined ? order.client_id : clientId;
    if (nextClientId !== null && nextClientId !== undefined) {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE id = $1', [nextClientId]);
      if (!clientRows[0]) {
        return res.status(404).json({ success: false, error: 'Клиент не найден' });
      }
    }

    if (orderRequiresClient(items) && !nextClientId) {
      return res.status(422).json({ success: false, error: 'Выберите клиента для услуги' });
    }

    const missingMarkedItem = items.find((item) => item.marking_required && !item.marking_code);
    if (missingMarkedItem) {
      return res.status(422).json({
        success: false,
        error: `Для товара "${missingMarkedItem.name}" нужно отсканировать код маркировки`,
      });
    }

    const { rows: preparedRows } = await pool.query(
      `UPDATE orders SET
         client_id = $2
       WHERE id = $1
       RETURNING *`,
      [req.params.id, nextClientId ?? null]
    );
    const preparedOrder = preparedRows[0];

    const aqsiResult = await sendOrderToAqsi({ ...preparedOrder, items });

    await pool.query(
      `UPDATE orders SET
         aqsi_receipt_id = $1,
         aqsi_sent_at = NOW(),
         aqsi_sync_attempted_at = NULL
       WHERE id = $2`,
      [String(aqsiResult?.guid || aqsiResult?.id || req.params.id), req.params.id]
    );

    return res.json({ success: true, data: aqsiResult });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/sync-aqsi', async (req, res) => {
  try {
    const result = await syncOrderWithAqsi(req.params.id);

    if (!result.order) {
      return res.status(404).json({ success: false, error: 'Р—Р°РєР°Р· РЅРµ РЅР°Р№РґРµРЅ' });
    }

    if (result.reason === 'not_sent') {
      return res.status(409).json({ success: false, error: 'Р—Р°РєР°Р· РµС‰С‘ РЅРµ РѕС‚РїСЂР°РІР»РµРЅ РЅР° РєР°СЃСЃСѓ' });
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
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/confirm', async (req, res) => {
  try {
    const { payment_type } = req.body;

    if (!payment_type || !['cash', 'card'].includes(payment_type)) {
      return res.status(422).json({
        success: false,
        error: 'РЈРєР°Р¶РёС‚Рµ СЃРїРѕСЃРѕР± РѕРїР»Р°С‚С‹: cash РёР»Рё card',
      });
    }

    const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = orderRows[0];

    if (!order) {
      return res.status(404).json({ success: false, error: 'Р—Р°РєР°Р· РЅРµ РЅР°Р№РґРµРЅ' });
    }
    if (order.status !== 'open') {
      return res.status(409).json({ success: false, error: 'Р—Р°РєР°Р· СѓР¶Рµ Р·Р°РєСЂС‹С‚' });
    }
    if (order.items_count === 0) {
      return res.status(422).json({ success: false, error: 'РќРµР»СЊР·СЏ РїРѕРґС‚РІРµСЂРґРёС‚СЊ РїСѓСЃС‚РѕР№ Р·Р°РєР°Р·' });
    }

    const finalized = await confirmOpenOrderPayment(req.params.id, payment_type);
    return res.json({ success: true, data: finalized.order });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE orders SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1 AND status = 'open'
       RETURNING *`,
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(409).json({
        success: false,
        error: 'Р—Р°РєР°Р· РЅРµ РЅР°Р№РґРµРЅ РёР»Рё СѓР¶Рµ Р·Р°РєСЂС‹С‚',
      });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/refund', async (req, res) => {
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

    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

