const express = require('express');

const { pool } = require('../db');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();

const PAID_ORDER_STATUSES = ['confirmed', 'partially_refunded', 'refunded'];

function parseDate(value, fallback) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }

  return value;
}

function asOptionalString(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseAmount(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getDefaultRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function resolveDiscountMoney(base, percent, money) {
  const moneyValue = Number(money || 0);
  if (moneyValue > 0) {
    return Math.min(roundMoney(base), roundMoney(moneyValue));
  }

  const percentValue = Number(percent || 0);
  if (percentValue > 0) {
    return Math.min(roundMoney(base), roundMoney(base * (percentValue / 100)));
  }

  return 0;
}

function getActiveQuantity(item) {
  return Math.max(0, Number(item.quantity || 0) - Number(item.refunded_quantity || 0));
}

function getItemNetTotal(item) {
  const activeQuantity = getActiveQuantity(item);
  if (activeQuantity <= 0) {
    return 0;
  }

  const fullQuantity = Math.max(1, Number(item.quantity || 0));
  const fullGross = roundMoney(Number(item.sale_price || 0) * fullQuantity);
  const fullDiscount = resolveDiscountMoney(fullGross, item.discount_percent, item.discount_money);
  const activeGross = roundMoney(Number(item.sale_price || 0) * activeQuantity);
  const activeDiscount = roundMoney((fullDiscount / fullQuantity) * activeQuantity);

  return Math.max(0, roundMoney(activeGross - activeDiscount));
}

function getClientName(order) {
  return [order.client_last_name, order.client_first_name, order.client_middle_name].filter(Boolean).join(' ') || null;
}

function buildOrderAnalytics(order) {
  const items = order.items || [];
  const lineTotals = items.map((item) => ({
    item,
    activeQuantity: getActiveQuantity(item),
    netTotal: getItemNetTotal(item),
    costTotal:
      item.kind === 'product'
        ? roundMoney(Number(item.cost_price || 0) * getActiveQuantity(item))
        : 0,
  }));

  const subtotal = roundMoney(lineTotals.reduce((sum, line) => sum + line.netTotal, 0));
  const orderDiscount = resolveDiscountMoney(subtotal, order.discount_percent, order.discount_money);
  const revenue = Math.max(0, roundMoney(subtotal - orderDiscount));
  const allocationFactor = subtotal > 0 ? revenue / subtotal : 0;
  const cogs = roundMoney(lineTotals.reduce((sum, line) => sum + line.costTotal, 0));

  const itemsForResponse = lineTotals.map((line) => {
    const allocatedRevenue = roundMoney(line.netTotal * allocationFactor);

    return {
      id: line.item.id,
      kind: line.item.kind,
      name: line.item.name,
      sku: line.item.sku,
      quantity: Number(line.item.quantity || 0),
      refunded_quantity: Number(line.item.refunded_quantity || 0),
      active_quantity: line.activeQuantity,
      sale_price: Number(line.item.sale_price || 0),
      revenue: allocatedRevenue,
      cost: line.costTotal,
      profit: roundMoney(allocatedRevenue - line.costTotal),
    };
  });

  return {
    id: order.id,
    status: order.status,
    payment_type: order.payment_type,
    client_id: order.client_id,
    client_name: getClientName(order),
    aqsi_receipt_id: order.aqsi_receipt_id,
    created_at: order.created_at,
    confirmed_at: order.confirmed_at,
    items_count: items.length,
    revenue,
    cost: cogs,
    profit: roundMoney(revenue - cogs),
    items: itemsForResponse,
  };
}

function sumByKind(checks, kind, field = 'revenue') {
  return roundMoney(
    checks.reduce(
      (sum, check) => sum + check.items.filter((item) => item.kind === kind).reduce((itemSum, item) => itemSum + Number(item[field] || 0), 0),
      0
    )
  );
}

router.get('/', async (req, res) => {
  try {
    const defaults = getDefaultRange();
    const from = parseDate(req.query.from, defaults.from);
    const to = parseDate(req.query.to, defaults.to);

    const [ordersResult, receiptsResult, writeoffsResult, visitsResult, legacySalesResult, externalExpensesResult] = await Promise.all([
      pool.query(
        `
          SELECT
            o.*,
            c.first_name AS client_first_name,
            c.last_name AS client_last_name,
            c.middle_name AS client_middle_name,
            COALESCE(
              json_agg(oi.* ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL),
              '[]'
            ) AS items
          FROM orders o
          LEFT JOIN clients c ON c.id = o.client_id
          LEFT JOIN order_items oi ON oi.order_id = o.id
          WHERE o.status::text = ANY($3::text[])
            AND COALESCE(o.confirmed_at, o.created_at) >= $1::date
            AND COALESCE(o.confirmed_at, o.created_at) < ($2::date + INTERVAL '1 day')
          GROUP BY o.id, c.first_name, c.last_name, c.middle_name
          ORDER BY COALESCE(o.confirmed_at, o.created_at) DESC
        `,
        [from, to, PAID_ORDER_STATUSES]
      ),
      pool.query(
        `
          SELECT
            r.id,
            r.product_id,
            p.name AS product_name,
            p.sku AS product_sku,
            r.quantity,
            r.cost_price_at_receipt,
            COALESCE(r.cost_price_at_receipt, p.cost_price, 0) * r.quantity AS total_cost,
            r.method,
            r.comment,
            r.created_at
          FROM receipts r
          JOIN products p ON p.id = r.product_id
          WHERE r.created_at >= $1::date
            AND r.created_at < ($2::date + INTERVAL '1 day')
          ORDER BY r.created_at DESC
        `,
        [from, to]
      ),
      pool.query(
        `
          SELECT
            w.id,
            w.product_id,
            p.name AS product_name,
            p.sku AS product_sku,
            w.quantity,
            w.reason_type,
            w.reason,
            COALESCE(p.cost_price, 0) AS cost_price,
            COALESCE(p.cost_price, 0) * w.quantity AS total_cost,
            w.created_at
          FROM writeoffs w
          JOIN products p ON p.id = w.product_id
          WHERE w.created_at >= $1::date
            AND w.created_at < ($2::date + INTERVAL '1 day')
          ORDER BY w.created_at DESC
        `,
        [from, to]
      ),
      pool.query(
        `
          SELECT
            cv.id,
            cv.client_id,
            cv.subscription_id,
            cv.visit_type,
            cv.visited_at,
            cv.created_by,
            c.first_name,
            c.last_name,
            c.middle_name
          FROM client_visits cv
          JOIN clients c ON c.id = cv.client_id
          WHERE cv.visited_at >= $1::date
            AND cv.visited_at < ($2::date + INTERVAL '1 day')
          ORDER BY cv.visited_at DESC
        `,
        [from, to]
      ),
      pool.query(
        `
          SELECT
            s.id,
            s.product_id,
            p.name AS product_name,
            p.sku AS product_sku,
            s.quantity,
            s.sale_price_at_sale,
            COALESCE(p.cost_price, 0) AS cost_price,
            s.payment_type,
            s.status,
            s.aqsi_receipt_id,
            s.created_at
          FROM sales s
          JOIN products p ON p.id = s.product_id
          WHERE s.status = 'confirmed'
            AND s.created_at >= $1::date
            AND s.created_at < ($2::date + INTERVAL '1 day')
          ORDER BY s.created_at DESC
        `,
        [from, to]
      ),
      pool.query(
        `
          SELECT
            ee.id,
            ee.title,
            ee.amount,
            ee.expense_date,
            ee.comment,
            ee.created_by,
            u.name AS created_by_name,
            ee.created_at,
            ee.updated_at
          FROM external_expenses ee
          LEFT JOIN users u ON u.id = ee.created_by
          WHERE ee.expense_date >= $1::date
            AND ee.expense_date <= $2::date
          ORDER BY ee.expense_date DESC, ee.id DESC
        `,
        [from, to]
      ),
    ]);

    const checks = ordersResult.rows.map(buildOrderAnalytics);
    const legacyProductSales = legacySalesResult.rows.map((sale) => {
      const revenue = roundMoney(Number(sale.sale_price_at_sale || 0) * Number(sale.quantity || 0));
      const cost = roundMoney(Number(sale.cost_price || 0) * Number(sale.quantity || 0));

      return {
        id: sale.id,
        product_id: sale.product_id,
        product_name: sale.product_name,
        product_sku: sale.product_sku,
        quantity: Number(sale.quantity || 0),
        revenue,
        cost,
        profit: roundMoney(revenue - cost),
        payment_type: sale.payment_type,
        aqsi_receipt_id: sale.aqsi_receipt_id,
        created_at: sale.created_at,
      };
    });

    const legacyRevenue = roundMoney(legacyProductSales.reduce((sum, sale) => sum + sale.revenue, 0));
    const legacyCost = roundMoney(legacyProductSales.reduce((sum, sale) => sum + sale.cost, 0));
    const orderRevenue = roundMoney(checks.reduce((sum, check) => sum + check.revenue, 0));
    const orderCost = roundMoney(checks.reduce((sum, check) => sum + check.cost, 0));
    const purchaseExpenses = roundMoney(receiptsResult.rows.reduce((sum, row) => sum + Number(row.total_cost || 0), 0));
    const writeoffExpenses = roundMoney(writeoffsResult.rows.reduce((sum, row) => sum + Number(row.total_cost || 0), 0));
    const externalExpenses = roundMoney(externalExpensesResult.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const revenue = roundMoney(orderRevenue + legacyRevenue);
    const costOfSoldGoods = roundMoney(orderCost + legacyCost);
    const grossProfit = roundMoney(revenue - costOfSoldGoods);
    const cashProfit = roundMoney(revenue - purchaseExpenses - writeoffExpenses - externalExpenses);

    const productLines = checks
      .flatMap((check) =>
        check.items
          .filter((item) => item.kind === 'product')
          .map((item) => ({
            ...item,
            order_id: check.id,
            payment_type: check.payment_type,
            client_name: check.client_name,
            sold_at: check.confirmed_at || check.created_at,
          }))
      )
      .concat(
        legacyProductSales.map((sale) => ({
          id: `legacy-${sale.id}`,
          kind: 'product',
          name: sale.product_name,
          sku: sale.product_sku,
          quantity: sale.quantity,
          refunded_quantity: 0,
          active_quantity: sale.quantity,
          sale_price: Number(sale.sale_price_at_sale || 0),
          revenue: sale.revenue,
          cost: sale.cost,
          profit: sale.profit,
          order_id: null,
          payment_type: sale.payment_type,
          client_name: null,
          sold_at: sale.created_at,
        }))
      )
      .sort((left, right) => new Date(right.sold_at).getTime() - new Date(left.sold_at).getTime());

    const visitsByType = visitsResult.rows.reduce(
      (acc, visit) => {
        acc[visit.visit_type] = (acc[visit.visit_type] || 0) + 1;
        return acc;
      },
      {}
    );

    res.json({
      success: true,
      data: {
        range: { from, to },
        summary: {
          revenue,
          order_revenue: orderRevenue,
          legacy_revenue: legacyRevenue,
          product_revenue: roundMoney(sumByKind(checks, 'product') + legacyRevenue),
          service_revenue: roundMoney(sumByKind(checks, 'service') + sumByKind(checks, 'subscription')),
          cost_of_sold_goods: costOfSoldGoods,
          purchase_expenses: purchaseExpenses,
          writeoff_expenses: writeoffExpenses,
          external_expenses: externalExpenses,
          gross_profit: grossProfit,
          cash_profit: cashProfit,
          checks_count: checks.length,
          product_items_sold: productLines.reduce((sum, item) => sum + Number(item.active_quantity || 0), 0),
          visits_count: visitsResult.rows.length,
          open_gym_visits: visitsByType.open_gym || 0,
          group_visits: visitsByType.group || 0,
        },
        checks,
        product_sales: productLines,
        service_sales: checks.flatMap((check) =>
          check.items
            .filter((item) => item.kind === 'service' || item.kind === 'subscription')
            .map((item) => ({
              ...item,
              order_id: check.id,
              payment_type: check.payment_type,
              client_name: check.client_name,
              sold_at: check.confirmed_at || check.created_at,
            }))
        ),
        purchases: receiptsResult.rows.map((row) => ({
          ...row,
          quantity: Number(row.quantity || 0),
          cost_price_at_receipt: row.cost_price_at_receipt === null ? null : Number(row.cost_price_at_receipt),
          total_cost: Number(row.total_cost || 0),
        })),
        writeoffs: writeoffsResult.rows.map((row) => ({
          ...row,
          quantity: Number(row.quantity || 0),
          cost_price: Number(row.cost_price || 0),
          total_cost: Number(row.total_cost || 0),
        })),
        external_expenses: externalExpensesResult.rows.map((row) => ({
          ...row,
          amount: Number(row.amount || 0),
        })),
        visits: visitsResult.rows.map((row) => ({
          ...row,
          client_name: [row.last_name, row.first_name, row.middle_name].filter(Boolean).join(' '),
        })),
      },
    });
  } catch (err) {
    sendInternalError(res, err, { route: 'analytics.overview' });
  }
});

router.post('/expenses', async (req, res) => {
  try {
    const title = asOptionalString(req.body?.title);
    const amount = parseAmount(req.body?.amount);
    const expenseDate = parseDate(req.body?.expense_date, null);
    const comment = asOptionalString(req.body?.comment);

    if (!title) {
      return res.status(422).json({ success: false, error: 'Укажите статью расхода' });
    }

    if (amount === null) {
      return res.status(422).json({ success: false, error: 'Укажите сумму расхода больше нуля' });
    }

    if (!expenseDate) {
      return res.status(422).json({ success: false, error: 'Укажите дату расхода' });
    }

    const { rows } = await pool.query(
      `
        INSERT INTO external_expenses (title, amount, expense_date, comment, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, title, amount, expense_date, comment, created_by, created_at, updated_at
      `,
      [title, amount.toFixed(2), expenseDate, comment, req.user?.id || null]
    );

    return res.status(201).json({
      success: true,
      data: {
        ...rows[0],
        amount: Number(rows[0].amount || 0),
      },
    });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.expenses.create' });
  }
});

router.delete('/expenses/:id', async (req, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(422).json({ success: false, error: 'Некорректный расход' });
    }

    const { rowCount } = await pool.query('DELETE FROM external_expenses WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Расход не найден' });
    }

    return res.json({ success: true, data: { id } });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.expenses.delete' });
  }
});

module.exports = router;
