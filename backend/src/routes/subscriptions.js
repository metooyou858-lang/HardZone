const express = require('express');
const multer = require('multer');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const {
  CLUB_TIME_ZONE,
  expireActiveSubscriptions,
} = require('../services/subscription-validity');
const {
  buildLegacySubscriptionImportPlan,
  importLegacySubscriptions,
} = require('../services/legacy-subscription-import');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});
const requireClientsImport = authMiddleware.requireModule('clients_import');
const requireLegacySubscriptions = authMiddleware.requireModule('clients_legacy_subscriptions');
const requireClientsUpdate = authMiddleware.requireModule('clients_update');

const SUBSCRIPTION_TYPES = new Set(['single', 'visits', 'period', 'unlimited']);
const SUBSCRIPTION_STATUSES = new Set(['active', 'frozen', 'expired', 'exhausted', 'cancelled']);

function parseNullableInt(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const normalized = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}

function getActor(req) {
  return req.user?.username || req.user?.email || null;
}

async function loadEditableSubscription(executor, subscriptionId) {
  const { rows } = await executor.query(
    `
      SELECT cs.*
      FROM client_subscriptions cs
      WHERE cs.id = $1
      FOR UPDATE
    `,
    [subscriptionId]
  );

  return rows[0] || null;
}

async function assertSubscriptionProduct(executor, productId) {
  if (productId === null || productId === undefined || productId === '') {
    return null;
  }

  const { rows } = await executor.query(
    `
      SELECT
        p.id,
        psp.subscription_type,
        psp.visits_total,
        psp.validity_days,
        psp.activation_type,
        psp.is_family
      FROM products p
      JOIN product_types pt ON pt.id = p.product_type_id
      JOIN product_subscription_params psp ON psp.product_id = p.id
      WHERE p.id = $1
        AND p.is_archived = false
        AND pt.has_stock = false
        AND pt.has_sale_price = true
    `,
    [productId]
  );

  return rows[0] || null;
}

async function recordSubscriptionAdjustment(executor, {
  subscriptionId,
  action,
  reason,
  beforeData,
  afterData,
  changedBy,
}) {
  await executor.query(
    `
      INSERT INTO subscription_adjustments
        (subscription_id, action, reason, before_data, after_data, changed_by)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
    `,
    [
      subscriptionId,
      action,
      reason,
      JSON.stringify(beforeData),
      JSON.stringify(afterData),
      changedBy,
    ]
  );
}

function addDays(dateOnly, days) {
  const normalized = parseNullableDate(dateOnly);
  if (!normalized) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function inferStatus(executor, { type, visitsLeft, expiresAt, preferredStatus = 'active' }) {
  if (preferredStatus === 'cancelled' || preferredStatus === 'frozen') {
    return preferredStatus;
  }

  const { rows } = await executor.query(
    'SELECT (NOW() AT TIME ZONE $1)::date::text AS today',
    [CLUB_TIME_ZONE]
  );
  const today = rows[0].today;

  if (expiresAt && expiresAt < today) {
    return 'expired';
  }

  if (['single', 'visits'].includes(type) && visitsLeft !== null && visitsLeft <= 0) {
    return 'exhausted';
  }

  return SUBSCRIPTION_STATUSES.has(preferredStatus) && preferredStatus !== 'expired' && preferredStatus !== 'exhausted'
    ? preferredStatus
    : 'active';
}

router.post('/legacy-import/preview', requireClientsImport, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ success: false, error: 'Загрузите CSV-файл' });
    }

    const plan = await buildLegacySubscriptionImportPlan(pool, req.file.buffer);
    res.json({ success: true, data: plan });
  } catch (err) {
    sendInternalError(res, err, { route: 'subscriptions.legacy_import_preview' });
  }
});

router.post('/legacy-import/confirm', requireClientsImport, upload.single('file'), async (req, res) => {
  const client = await pool.connect();

  try {
    if (!req.file) {
      return res.status(422).json({ success: false, error: 'Загрузите CSV-файл' });
    }

    await client.query('BEGIN');
    const result = await importLegacySubscriptions(client, req.file.buffer, req.user?.username || req.user?.email || null);
    await client.query('COMMIT');

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'subscriptions.legacy_import_confirm' });
  } finally {
    client.release();
  }
});

router.delete('/legacy-import/:batchId', requireClientsImport, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: visitRows } = await client.query(
      `
        SELECT COUNT(*)::INT AS count
        FROM client_visits cv
        JOIN client_subscriptions cs ON cs.id = cv.subscription_id
        WHERE cs.legacy_import_batch_id = $1
      `,
      [req.params.batchId]
    );

    if ((visitRows[0]?.count || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: 'По этой пачке уже есть посещения, автоматический откат запрещён',
      });
    }

    const { rowCount } = await client.query(
      'DELETE FROM client_subscriptions WHERE legacy_import_batch_id = $1',
      [req.params.batchId]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: { deleted: rowCount || 0 } });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'subscriptions.legacy_import_rollback' });
  } finally {
    client.release();
  }
});

router.get('/legacy-services', authMiddleware.requireModule('clients_legacy_subscriptions', 'clients_update'), async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.name,
        psp.subscription_type,
        psp.visits_total,
        psp.validity_days,
        psp.activation_type,
        psp.is_family,
        psp.allow_free_visit,
        psp.allow_group_training,
        psp.allow_personal_training,
        COALESCE(
          json_agg(
            json_build_object('id', tt.id, 'name', tt.name, 'color', tt.color)
            ORDER BY tt.name
          ) FILTER (WHERE tt.id IS NOT NULL),
          '[]'
        ) AS training_types
      FROM products p
      JOIN product_types pt ON pt.id = p.product_type_id
      JOIN product_subscription_params psp ON psp.product_id = p.id
      LEFT JOIN product_training_types ptt ON ptt.product_id = p.id
      LEFT JOIN training_types tt ON tt.id = ptt.training_type_id
      WHERE p.is_archived = false
        AND pt.has_stock = false
        AND pt.has_sale_price = true
      GROUP BY p.id, p.name, psp.id
      ORDER BY p.name
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'subscriptions.legacy_services' });
  }
});

router.post('/legacy-manual', requireLegacySubscriptions, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      client_id,
      product_id,
      visits_left,
      started_at,
      note,
    } = req.body;

    if (!client_id || !product_id || !started_at) {
      return res.status(422).json({ success: false, error: 'Укажите клиента, услугу и дату начала' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(started_at))) {
      return res.status(422).json({ success: false, error: 'Некорректная дата начала' });
    }

    await client.query('BEGIN');
    await expireActiveSubscriptions(client, { clientId: client_id });

    const { rows: serviceRows } = await client.query(
      `
        SELECT
          p.id,
          psp.subscription_type,
          psp.visits_total,
          psp.validity_days,
          psp.is_family
        FROM products p
        JOIN product_types pt ON pt.id = p.product_type_id
        JOIN product_subscription_params psp ON psp.product_id = p.id
        WHERE p.id = $1
          AND p.is_archived = false
          AND pt.has_stock = false
          AND pt.has_sale_price = true
      `,
      [product_id]
    );
    const service = serviceRows[0];

    if (!service) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Услуга с параметрами абонемента не найдена' });
    }

    const visitsTotal = service.visits_total === null || service.visits_total === undefined
      ? null
      : Number.parseInt(service.visits_total, 10);
    const visitsLeft = visits_left === null || visits_left === undefined || visits_left === ''
      ? visitsTotal
      : Number.parseInt(visits_left, 10);
    const validityDays = service.validity_days === null || service.validity_days === undefined
      ? null
      : Number.parseInt(service.validity_days, 10);

    if (!Number.isFinite(visitsLeft) && (service.subscription_type === 'single' || service.subscription_type === 'visits')) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Укажите остаток посещений для выбранной услуги' });
    }

    if (Number.isFinite(visitsLeft) && visitsLeft < 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Остаток посещений не может быть меньше нуля' });
    }

    if (Number.isFinite(visitsLeft) && Number.isFinite(visitsTotal) && visitsLeft > visitsTotal) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Остаток посещений не может быть больше лимита услуги' });
    }

    const { rows } = await client.query(
      `
        INSERT INTO client_subscriptions (
          client_id, product_id, type, visits_total, visits_left,
          started_at, expires_at, is_family, status,
          legacy_source, legacy_note
        )
        VALUES (
          $1,
          $2,
          $3::subscription_type,
          $4,
          $5,
          $6,
          CASE WHEN $7::INT IS NULL THEN NULL ELSE $6::DATE + $7::INT END,
          $8,
          CASE
            WHEN $3::subscription_type IN ('single'::subscription_type, 'visits'::subscription_type) AND COALESCE($5::INT, 0) <= 0 THEN 'exhausted'::subscription_status
            WHEN $7::INT IS NOT NULL AND ($6::DATE + $7::INT) < (NOW() AT TIME ZONE $11)::date THEN 'expired'::subscription_status
            ELSE 'active'::subscription_status
          END,
          $9,
          $10
        )
        RETURNING *
      `,
      [
        client_id,
        product_id,
        service.subscription_type,
        visitsTotal,
        Number.isFinite(visitsLeft) ? visitsLeft : null,
        started_at,
        validityDays,
        service.is_family === true,
        'manual_legacy',
        [note || null, req.user?.username ? `created_by=${req.user.username}` : null].filter(Boolean).join(' | ') || null,
        CLUB_TIME_ZONE,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'subscriptions.legacy_manual' });
  } finally {
    client.release();
  }
});

router.post('/', async (req, res) => {
  try {
    const { client_id, type, visits_total, started_at, expires_at, is_family, order_id } = req.body;

    if (!client_id || !type) {
      return res.status(422).json({ success: false, error: 'Укажите клиента и тип абонемента' });
    }

    await expireActiveSubscriptions(pool, { clientId: client_id });

    await pool.query(
      `
        UPDATE client_subscriptions SET status = 'expired', updated_at = NOW()
        WHERE client_id = $1 AND status = 'active'
      `,
      [client_id]
    );

    const visitsTotal = visits_total ? Number.parseInt(visits_total, 10) : null;

    const { rows } = await pool.query(
      `
        INSERT INTO client_subscriptions (
          client_id,
          type,
          visits_total,
          visits_left,
          started_at,
          expires_at,
          is_family,
          order_id
        )
        VALUES ($1,$2,$3,$3,$4,$5,$6,$7)
        RETURNING *
      `,
      [
        client_id,
        type,
        visitsTotal,
        started_at || null,
        expires_at || null,
        is_family || false,
        order_id || null,
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'subscriptions.create' });
  }
});

router.patch('/:id', requireClientsUpdate, async (req, res) => {
  const client = await pool.connect();

  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(422).json({ success: false, error: 'Укажите причину корректировки' });
    }

    await client.query('BEGIN');
    const before = await loadEditableSubscription(client, req.params.id);

    if (!before) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Абонемент не найден' });
    }

    const nextProductId = req.body.product_id !== undefined
      ? parseNullableInt(req.body.product_id)
      : (before.product_id === null ? null : Number.parseInt(before.product_id, 10));
    if (req.body.product_id !== undefined && nextProductId !== null) {
      const product = await assertSubscriptionProduct(client, nextProductId);
      if (!product) {
        await client.query('ROLLBACK');
        return res.status(422).json({ success: false, error: 'Выберите активную услугу с параметрами абонемента' });
      }
    }

    const nextType = req.body.type !== undefined ? String(req.body.type) : before.type;
    if (!SUBSCRIPTION_TYPES.has(nextType)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Некорректный тип абонемента' });
    }

    const nextVisitsTotal = req.body.visits_total !== undefined
      ? parseNullableInt(req.body.visits_total)
      : before.visits_total;
    const nextVisitsLeft = req.body.visits_left !== undefined
      ? parseNullableInt(req.body.visits_left)
      : before.visits_left;

    if (nextVisitsTotal !== null && nextVisitsTotal < 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Лимит посещений не может быть меньше нуля' });
    }

    if (nextVisitsLeft !== null && nextVisitsLeft < 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Остаток посещений не может быть меньше нуля' });
    }

    if (nextVisitsTotal !== null && nextVisitsLeft !== null && nextVisitsLeft > nextVisitsTotal) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Остаток посещений не может быть больше лимита' });
    }

    const nextStartedAt = req.body.started_at !== undefined
      ? parseNullableDate(req.body.started_at)
      : before.started_at;
    const nextExpiresAt = req.body.expires_at !== undefined
      ? parseNullableDate(req.body.expires_at)
      : before.expires_at;

    if (nextStartedAt === undefined || nextExpiresAt === undefined) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Некорректная дата абонемента' });
    }

    const nextStatus = req.body.status !== undefined ? String(req.body.status) : before.status;
    if (!SUBSCRIPTION_STATUSES.has(nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Некорректный статус абонемента' });
    }

    if (nextStatus === 'active' && !nextProductId) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Активный абонемент должен быть привязан к услуге' });
    }

    const nextIsFamily = before.is_family === true;

    const { rows } = await client.query(
      `
        UPDATE client_subscriptions
        SET product_id = $2,
            type = $3::subscription_type,
            visits_total = $4,
            visits_left = $5,
            started_at = $6,
            expires_at = $7,
            status = $8::subscription_status,
            is_family = $9,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        before.id,
        nextProductId,
        nextType,
        nextVisitsTotal,
        nextVisitsLeft,
        nextStartedAt,
        nextExpiresAt,
        nextStatus,
        nextIsFamily,
      ]
    );

    await recordSubscriptionAdjustment(client, {
      subscriptionId: before.id,
      action: 'manual_update',
      reason,
      beforeData: before,
      afterData: rows[0],
      changedBy: getActor(req),
    });

    await client.query('COMMIT');
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'subscriptions.update' });
  } finally {
    client.release();
  }
});

router.post('/:id/sync-product-params', requireClientsUpdate, async (req, res) => {
  const client = await pool.connect();

  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(422).json({ success: false, error: 'Укажите причину синхронизации' });
    }

    await client.query('BEGIN');
    const before = await loadEditableSubscription(client, req.params.id);

    if (!before) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Абонемент не найден' });
    }

    if (!before.product_id) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Сначала привяжите абонемент к услуге' });
    }

    const product = await assertSubscriptionProduct(client, before.product_id);
    if (!product) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'У привязанной услуги нет параметров абонемента' });
    }

    const nextType = product.subscription_type;
    const visitsPerUnit = parseNullableInt(product.visits_total) ?? (nextType === 'single' ? 1 : null);
    const usedVisits =
      Number.isFinite(Number(before.visits_total)) && Number.isFinite(Number(before.visits_left))
        ? Math.max(Number(before.visits_total) - Number(before.visits_left), 0)
        : 0;
    const nextVisitsTotal = ['single', 'visits'].includes(nextType) ? visitsPerUnit : null;
    const nextVisitsLeft = nextVisitsTotal === null ? null : Math.max(nextVisitsTotal - usedVisits, 0);
    const nextStartedAt = before.started_at
      || (product.activation_type === 'purchase'
        ? (await client.query('SELECT (NOW() AT TIME ZONE $1)::date::text AS today', [CLUB_TIME_ZONE])).rows[0].today
        : null);
    const validityDays = parseNullableInt(product.validity_days);
    const nextExpiresAt = nextStartedAt && validityDays !== null ? addDays(nextStartedAt, validityDays) : null;
    const nextStatus = await inferStatus(client, {
      type: nextType,
      visitsLeft: nextVisitsLeft,
      expiresAt: nextExpiresAt,
      preferredStatus: ['cancelled', 'frozen'].includes(before.status) ? before.status : 'active',
    });

    const { rows } = await client.query(
      `
        UPDATE client_subscriptions
        SET type = $2::subscription_type,
            visits_total = $3,
            visits_left = $4,
            started_at = $5,
            expires_at = $6,
            status = $7::subscription_status,
            is_family = $8,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [
        before.id,
        nextType,
        nextVisitsTotal,
        nextVisitsLeft,
        nextStartedAt,
        nextExpiresAt,
        nextStatus,
        product.is_family === true,
      ]
    );

    await recordSubscriptionAdjustment(client, {
      subscriptionId: before.id,
      action: 'sync_product_params',
      reason,
      beforeData: before,
      afterData: rows[0],
      changedBy: getActor(req),
    });

    await client.query('COMMIT');
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'subscriptions.sync_product_params' });
  } finally {
    client.release();
  }
});

router.post('/:id/freeze', async (req, res) => {
  const client = await pool.connect();

  try {
    const { reason } = req.body;

    await client.query('BEGIN');
    await expireActiveSubscriptions(client, { subscriptionId: req.params.id });

    const { rows: subRows } = await client.query(
      'SELECT * FROM client_subscriptions WHERE id = $1 AND status = $2',
      [req.params.id, 'active']
    );

    if (!subRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Активный абонемент не найден' });
    }

    await client.query(
      'UPDATE client_subscriptions SET status = $1, updated_at = NOW() WHERE id = $2',
      ['frozen', req.params.id]
    );

    const { rows } = await client.query(
      `
        INSERT INTO subscription_freezes (subscription_id, frozen_at, reason)
        VALUES ($1, CURRENT_DATE, $2)
        RETURNING *
      `,
      [req.params.id, reason || null]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'subscriptions.freeze' });
  } finally {
    client.release();
  }
});

router.post('/:id/unfreeze', async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: freezeRows } = await client.query(
      `
        UPDATE subscription_freezes
        SET unfrozen_at = CURRENT_DATE
        WHERE subscription_id = $1 AND unfrozen_at IS NULL
        RETURNING *
      `,
      [req.params.id]
    );

    if (!freezeRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Активная заморозка не найдена' });
    }

    const daysFrozen = freezeRows[0].days_frozen || 0;

    await client.query(
      `
        UPDATE client_subscriptions
        SET status = CASE
              WHEN expires_at IS NOT NULL AND (expires_at + $1) < (NOW() AT TIME ZONE $3)::date
                THEN 'expired'::subscription_status
              ELSE 'active'::subscription_status
            END,
            expires_at = CASE
              WHEN expires_at IS NULL THEN NULL
              ELSE expires_at + $1
            END,
            updated_at = NOW()
        WHERE id = $2
      `,
      [daysFrozen, req.params.id, CLUB_TIME_ZONE]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: { days_restored: daysFrozen } });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'subscriptions.unfreeze' });
  } finally {
    client.release();
  }
});

router.post('/:id/visit', async (req, res) => {
  res.status(410).json({
    success: false,
    error: 'Прямое списание абонемента отключено. Используйте запись в расписании или вход в зал.',
  });
});

module.exports = router;
