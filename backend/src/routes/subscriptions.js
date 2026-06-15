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
  const client = await pool.connect();

  try {
    const { visit_type = 'group', schedule_id, created_by } = req.body;

    await client.query('BEGIN');
    await expireActiveSubscriptions(client, { subscriptionId: req.params.id });

    const { rows: subRows } = await client.query(
      'SELECT * FROM client_subscriptions WHERE id = $1 AND status = $2',
      [req.params.id, 'active']
    );
    const subscription = subRows[0];

    if (!subscription) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Активный абонемент не найден' });
    }

    if (['period', 'unlimited'].includes(subscription.type) && subscription.expires_at) {
      if (new Date(subscription.expires_at) < new Date()) {
        await client.query(
          'UPDATE client_subscriptions SET status = $1, updated_at = NOW() WHERE id = $2',
          ['expired', subscription.id]
        );
        await client.query('COMMIT');
        return res.status(409).json({ success: false, error: 'Абонемент истёк' });
      }
    }

    if (['visits', 'single'].includes(subscription.type)) {
      if ((subscription.visits_left || 0) <= 0) {
        await client.query(
          'UPDATE client_subscriptions SET status = $1, updated_at = NOW() WHERE id = $2',
          ['exhausted', subscription.id]
        );
        await client.query('COMMIT');
        return res.status(409).json({ success: false, error: 'Занятия закончились' });
      }

      await client.query(
        `
          UPDATE client_subscriptions
          SET visits_left = visits_left - 1,
              status = CASE WHEN visits_left - 1 <= 0 THEN 'exhausted' ELSE status END,
              updated_at = NOW()
          WHERE id = $1
        `,
        [subscription.id]
      );
    }

    const { rows } = await client.query(
      `
        INSERT INTO client_visits (client_id, subscription_id, visit_type, schedule_id, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [subscription.client_id, subscription.id, visit_type, schedule_id || null, created_by || null]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'subscriptions.use_visit' });
  } finally {
    client.release();
  }
});

module.exports = router;
