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

function parseNonNegativeAmount(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseOptionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((item) => Number.parseInt(String(item), 10))
      .filter((item) => Number.isInteger(item) && item > 0)
  )];
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

async function fetchPayrollRules() {
  const { rows } = await pool.query(`
      SELECT
        pr.id,
        pr.name,
        pr.all_trainers,
        pr.all_activities,
        pr.calculation_type,
        pr.per_attendee_amount,
        pr.percentage_rate,
        pr.tiers,
        pr.is_active,
        pr.base_amount,
        pr.bonus_threshold,
        pr.bonus_per_person,
        pr.effective_from::text AS effective_from,
      pr.comment,
      pr.created_by,
      pr.created_at,
      pr.updated_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pri.id,
            'training_type_id', pri.training_type_id,
            'training_type_name', tt.name,
            'product_id', pri.product_id,
            'product_name', p.name
          )
          ORDER BY COALESCE(tt.name, p.name)
        ) FILTER (WHERE pri.id IS NOT NULL),
        '[]'
      ) AS items,
      COALESCE((SELECT json_agg(json_build_object('trainer_id', prt.trainer_id, 'trainer_name', CONCAT_WS(' ', tr.last_name, tr.first_name)) ORDER BY tr.last_name, tr.first_name) FROM payroll_rule_trainers prt JOIN trainers tr ON tr.id = prt.trainer_id WHERE prt.rule_id = pr.id), '[]') AS trainers
    FROM payroll_rules pr
    LEFT JOIN payroll_rule_items pri ON pri.rule_id = pr.id
    LEFT JOIN training_types tt ON tt.id = pri.training_type_id
    LEFT JOIN products p ON p.id = pri.product_id
    GROUP BY pr.id
    ORDER BY pr.effective_from DESC, pr.id DESC
  `);

  return rows.map((row) => ({
    ...row,
    base_amount: Number(row.base_amount || 0),
    per_attendee_amount: Number(row.per_attendee_amount || 0),
    percentage_rate: Number(row.percentage_rate || 0),
    bonus_threshold: row.bonus_threshold === null ? null : Number(row.bonus_threshold),
    bonus_per_person: row.bonus_per_person === null ? null : Number(row.bonus_per_person),
  }));
}

function getRuleForSlot(slot, rules) {
  const slotDate = String(slot.date);
  return rules.find((rule) => {
    if (!rule.is_active || String(rule.effective_from) > slotDate) return false;
    const trainerMatches = rule.all_trainers || rule.trainers.some((item) => Number(item.trainer_id) === Number(slot.trainer_id));
    const activityMatches = rule.all_activities || rule.items.some((item) =>
      (item.product_id !== null && Number(item.product_id) === Number(slot.product_id)) ||
      (item.training_type_id !== null && Number(item.training_type_id) === Number(slot.training_type_id))
    );
    return trainerMatches && activityMatches;
  }) || null;
}
function buildPayrollLine(slot, rules) {
  const rule = getRuleForSlot(slot, rules);
  const attendedCount = Number(slot.attended_count || 0);
  const confirmedCount = Number(slot.confirmed_count || 0);
  let baseAmount = rule ? Number(rule.base_amount || 0) : 0;
  const threshold = rule?.bonus_threshold === null || rule?.bonus_threshold === undefined
    ? null
    : Number(rule.bonus_threshold);
  const bonusPerPerson = rule?.bonus_per_person === null || rule?.bonus_per_person === undefined
    ? 0
    : Number(rule.bonus_per_person);
  let bonusPeople = threshold === null ? 0 : Math.max(0, attendedCount - threshold);
  let bonusAmount = roundMoney(bonusPeople * bonusPerPerson);

  if (rule?.calculation_type === 'per_attendee') {
    baseAmount = 0;
    bonusPeople = attendedCount;
    bonusAmount = roundMoney(attendedCount * Number(rule.per_attendee_amount || 0));
  } else if (rule?.calculation_type === 'percentage') {
    baseAmount = 0;
    bonusPeople = attendedCount;
    const grossAmount = roundMoney(Number(slot.service_gross_amount || 0));
    bonusAmount = roundMoney(grossAmount * (Number(rule.percentage_rate || 0) / 100));
  } else if (rule?.calculation_type === 'tiered') {
    const tier = (Array.isArray(rule.tiers) ? rule.tiers : []).find((item) => {
      const from = Number(item.from || 0);
      const to = item.to === null || item.to === undefined || item.to === '' ? Number.POSITIVE_INFINITY : Number(item.to);
      return attendedCount >= from && attendedCount <= to;
    });
    baseAmount = 0;
    bonusPeople = attendedCount;
    bonusAmount = roundMoney(Number(tier?.amount || 0));
  }
  const totalAmount = roundMoney(baseAmount + bonusAmount);
  const warnings = [];

  if (!rule) {
    warnings.push('Нет правила оплаты для занятия');
  }

  if (rule?.calculation_type === 'percentage' && attendedCount > 0 && Number(slot.service_gross_amount || 0) === 0) {
    warnings.push('Не найдена стоимость услуги для процентного расчёта');
  }

  if (confirmedCount > 0 && attendedCount === 0) {
    warnings.push('Есть записи, но нет отметок прихода');
  }

  return {
    slot_id: slot.id,
    date: slot.date,
    start_time: slot.start_time,
    slot_type: slot.slot_type,
    training_type_id: slot.training_type_id,
    training_type_name: slot.training_type_name || slot.product_name || 'Занятие',
    product_id: slot.product_id,
    product_name: slot.product_name,
    trainer_id: slot.trainer_id,
    trainer_name: slot.trainer_name,
    attended_count: attendedCount,
    confirmed_count: confirmedCount,
    base_amount: baseAmount,
    bonus_threshold: threshold,
    bonus_per_person: bonusPerPerson,
    bonus_people: bonusPeople,
    bonus_amount: bonusAmount,
    total_amount: totalAmount,
    rule_id: rule?.id || null,
    rule_name: rule?.name || null,
    calculation_type: rule?.calculation_type || null,
    percentage_rate: Number(rule?.percentage_rate || 0),
    gross_amount: roundMoney(Number(slot.service_gross_amount || 0)),
    gym_amount: roundMoney(Number(slot.service_gross_amount || 0) - totalAmount),
    warnings,
  };
}

router.get('/payroll/rules', async (_req, res) => {
  try {
    res.json({ success: true, data: await fetchPayrollRules() });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.payroll.rules' });
  }
});

router.post('/payroll/rules', async (req, res) => {
  const client = await pool.connect();
  try {
    const name = asOptionalString(req.body?.name);
    const trainerIds = normalizeIdList(req.body?.trainer_ids);
    const trainingTypeIds = normalizeIdList(req.body?.training_type_ids);
    const productIds = normalizeIdList(req.body?.product_ids);
    const allTrainers = req.body?.all_trainers === true;
    const allActivities = req.body?.all_activities === true;
    const calculationType = ['fixed', 'per_attendee', 'percentage'].includes(req.body?.calculation_type) ? req.body.calculation_type : 'fixed';
    const salaryAmount = 0;
    const baseAmount = parseNonNegativeAmount(req.body?.base_amount, 0);
    const perAttendeeAmount = parseNonNegativeAmount(req.body?.per_attendee_amount, 0);
    const percentageRate = parseNonNegativeAmount(req.body?.percentage_rate, 0);
    const bonusThreshold = parseOptionalNonNegativeInteger(req.body?.bonus_threshold);
    const bonusPerPerson = parseNonNegativeAmount(req.body?.bonus_per_person, 0);
    const effectiveFrom = parseDate(req.body?.effective_from, null);
    const comment = asOptionalString(req.body?.comment);
    const tiers = Array.isArray(req.body?.tiers) ? req.body.tiers.map((tier) => ({
      from: Number.parseInt(String(tier.from), 10),
      to: tier.to === null || tier.to === '' ? null : Number.parseInt(String(tier.to), 10),
      amount: parseNonNegativeAmount(tier.amount, null),
    })) : [];

    if (!name) return res.status(422).json({ success: false, error: 'Укажите название правила' });
    if (!allTrainers && trainerIds.length === 0) return res.status(422).json({ success: false, error: 'Выберите сотрудников' });
    if (!allActivities && trainingTypeIds.length === 0 && productIds.length === 0) return res.status(422).json({ success: false, error: 'Выберите занятия' });
    if (!effectiveFrom) return res.status(422).json({ success: false, error: 'Укажите дату начала действия' });
    if ([baseAmount, perAttendeeAmount, percentageRate, bonusPerPerson].some((value) => value === null) || percentageRate > 100 || Number.isNaN(bonusThreshold)) return res.status(422).json({ success: false, error: 'Проверьте суммы и пороги оплаты' });

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO payroll_rules (name, all_trainers, all_activities, salary_amount, calculation_type, per_attendee_amount, percentage_rate, tiers, base_amount, bonus_threshold, bonus_per_person, effective_from, comment, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [name, allTrainers, allActivities, salaryAmount, calculationType, perAttendeeAmount, percentageRate, JSON.stringify(tiers), baseAmount, bonusThreshold, bonusPerPerson, effectiveFrom, comment, req.user?.id || null]
    );
    const ruleId = rows[0].id;
    for (const trainerId of trainerIds) await client.query('INSERT INTO payroll_rule_trainers (rule_id, trainer_id) VALUES ($1, $2)', [ruleId, trainerId]);
    for (const trainingTypeId of trainingTypeIds) await client.query('INSERT INTO payroll_rule_items (rule_id, training_type_id) VALUES ($1, $2)', [ruleId, trainingTypeId]);
    for (const productId of productIds) await client.query('INSERT INTO payroll_rule_items (rule_id, product_id) VALUES ($1, $2)', [ruleId, productId]);
    await client.query('COMMIT');
    return res.status(201).json({ success: true, data: { id: Number(ruleId) } });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Payroll rule rollback failed', rollbackError); }
    return sendInternalError(res, err, { route: 'analytics.payroll.rules.create' });
  } finally { client.release(); }
});
router.put('/payroll/rules/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    const name = asOptionalString(req.body?.name);
    const trainerIds = normalizeIdList(req.body?.trainer_ids);
    const trainingTypeIds = normalizeIdList(req.body?.training_type_ids);
    const productIds = normalizeIdList(req.body?.product_ids);
    const allTrainers = req.body?.all_trainers === true;
    const allActivities = req.body?.all_activities === true;
    const calculationType = ['fixed', 'per_attendee', 'percentage'].includes(req.body?.calculation_type) ? req.body.calculation_type : 'fixed';
    const salaryAmount = 0;
    const baseAmount = parseNonNegativeAmount(req.body?.base_amount, 0);
    const perAttendeeAmount = parseNonNegativeAmount(req.body?.per_attendee_amount, 0);
    const percentageRate = parseNonNegativeAmount(req.body?.percentage_rate, 0);
    const bonusThreshold = parseOptionalNonNegativeInteger(req.body?.bonus_threshold);
    const bonusPerPerson = parseNonNegativeAmount(req.body?.bonus_per_person, 0);
    const effectiveFrom = parseDate(req.body?.effective_from, null);
    const comment = asOptionalString(req.body?.comment);
    const tiers = Array.isArray(req.body?.tiers) ? req.body.tiers.map((tier) => ({ from: Number.parseInt(String(tier.from), 10), to: tier.to === null || tier.to === '' ? null : Number.parseInt(String(tier.to), 10), amount: parseNonNegativeAmount(tier.amount, null) })) : [];
    if (!Number.isInteger(id) || !name || (!allTrainers && trainerIds.length === 0) || (!allActivities && trainingTypeIds.length === 0 && productIds.length === 0) || !effectiveFrom) return res.status(422).json({ success: false, error: 'Заполните сотрудников, занятия и параметры правила' });
    if ([baseAmount, perAttendeeAmount, percentageRate, bonusPerPerson].some((value) => value === null) || percentageRate > 100 || Number.isNaN(bonusThreshold)) return res.status(422).json({ success: false, error: 'Проверьте параметры оплаты' });
    await client.query('BEGIN');
    const { rowCount } = await client.query(`UPDATE payroll_rules SET name=$2, all_trainers=$3, all_activities=$4, salary_amount=$5, calculation_type=$6, per_attendee_amount=$7, percentage_rate=$8, tiers=$9::jsonb, base_amount=$10, bonus_threshold=$11, bonus_per_person=$12, effective_from=$13, comment=$14, updated_at=NOW() WHERE id=$1`, [id,name,allTrainers,allActivities,salaryAmount,calculationType,perAttendeeAmount,percentageRate,JSON.stringify(tiers),baseAmount,bonusThreshold,bonusPerPerson,effectiveFrom,comment]);
    if (rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ success: false, error: 'Правило не найдено' }); }
    await client.query('DELETE FROM payroll_rule_trainers WHERE rule_id=$1',[id]);
    await client.query('DELETE FROM payroll_rule_items WHERE rule_id=$1',[id]);
    for (const trainerId of trainerIds) await client.query('INSERT INTO payroll_rule_trainers (rule_id, trainer_id) VALUES ($1,$2)',[id,trainerId]);
    for (const trainingTypeId of trainingTypeIds) await client.query('INSERT INTO payroll_rule_items (rule_id, training_type_id) VALUES ($1,$2)',[id,trainingTypeId]);
    for (const productId of productIds) await client.query('INSERT INTO payroll_rule_items (rule_id, product_id) VALUES ($1,$2)',[id,productId]);
    await client.query('COMMIT');
    return res.json({ success: true, data: { id } });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) { console.error('Payroll rule rollback failed', rollbackError); }
    return sendInternalError(res, err, { route: 'analytics.payroll.rules.update' });
  } finally { client.release(); }
});
router.delete('/payroll/rules/:id', async (req, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(422).json({ success: false, error: 'Некорректное правило' });
    }

    const { rowCount } = await pool.query('DELETE FROM payroll_rules WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Правило не найдено' });
    }

    return res.json({ success: true, data: { id } });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.payroll.rules.delete' });
  }
});

async function calculatePayrollSnapshot(from, to) {
  const [rules, slotsResult] = await Promise.all([
    fetchPayrollRules(),
    pool.query(
      `SELECT ss.id, ss.date::text AS date, ss.start_time, ss.slot_type, ss.training_type_id, ss.product_id, ss.trainer_id, tt.name AS training_type_name, p.name AS product_name, p.sale_price AS service_price,
            COALESCE(
              NULLIF((
                SELECT SUM(
                  CASE
                    WHEN pb.status = 'attended'
                      AND pb.covered_by_booking_id IS NULL
                      AND pcs.product_id IS NOT NULL
                    THEN COALESCE(pp.sale_price, 0)
                      / GREATEST(COALESCE(psp.visits_total, pcs.visits_total, 1), 1)
                      * pb.places_count
                    ELSE 0
                  END
                )
                FROM bookings pb
                LEFT JOIN client_subscriptions pcs ON pcs.id = pb.subscription_id
                LEFT JOIN products pp ON pp.id = pcs.product_id
                LEFT JOIN product_subscription_params psp ON psp.product_id = pp.id
                WHERE pb.slot_id = ss.id
              ), 0),
              COALESCE(p.sale_price, 0)
                * COALESCE(SUM(CASE WHEN b.status = 'attended' THEN b.places_count ELSE 0 END), 0),
              0
            ) AS service_gross_amount, CONCAT_WS(' ', t.last_name, t.first_name) AS trainer_name, COALESCE(SUM(CASE WHEN b.status = 'attended' THEN b.places_count ELSE 0 END), 0)::INT AS attended_count, COALESCE(SUM(CASE WHEN b.status IN ('confirmed', 'attended') THEN b.places_count ELSE 0 END), 0)::INT AS confirmed_count FROM schedule_slots ss JOIN trainers t ON t.id = ss.trainer_id LEFT JOIN training_types tt ON tt.id = ss.training_type_id LEFT JOIN products p ON p.id = ss.product_id LEFT JOIN bookings b ON b.slot_id = ss.id WHERE ss.date >= $1::date AND ss.date <= $2::date AND ((ss.date + ss.start_time) AT TIME ZONE 'Asia/Vladivostok') <= NOW() AND ss.status <> 'cancelled' AND ss.trainer_id IS NOT NULL GROUP BY ss.id, tt.name, p.name, p.sale_price, t.last_name, t.first_name ORDER BY ss.date DESC, ss.start_time DESC, ss.id DESC`,
      [from, to]
    ),
  ]);

  const lines = slotsResult.rows.map((slot) => buildPayrollLine(slot, rules));
  const trainerMap = new Map();

  for (const line of lines) {
    const key = String(line.trainer_id);
    const current = trainerMap.get(key) || {
      trainer_id: line.trainer_id,
      trainer_name: line.trainer_name,
      slots_count: 0,
      attended_count: 0,
      base_amount: 0,
      bonus_amount: 0,
      total_amount: 0,
      warnings_count: 0,
      lines: [],
    };

    current.slots_count += 1;
    current.attended_count += line.attended_count;
    current.base_amount = roundMoney(current.base_amount + line.base_amount);
    current.bonus_amount = roundMoney(current.bonus_amount + line.bonus_amount);
    current.total_amount = roundMoney(current.total_amount + line.total_amount);
    current.warnings_count += line.warnings.length;
    current.lines.push(line);
    trainerMap.set(key, current);
  }

  const trainers = Array.from(trainerMap.values()).sort((left, right) => right.total_amount - left.total_amount);

  return {
    range: { from, to },
    summary: {
      trainers_count: trainers.length,
      slots_count: lines.length,
      attended_count: lines.reduce((sum, line) => sum + line.attended_count, 0),
      base_amount: roundMoney(lines.reduce((sum, line) => sum + line.base_amount, 0)),
      bonus_amount: roundMoney(lines.reduce((sum, line) => sum + line.bonus_amount, 0)),
      total_amount: roundMoney(lines.reduce((sum, line) => sum + line.total_amount, 0)),
      warnings_count: lines.reduce((sum, line) => sum + line.warnings.length, 0),
    },
    trainers,
  };
}

async function fetchPayrollRuns() {
  const { rows } = await pool.query(
    `SELECT pr.id, pr.date_from::text AS date_from, pr.date_to::text AS date_to, pr.status, pr.created_at, pr.approved_at, COALESCE(SUM(pre.total_amount), 0) AS total_amount, COUNT(pre.id)::INT AS employees_count, COUNT(pre.id) FILTER (WHERE pre.payment_status = 'paid')::INT AS paid_count, COALESCE(json_agg(json_build_object('id', pre.id, 'trainer_id', pre.trainer_id, 'trainer_name', pre.trainer_name, 'slots_count', pre.slots_count, 'attended_count', pre.attended_count, 'base_amount', pre.base_amount, 'bonus_amount', pre.bonus_amount, 'total_amount', pre.total_amount, 'payment_status', pre.payment_status, 'paid_date', pre.paid_date, 'paid_at', pre.paid_at, 'calculation_snapshot', pre.calculation_snapshot) ORDER BY pre.trainer_name) FILTER (WHERE pre.id IS NOT NULL), '[]') AS employees FROM payroll_runs pr LEFT JOIN payroll_run_employees pre ON pre.run_id = pr.id GROUP BY pr.id ORDER BY pr.date_from DESC, pr.id DESC`
  );

  return rows.map((row) => ({
    ...row,
    total_amount: Number(row.total_amount || 0),
    employees: row.employees.map((employee) => ({
      ...employee,
      base_amount: Number(employee.base_amount || 0),
      bonus_amount: Number(employee.bonus_amount || 0),
      total_amount: Number(employee.total_amount || 0),
    })),
  }));
}

router.get('/payroll/runs', async (_req, res) => {
  try {
    return res.json({ success: true, data: await fetchPayrollRuns() });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.payroll.runs' });
  }
});

router.post('/payroll/runs', async (req, res) => {
  const client = await pool.connect();

  try {
    const from = parseDate(req.body?.from, null);
    const to = parseDate(req.body?.to, null);

    if (!from || !to || to < from) {
      return res.status(422).json({ success: false, error: 'Укажите корректный период расчёта' });
    }

    const snapshot = await calculatePayrollSnapshot(from, to);
    if (snapshot.trainers.length === 0) {
      return res.status(422).json({ success: false, error: 'За выбранный период нет занятий сотрудников' });
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO payroll_runs (date_from, date_to, created_by) VALUES ($1, $2, $3) RETURNING id',
      [from, to, req.user?.id || null]
    );
    const runId = rows[0].id;

    for (const trainer of snapshot.trainers) {
      await client.query(
        'INSERT INTO payroll_run_employees (run_id, trainer_id, trainer_name, slots_count, attended_count, base_amount, bonus_amount, total_amount, calculation_snapshot) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)',
        [
          runId,
          trainer.trainer_id,
          trainer.trainer_name,
          trainer.slots_count,
          trainer.attended_count,
          trainer.base_amount,
          trainer.bonus_amount,
          trainer.total_amount,
          JSON.stringify(trainer),
        ]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ success: true, data: { id: Number(runId) } });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Payroll run rollback failed', rollbackError);
    }
    return sendInternalError(res, err, { route: 'analytics.payroll.runs.create' });
  } finally {
    client.release();
  }
});

router.post('/payroll/runs/:id/approve', async (req, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    const { rowCount } = await pool.query(
      `UPDATE payroll_runs SET status = 'approved', approved_by = $2, approved_at = NOW() WHERE id = $1 AND status = 'draft'`,
      [id, req.user?.id || null]
    );

    if (rowCount === 0) {
      return res.status(409).json({ success: false, error: 'Ведомость уже утверждена или не найдена' });
    }

    return res.json({ success: true, data: { id } });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.payroll.runs.approve' });
  }
});

router.delete('/payroll/runs/:id/approve', async (req, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    const { rowCount } = await pool.query(
      `UPDATE payroll_runs pr
       SET status = 'draft', approved_by = NULL, approved_at = NULL
       WHERE pr.id = $1
         AND pr.status = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM payroll_run_employees pre
           WHERE pre.run_id = pr.id AND pre.payment_status = 'paid'
         )`,
      [id]
    );

    if (rowCount === 0) {
      return res.status(409).json({ success: false, error: 'Нельзя отменить утверждение: ведомость не найдена или по ней уже есть выплаты' });
    }

    return res.json({ success: true, data: { id } });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.payroll.runs.revoke_approval' });
  }
});
router.delete('/payroll/runs/:id', async (req, res) => {
  try {
    const id = Number.parseInt(String(req.params.id), 10);
    const { rowCount } = await pool.query(
      "DELETE FROM payroll_runs WHERE id = $1 AND status = 'draft'",
      [id]
    );

    if (rowCount === 0) {
      return res.status(409).json({ success: false, error: 'Удалить можно только существующий черновик ведомости' });
    }

    return res.json({ success: true, data: { id } });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.payroll.runs.delete' });
  }
});

router.post('/payroll/runs/:runId/employees/:employeeId/pay', async (req, res) => {
  try {
    const runId = Number.parseInt(String(req.params.runId), 10);
    const employeeId = Number.parseInt(String(req.params.employeeId), 10);
    const paidDate = parseDate(req.body?.paid_date, null);

    if (!paidDate) {
      return res.status(422).json({ success: false, error: 'Укажите дату выплаты' });
    }

    const { rows } = await pool.query(
      `UPDATE payroll_run_employees pre SET payment_status = 'paid', paid_date = $3, paid_by = $4, paid_at = NOW() FROM payroll_runs pr WHERE pre.id = $2 AND pre.run_id = $1 AND pr.id = pre.run_id AND pr.status = 'approved' AND pre.payment_status = 'pending' RETURNING pre.id`,
      [runId, employeeId, paidDate, req.user?.id || null]
    );

    if (rows.length === 0) {
      return res.status(409).json({ success: false, error: 'Сначала утвердите ведомость или сотрудник уже оплачен' });
    }

    return res.json({ success: true, data: { id: Number(rows[0].id) } });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.payroll.runs.pay' });
  }
});
router.get('/payroll', async (req, res) => {
  try {
    const defaults = getDefaultRange();
    const from = parseDate(req.query.from, defaults.from);
    const to = parseDate(req.query.to, defaults.to);
    const [rules, slotsResult] = await Promise.all([
      fetchPayrollRules(),
      pool.query(
        `
          SELECT
            ss.id,
            ss.date::text AS date,
            ss.start_time,
            ss.slot_type,
            ss.training_type_id,
            ss.product_id,
            ss.trainer_id,
            tt.name AS training_type_name,
            p.name AS product_name,
            p.sale_price AS service_price,
            COALESCE(
              NULLIF((
                SELECT SUM(
                  CASE
                    WHEN pb.status = 'attended'
                      AND pb.covered_by_booking_id IS NULL
                      AND pcs.product_id IS NOT NULL
                    THEN COALESCE(pp.sale_price, 0)
                      / GREATEST(COALESCE(psp.visits_total, pcs.visits_total, 1), 1)
                      * pb.places_count
                    ELSE 0
                  END
                )
                FROM bookings pb
                LEFT JOIN client_subscriptions pcs ON pcs.id = pb.subscription_id
                LEFT JOIN products pp ON pp.id = pcs.product_id
                LEFT JOIN product_subscription_params psp ON psp.product_id = pp.id
                WHERE pb.slot_id = ss.id
              ), 0),
              COALESCE(p.sale_price, 0)
                * COALESCE(SUM(CASE WHEN b.status = 'attended' THEN b.places_count ELSE 0 END), 0),
              0
            ) AS service_gross_amount,
            CONCAT_WS(' ', t.last_name, t.first_name) AS trainer_name,
            COALESCE(SUM(CASE WHEN b.status = 'attended' THEN b.places_count ELSE 0 END), 0)::INT AS attended_count,
            COALESCE(SUM(CASE WHEN b.status IN ('confirmed', 'attended') THEN b.places_count ELSE 0 END), 0)::INT AS confirmed_count
          FROM schedule_slots ss
          JOIN trainers t ON t.id = ss.trainer_id
          LEFT JOIN training_types tt ON tt.id = ss.training_type_id
          LEFT JOIN products p ON p.id = ss.product_id
          LEFT JOIN bookings b ON b.slot_id = ss.id
          WHERE ss.date >= $1::date
            AND ss.date <= $2::date AND ((ss.date + ss.start_time) AT TIME ZONE 'Asia/Vladivostok') <= NOW()
            AND ss.status <> 'cancelled'
            AND ss.trainer_id IS NOT NULL
          GROUP BY ss.id, tt.name, p.name, p.sale_price, t.last_name, t.first_name
          ORDER BY ss.date DESC, ss.start_time DESC, ss.id DESC
        `,
        [from, to]
      ),
    ]);

    const lines = slotsResult.rows.map((slot) => buildPayrollLine(slot, rules));
    const trainerMap = new Map();

    for (const line of lines) {
      const key = String(line.trainer_id);
      const current = trainerMap.get(key) || {
        trainer_id: line.trainer_id,
        trainer_name: line.trainer_name,
        slots_count: 0,
        attended_count: 0,
        base_amount: 0,
        bonus_amount: 0,
        total_amount: 0,
        warnings_count: 0,
        lines: [],
      };

      current.slots_count += 1;
      current.attended_count += line.attended_count;
      current.base_amount = roundMoney(current.base_amount + line.base_amount);
      current.bonus_amount = roundMoney(current.bonus_amount + line.bonus_amount);
      current.total_amount = roundMoney(current.total_amount + line.total_amount);
      current.warnings_count += line.warnings.length;
      current.lines.push(line);
      trainerMap.set(key, current);
    }

    const trainers = Array.from(trainerMap.values()).sort((left, right) => right.total_amount - left.total_amount);
    const summary = {
      trainers_count: trainers.length,
      slots_count: lines.length,
      attended_count: lines.reduce((sum, line) => sum + line.attended_count, 0),
      base_amount: roundMoney(lines.reduce((sum, line) => sum + line.base_amount, 0)),
      bonus_amount: roundMoney(lines.reduce((sum, line) => sum + line.bonus_amount, 0)),
      total_amount: roundMoney(lines.reduce((sum, line) => sum + line.total_amount, 0)),
      warnings_count: lines.reduce((sum, line) => sum + line.warnings.length, 0),
    };

    return res.json({
      success: true,
      data: {
        range: { from, to },
        summary,
        trainers,
      },
    });
  } catch (err) {
    return sendInternalError(res, err, { route: 'analytics.payroll' });
  }
});

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

    const payrollExpensesResult = await pool.query(
      "SELECT pre.id, pre.run_id, pre.trainer_id, pre.trainer_name, pre.total_amount AS amount, pre.paid_date AS expense_date, pre.paid_at, pr.date_from, pr.date_to FROM payroll_run_employees pre JOIN payroll_runs pr ON pr.id = pre.run_id WHERE pre.payment_status = 'paid' AND pre.paid_date >= $1::date AND pre.paid_date <= $2::date ORDER BY pre.paid_date DESC, pre.id DESC",
      [from, to]
    );
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
    const payrollExpenses = roundMoney(payrollExpensesResult.rows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const revenue = roundMoney(orderRevenue + legacyRevenue);
    const costOfSoldGoods = roundMoney(orderCost + legacyCost);
    const grossProfit = roundMoney(revenue - costOfSoldGoods);
    const cashProfit = roundMoney(revenue - purchaseExpenses - writeoffExpenses - externalExpenses - payrollExpenses);

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
          payroll_expenses: payrollExpenses,
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
        payroll_expenses: payrollExpensesResult.rows.map((row) => ({ ...row, amount: Number(row.amount || 0) })),
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
