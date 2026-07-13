const express = require('express');
const multer = require('multer');
const csv = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const authMiddleware = require('../middleware/auth');
const { hasModuleAccess } = require('../authz');
const { pool } = require('../db');
const { addClientSearchConditions } = require('../services/client-search');
const { generateClientBarcode } = require('../services/client-barcode');
const { expireActiveSubscriptions } = require('../services/subscription-validity');
const { sendInternalError } = require('../utils/http-response');
const { normalizePhone } = require('../utils/phones');

const router = express.Router();
const upload = multer({ dest: '/tmp/' });
const SUPPORTED_CLIENT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const clientPhotoDir = path.join(__dirname, '..', '..', 'uploads', 'clients');
const clientPhotoStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdirSync(clientPhotoDir, { recursive: true });
    callback(null, clientPhotoDir);
  },
  filename: (_req, file, callback) => {
    const extensionByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const extension = extensionByMime[file.mimetype] || path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
  },
});
const uploadClientPhoto = multer({
  storage: clientPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (SUPPORTED_CLIENT_PHOTO_TYPES.includes(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(new Error('Unsupported client photo type'));
  },
});

function handleClientPhotoUpload(req, res, next) {
  uploadClientPhoto.single('photo')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(422).json({ success: false, error: 'Фото слишком большое. Максимальный размер - 5 МБ.' });
    }

    if (err.message === 'Unsupported client photo type') {
      return res.status(422).json({ success: false, error: 'Поддерживаются JPG, PNG или WebP. Фото HEIC/HEIF с iPhone нужно сначала сохранить как JPEG.' });
    }

    return next(err);
  });
}
const requireClientsRead = authMiddleware.requireModule('clients');
const requireClientsCreate = authMiddleware.requireModule('clients_create');
const requireClientsUpdate = authMiddleware.requireModule('clients_update');
const requireClientsImport = authMiddleware.requireModule('clients_import');
const requireOwnerOrAdmin = authMiddleware.requireRole('owner', 'admin');

const ATHLETE_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'time', 'date', 'boolean', 'select', 'multiselect']);
const ATHLETE_PROFILE_ROLES = new Set(['admin', 'trainer', 'client']);

function removeLocalClientPhoto(photoUrl) {
  if (!photoUrl || !photoUrl.startsWith('/uploads/clients/')) {
    return;
  }

  fs.rm(path.join(clientPhotoDir, path.basename(photoUrl)), { force: true }, () => {});
}

function normalizeRoleList(value, fallback) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const roles = value.filter((item) => ATHLETE_PROFILE_ROLES.has(item));
  return roles.length ? [...new Set(roles)] : fallback;
}

function normalizeOptions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function buildAthleteFieldKey(label) {
  const ascii = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);

  return ascii || `athlete_field_${Date.now()}`;
}

function normalizeAthleteFieldPayload(body, existing = {}) {
  const sectionId = body.section_id !== undefined
    ? Number.parseInt(body.section_id, 10)
    : Number.parseInt(existing.section_id, 10);
  const section = body.section !== undefined ? String(body.section || '').trim() : existing.section;
  const label = body.label !== undefined ? String(body.label || '').trim() : existing.label;
  const fieldType = body.field_type !== undefined ? String(body.field_type || '').trim() : existing.field_type;
  const fieldKey = body.field_key !== undefined
    ? String(body.field_key || '').trim()
    : existing.field_key || buildAthleteFieldKey(label);

  if (!sectionId || !label) {
    throw Object.assign(new Error('Укажите раздел и название поля'), { statusCode: 422 });
  }

  if (!ATHLETE_FIELD_TYPES.has(fieldType)) {
    throw Object.assign(new Error('Неподдерживаемый тип поля'), { statusCode: 422 });
  }

  if (!/^[a-z0-9_]+$/.test(fieldKey)) {
    throw Object.assign(new Error('Код поля может содержать только латинские буквы, цифры и _'), { statusCode: 422 });
  }

  return {
    section_id: sectionId,
    section: section || null,
    label,
    field_key: fieldKey,
    field_type: fieldType,
    unit: body.unit !== undefined ? String(body.unit || '').trim() || null : existing.unit ?? null,
    options: body.options !== undefined ? normalizeOptions(body.options) : existing.options ?? [],
    sort_order: body.sort_order !== undefined ? Number.parseInt(body.sort_order, 10) || 0 : existing.sort_order ?? 0,
    visible_to: normalizeRoleList(body.visible_to, existing.visible_to ?? ['admin', 'trainer']),
    editable_by: normalizeRoleList(body.editable_by, existing.editable_by ?? ['admin', 'trainer']),
    is_required: body.is_required !== undefined ? Boolean(body.is_required) : Boolean(existing.is_required),
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : existing.is_active ?? true,
  };
}

function normalizeAthleteSectionPayload(body, existing = {}) {
  const name = body.name !== undefined ? String(body.name || '').trim() : existing.name;

  if (!name) {
    throw Object.assign(new Error('Укажите название раздела'), { statusCode: 422 });
  }

  return {
    name,
    sort_order: body.sort_order !== undefined ? Number.parseInt(body.sort_order, 10) || 0 : existing.sort_order ?? 0,
    is_active: body.is_active !== undefined ? Boolean(body.is_active) : existing.is_active ?? true,
  };
}

async function getAthleteProfileAccessRoles(user) {
  const roles = new Set();

  if (
    user?.role === 'owner' ||
    hasModuleAccess(user, 'users_manage') ||
    hasModuleAccess(user, 'clients_update')
  ) {
    roles.add('admin');
  }

  if (
    hasModuleAccess(user, 'schedule') ||
    hasModuleAccess(user, 'schedule_clients') ||
    hasModuleAccess(user, 'schedule_attendance')
  ) {
    roles.add('trainer');
  }

  if (user?.id) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM trainers WHERE user_id = $1 AND is_active = true LIMIT 1',
      [user.id]
    );

    if (rowCount > 0) {
      roles.add('trainer');
    }
  }

  return [...roles];
}

function roleArrayCondition(columnName, roles, startIndex) {
  if (!roles.length) {
    return { clause: 'false', values: [] };
  }

  return {
    clause: `${columnName} && $${startIndex}::TEXT[]`,
    values: [roles],
  };
}

function normalizeAthleteValue(field, value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (field.field_type === 'number') {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw Object.assign(new Error(`Некорректное число в поле "${field.label}"`), { statusCode: 422 });
    }
    return numberValue;
  }

  if (field.field_type === 'time') {
    const timeValue = String(value).trim();
    if (!/^\d{1,3}:[0-5]\d(?::[0-5]\d)?$/.test(timeValue)) {
      throw Object.assign(new Error(`Поле "${field.label}" ожидает время в формате ММ:СС или Ч:ММ:СС`), { statusCode: 422 });
    }
    return timeValue;
  }

  if (field.field_type === 'boolean') {
    return Boolean(value);
  }

  if (field.field_type === 'multiselect') {
    if (!Array.isArray(value)) {
      throw Object.assign(new Error(`Поле "${field.label}" ожидает несколько значений`), { statusCode: 422 });
    }
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value).trim() || null;
}

async function getAthleteProfileSections({ includeInactive = false } = {}) {
  const { rows } = await pool.query(
    `
      SELECT *
      FROM client_athlete_profile_sections
      ${includeInactive ? '' : 'WHERE is_active = true'}
      ORDER BY sort_order, id
    `
  );

  return rows;
}

async function getAthleteProfileFields({ includeInactive = false, accessRoles = null, accessMode = 'visible' } = {}) {
  const params = [];
  const conditions = [];

  if (!includeInactive) {
    conditions.push('f.is_active = true');
    conditions.push('s.is_active = true');
  }

  if (accessRoles) {
    const accessColumn = accessMode === 'editable' ? 'f.editable_by' : 'f.visible_to';
    const accessCondition = roleArrayCondition(accessColumn, accessRoles, params.length + 1);
    conditions.push(accessCondition.clause);
    params.push(...accessCondition.values);
  }

  const { rows } = await pool.query(
    `
      SELECT f.*, s.name AS section
      FROM client_athlete_profile_fields f
      JOIN client_athlete_profile_sections s ON s.id = f.section_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY s.sort_order, f.sort_order, f.id
    `,
    params
  );

  return rows;
}

async function getClientAthleteProfile(clientId, { includeInactive = false, accessRoles = null } = {}) {
  const params = [clientId];
  const conditions = [];

  if (!includeInactive) {
    conditions.push('f.is_active = true');
    conditions.push('s.is_active = true');
  }

  if (accessRoles) {
    const accessCondition = roleArrayCondition('f.visible_to', accessRoles, params.length + 1);
    conditions.push(accessCondition.clause);
    params.push(...accessCondition.values);
  }

  const { rows } = await pool.query(
    `
      SELECT
        f.*,
        s.name AS section,
        v.value,
        v.updated_by AS value_updated_by,
        v.updated_at AS value_updated_at
      FROM client_athlete_profile_fields f
      JOIN client_athlete_profile_sections s ON s.id = f.section_id
      LEFT JOIN client_athlete_profile_values v
        ON v.field_id = f.id
       AND v.client_id = $1
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY s.sort_order, f.sort_order, f.id
    `,
    params
  );

  return rows;
}

function buildDuplicateGroupReason(groupType) {
  if (groupType === 'phone') {
    return 'Совпадает нормализованный телефон';
  }

  return 'Совпадают фамилия и имя';
}

function subscriptionMergeKey(subscription) {
  return [
    subscription.product_id || '',
    subscription.type || '',
    subscription.status || '',
    subscription.visits_total ?? '',
    subscription.started_at ? subscription.started_at.toISOString?.().slice(0, 10) || String(subscription.started_at).slice(0, 10) : '',
    subscription.expires_at ? subscription.expires_at.toISOString?.().slice(0, 10) || String(subscription.expires_at).slice(0, 10) : '',
  ].join('|');
}

async function mergeDuplicateClient(db, {
  masterClientId,
  duplicateClientId,
  groupKey,
  groupType,
  resolution,
  note,
  resolvedBy,
}) {
  const { rows: clientRows } = await db.query(
    'SELECT * FROM clients WHERE id = ANY($1::BIGINT[]) FOR UPDATE',
    [[masterClientId, duplicateClientId]]
  );
  const master = clientRows.find((row) => Number(row.id) === masterClientId);
  const duplicate = clientRows.find((row) => Number(row.id) === duplicateClientId);

  if (!master || !duplicate) {
    throw Object.assign(new Error('Одна из карточек клиента не найдена'), { statusCode: 404 });
  }

  if (
    master.telegram_id &&
    duplicate.telegram_id &&
    String(master.telegram_id) !== String(duplicate.telegram_id)
  ) {
    throw Object.assign(new Error('У карточек разные Telegram-привязки. Сначала разберите их вручную.'), { statusCode: 409 });
  }

  if (!master.telegram_id && duplicate.telegram_id) {
    await db.query('UPDATE clients SET telegram_id = NULL WHERE id = $1', [duplicateClientId]);
  }

  await db.query(
    `
      UPDATE clients
      SET middle_name = COALESCE(NULLIF(middle_name, ''), NULLIF($2, '')),
          phone = COALESCE(NULLIF(phone, ''), NULLIF($3, '')),
          phone_normalized = COALESCE(NULLIF(phone_normalized, ''), NULLIF($4, '')),
          email = COALESCE(NULLIF(email, ''), NULLIF($5, '')),
          birth_date = COALESCE(birth_date, $6),
          photo_url = COALESCE(NULLIF(photo_url, ''), NULLIF($7, '')),
          telegram_id = COALESCE(NULLIF(telegram_id, ''), NULLIF($8, '')),
          status_comment = COALESCE(NULLIF(status_comment, ''), NULLIF($9, '')),
          comment = COALESCE(NULLIF(comment, ''), NULLIF($10, '')),
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      masterClientId,
      duplicate.middle_name,
      duplicate.phone,
      duplicate.phone_normalized,
      duplicate.email,
      duplicate.birth_date,
      duplicate.photo_url,
      duplicate.telegram_id,
      duplicate.status_comment,
      duplicate.comment,
    ]
  );

  const { rows: masterSubscriptions } = await db.query(
    'SELECT * FROM client_subscriptions WHERE client_id = $1 ORDER BY id FOR UPDATE',
    [masterClientId]
  );
  const { rows: duplicateSubscriptions } = await db.query(
    'SELECT * FROM client_subscriptions WHERE client_id = $1 ORDER BY id FOR UPDATE',
    [duplicateClientId]
  );

  const masterSubscriptionsByKey = new Map();
  masterSubscriptions.forEach((subscription) => {
    if (!masterSubscriptionsByKey.has(subscriptionMergeKey(subscription))) {
      masterSubscriptionsByKey.set(subscriptionMergeKey(subscription), subscription);
    }
  });

  const subscriptionIdMap = new Map();
  let mergedSubscriptions = 0;
  let transferredSubscriptions = 0;

  for (const duplicateSubscription of duplicateSubscriptions) {
    const existingMasterSubscription = masterSubscriptionsByKey.get(subscriptionMergeKey(duplicateSubscription));

    if (existingMasterSubscription) {
      subscriptionIdMap.set(String(duplicateSubscription.id), existingMasterSubscription.id);
      await db.query('UPDATE bookings SET subscription_id = $1 WHERE subscription_id = $2', [
        existingMasterSubscription.id,
        duplicateSubscription.id,
      ]);
      await db.query('UPDATE client_visits SET subscription_id = $1 WHERE subscription_id = $2', [
        existingMasterSubscription.id,
        duplicateSubscription.id,
      ]);
      await db.query('DELETE FROM subscription_freezes WHERE subscription_id = $1', [duplicateSubscription.id]);
      await db.query('DELETE FROM client_subscriptions WHERE id = $1', [duplicateSubscription.id]);
      mergedSubscriptions += 1;
      continue;
    }

    await db.query('UPDATE client_subscriptions SET client_id = $1, updated_at = NOW() WHERE id = $2', [
      masterClientId,
      duplicateSubscription.id,
    ]);
    masterSubscriptionsByKey.set(subscriptionMergeKey(duplicateSubscription), duplicateSubscription);
    transferredSubscriptions += 1;
  }

  const { rows: duplicateBookings } = await db.query(
    'SELECT * FROM bookings WHERE client_id = $1 ORDER BY id FOR UPDATE',
    [duplicateClientId]
  );
  let mergedBookings = 0;
  let transferredBookings = 0;

  for (const booking of duplicateBookings) {
    const { rows: existingRows } = await db.query(
      'SELECT * FROM bookings WHERE slot_id = $1 AND client_id = $2 LIMIT 1 FOR UPDATE',
      [booking.slot_id, masterClientId]
    );
    const existingBooking = existingRows[0];

    if (existingBooking) {
      await db.query(
        `
          UPDATE client_visits
          SET client_id = $1,
              booking_id = $2
          WHERE booking_id = $3
        `,
        [masterClientId, existingBooking.id, booking.id]
      );
      if (['confirmed', 'attended'].includes(booking.status)) {
        await db.query(
          'UPDATE schedule_slots SET booked_count = GREATEST(0, booked_count - $1), updated_at = NOW() WHERE id = $2',
          [booking.places_count || 1, booking.slot_id]
        );
      }
      await db.query('DELETE FROM bookings WHERE id = $1', [booking.id]);
      mergedBookings += 1;
      continue;
    }

    await db.query('UPDATE bookings SET client_id = $1, updated_at = NOW() WHERE id = $2', [
      masterClientId,
      booking.id,
    ]);
    transferredBookings += 1;
  }

  const { rowCount: transferredVisits } = await db.query(
    'UPDATE client_visits SET client_id = $1 WHERE client_id = $2',
    [masterClientId, duplicateClientId]
  );

  const { rowCount: transferredOrders } = await db.query(
    'UPDATE orders SET client_id = $1 WHERE client_id = $2',
    [masterClientId, duplicateClientId]
  );

  const { rows: duplicateReviews } = await db.query(
    'SELECT * FROM trainer_reviews WHERE client_id = $1 ORDER BY id FOR UPDATE',
    [duplicateClientId]
  );
  let mergedReviews = 0;
  let transferredReviews = 0;

  for (const review of duplicateReviews) {
    const { rows: existingRows } = await db.query(
      'SELECT * FROM trainer_reviews WHERE trainer_id = $1 AND client_id = $2 LIMIT 1 FOR UPDATE',
      [review.trainer_id, masterClientId]
    );
    const existingReview = existingRows[0];

    if (existingReview) {
      await db.query(
        `
          UPDATE trainer_reviews
          SET comment = COALESCE(NULLIF(comment, ''), NULLIF($2, '')),
              is_visible = trainer_reviews.is_visible OR $3,
              updated_at = NOW()
          WHERE id = $1
        `,
        [existingReview.id, review.comment, review.is_visible]
      );
      await db.query('DELETE FROM trainer_reviews WHERE id = $1', [review.id]);
      mergedReviews += 1;
      continue;
    }

    await db.query('UPDATE trainer_reviews SET client_id = $1, updated_at = NOW() WHERE id = $2', [
      masterClientId,
      review.id,
    ]);
    transferredReviews += 1;
  }

  const { rowCount: transferredProfileValues } = await db.query(
    `
      UPDATE client_athlete_profile_values duplicate_value
      SET client_id = $1,
          updated_at = NOW()
      WHERE duplicate_value.client_id = $2
        AND NOT EXISTS (
          SELECT 1
          FROM client_athlete_profile_values master_value
          WHERE master_value.client_id = $1
            AND master_value.field_id = duplicate_value.field_id
        )
    `,
    [masterClientId, duplicateClientId]
  );
  await db.query('DELETE FROM client_athlete_profile_values WHERE client_id = $1', [duplicateClientId]);

  await db.query(
    'UPDATE client_miniapp_auth_audit SET matched_client_id = $1 WHERE matched_client_id = $2',
    [masterClientId, duplicateClientId]
  );

  const { rows: resolutionRows } = await db.query(
    `
      INSERT INTO client_duplicate_resolutions (
        group_key,
        group_type,
        master_client_id,
        duplicate_client_id,
        resolution,
        note,
        resolved_by,
        resolved_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      ON CONFLICT (duplicate_client_id)
      DO UPDATE SET group_key = EXCLUDED.group_key,
                    group_type = EXCLUDED.group_type,
                    master_client_id = EXCLUDED.master_client_id,
                    resolution = EXCLUDED.resolution,
                    note = EXCLUDED.note,
                    resolved_by = EXCLUDED.resolved_by,
                    resolved_at = NOW(),
                    updated_at = NOW()
      RETURNING *
    `,
    [groupKey, groupType, masterClientId, duplicateClientId, resolution, note, resolvedBy]
  );

  await db.query(
    'UPDATE client_duplicate_resolutions SET master_client_id = $1 WHERE master_client_id = $2',
    [masterClientId, duplicateClientId]
  );
  await db.query('DELETE FROM clients WHERE id = $1', [duplicateClientId]);

  return {
    resolution: resolutionRows[0],
    summary: {
      duplicate_client_id: duplicateClientId,
      merged_subscriptions: mergedSubscriptions,
      transferred_subscriptions: transferredSubscriptions,
      merged_bookings: mergedBookings,
      transferred_bookings: transferredBookings,
      transferred_visits: transferredVisits,
      transferred_orders: transferredOrders,
      merged_reviews: mergedReviews,
      transferred_reviews: transferredReviews,
      transferred_profile_values: transferredProfileValues,
    },
  };
}

router.get('/duplicates', requireClientsRead, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
        WITH client_stats AS (
          SELECT
            c.id,
            c.first_name,
            c.last_name,
            c.middle_name,
            c.phone,
            c.phone_normalized,
            c.email,
            c.telegram_id,
            c.barcode,
            c.status,
            c.created_at,
            c.updated_at,
            lower(trim(c.last_name)) AS last_name_key,
            lower(trim(c.first_name)) AS first_name_key,
            (
              SELECT count(*)
              FROM client_subscriptions cs
              WHERE cs.client_id = c.id
            )::INT AS subscriptions_count,
            (
              SELECT count(*)
              FROM client_subscriptions cs
              WHERE cs.client_id = c.id
                AND cs.status = 'active'
            )::INT AS active_subscriptions_count,
            (
              SELECT count(*)
              FROM client_visits cv
              WHERE cv.client_id = c.id
            )::INT AS visits_count,
            (
              SELECT count(*)
              FROM bookings b
              WHERE b.client_id = c.id
            )::INT AS bookings_count,
            (
              SELECT count(*)
              FROM orders o
              WHERE o.client_id = c.id
            )::INT AS orders_count,
            (
              SELECT count(*)
              FROM client_athlete_profile_values apv
              WHERE apv.client_id = c.id
            )::INT AS profile_values_count
          FROM clients c
        ),
        phone_groups AS (
          SELECT
            'phone'::TEXT AS group_type,
            'phone:' || phone_normalized AS group_key,
            phone_normalized AS group_label,
            array_agg(id ORDER BY id) AS client_ids
          FROM client_stats
          WHERE NULLIF(phone_normalized, '') IS NOT NULL
          GROUP BY phone_normalized
          HAVING count(*) > 1
        ),
        name_groups AS (
          SELECT
            'name'::TEXT AS group_type,
            'name:' || last_name_key || ':' || first_name_key AS group_key,
            concat_ws(' ', max(last_name), max(first_name)) AS group_label,
            array_agg(id ORDER BY id) AS client_ids
          FROM client_stats
          WHERE NULLIF(last_name_key, '') IS NOT NULL
            AND NULLIF(first_name_key, '') IS NOT NULL
          GROUP BY last_name_key, first_name_key
          HAVING count(*) > 1
        ),
        groups AS (
          SELECT * FROM phone_groups
          UNION ALL
          SELECT * FROM name_groups
        ),
        ranked_members AS (
          SELECT
            g.group_type,
            g.group_key,
            g.group_label,
            cs.*,
            row_number() OVER (
              PARTITION BY g.group_key
              ORDER BY
                (cs.telegram_id IS NOT NULL) DESC,
                cs.active_subscriptions_count DESC,
                cs.subscriptions_count DESC,
                cs.visits_count DESC,
                cs.bookings_count DESC,
                cs.orders_count DESC,
                cs.profile_values_count DESC,
                cs.updated_at DESC,
                cs.id ASC
            ) AS suggested_rank
          FROM groups g
          JOIN client_stats cs ON cs.id = ANY(g.client_ids)
          LEFT JOIN client_duplicate_resolutions cdr
            ON cdr.duplicate_client_id = cs.id
           AND cdr.group_key = g.group_key
          WHERE cdr.id IS NULL
        )
        SELECT
          group_type,
          group_key,
          group_label,
          jsonb_agg(
            jsonb_build_object(
              'id', id,
              'first_name', first_name,
              'last_name', last_name,
              'middle_name', middle_name,
              'phone', phone,
              'phone_normalized', phone_normalized,
              'email', email,
              'has_telegram', telegram_id IS NOT NULL,
              'has_barcode', barcode IS NOT NULL,
              'status', status,
              'subscriptions_count', subscriptions_count,
              'active_subscriptions_count', active_subscriptions_count,
              'visits_count', visits_count,
              'bookings_count', bookings_count,
              'orders_count', orders_count,
              'profile_values_count', profile_values_count,
              'created_at', created_at,
              'updated_at', updated_at,
              'suggested_master', suggested_rank = 1
            )
            ORDER BY suggested_rank, id
          ) AS clients
        FROM ranked_members
        GROUP BY group_type, group_key, group_label
        HAVING count(*) > 1
        ORDER BY group_type, group_label
        LIMIT 100
      `
    );

    res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        reason: buildDuplicateGroupReason(row.group_type),
      })),
    });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.duplicates.list' });
  }
});

router.post('/duplicates/resolve', requireClientsUpdate, async (req, res) => {
  const db = await pool.connect();

  try {
    const groupKey = String(req.body?.group_key || '').trim();
    const groupType = String(req.body?.group_type || '').trim();
    const masterClientId = Number.parseInt(req.body?.master_client_id, 10);
    const duplicateClientIds = Array.isArray(req.body?.duplicate_client_ids)
      ? req.body.duplicate_client_ids.map((id) => Number.parseInt(id, 10)).filter(Boolean)
      : [];
    const resolution = req.body?.resolution === 'not_duplicate' ? 'not_duplicate' : 'master_selected';
    const note = String(req.body?.note || '').trim() || null;

    if (!groupKey || !['phone', 'name'].includes(groupType)) {
      return res.status(422).json({ success: false, error: 'Некорректная группа дублей' });
    }

    if (!masterClientId || duplicateClientIds.length === 0) {
      return res.status(422).json({ success: false, error: 'Выберите главную карточку и хотя бы один дубль' });
    }

    if (duplicateClientIds.includes(masterClientId)) {
      return res.status(422).json({ success: false, error: 'Главная карточка не может быть второстепенной' });
    }

    await db.query('BEGIN');

    const allClientIds = [masterClientId, ...duplicateClientIds];
    const { rowCount } = await db.query(
      'SELECT 1 FROM clients WHERE id = ANY($1::BIGINT[])',
      [allClientIds]
    );

    if (rowCount !== allClientIds.length) {
      throw Object.assign(new Error('Одна из карточек клиента не найдена'), { statusCode: 404 });
    }

    const resolvedRows = [];
    const summaries = [];

    if (resolution === 'not_duplicate') {
      for (const duplicateClientId of duplicateClientIds) {
        const { rows } = await db.query(
          `
            INSERT INTO client_duplicate_resolutions (
              group_key,
              group_type,
              master_client_id,
              duplicate_client_id,
              resolution,
              note,
              resolved_by,
              resolved_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
            ON CONFLICT (duplicate_client_id)
            DO UPDATE SET group_key = EXCLUDED.group_key,
                          group_type = EXCLUDED.group_type,
                          master_client_id = EXCLUDED.master_client_id,
                          resolution = EXCLUDED.resolution,
                          note = EXCLUDED.note,
                          resolved_by = EXCLUDED.resolved_by,
                          resolved_at = NOW(),
                          updated_at = NOW()
            RETURNING *
          `,
          [groupKey, groupType, masterClientId, duplicateClientId, resolution, note, req.user?.id || null]
        );

        resolvedRows.push(rows[0]);
      }
    } else {
      for (const duplicateClientId of duplicateClientIds) {
        const result = await mergeDuplicateClient(db, {
          masterClientId,
          duplicateClientId,
          groupKey,
          groupType,
          resolution,
          note,
          resolvedBy: req.user?.id || null,
        });
        resolvedRows.push(result.resolution);
        summaries.push(result.summary);
      }
    }

    await db.query('COMMIT');

    res.json({ success: true, data: { resolutions: resolvedRows, summaries } });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});

    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }

    return sendInternalError(res, err, { route: 'clients.duplicates.resolve' });
  } finally {
    db.release();
  }
});

router.get('/', requireClientsRead, async (req, res) => {
  try {
    await expireActiveSubscriptions(pool);

    const { search, status, limit = 50, offset = 0 } = req.query;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }

    addClientSearchConditions({ search, params, conditions, includeEmail: true });

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(Number(limit), Number(offset));

    const { rows } = await pool.query(
      `
        SELECT
          c.*,
          cs.id AS subscription_id,
          cs.type AS subscription_type,
          cs.status AS subscription_status,
          cs.visits_left,
          cs.expires_at
        FROM clients c
        LEFT JOIN LATERAL (
          SELECT *
          FROM client_subscriptions cs
          WHERE cs.client_id = c.id
            AND cs.status = 'active'
          ORDER BY cs.expires_at NULLS LAST, cs.created_at DESC
          LIMIT 1
        ) cs ON true
        ${where}
        ORDER BY c.last_name, c.first_name
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.list' });
  }
});

router.get('/athlete-profile/fields', requireClientsRead, async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const accessRoles = includeInactive ? null : await getAthleteProfileAccessRoles(req.user);
    const fields = await getAthleteProfileFields({ includeInactive, accessRoles });

    res.json({ success: true, data: fields });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.athlete_fields.list' });
  }
});

router.get('/athlete-profile/sections', requireClientsRead, async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const sections = await getAthleteProfileSections({ includeInactive });

    res.json({ success: true, data: sections });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.athlete_sections.list' });
  }
});

router.post('/athlete-profile/sections', requireOwnerOrAdmin, async (req, res) => {
  try {
    const section = normalizeAthleteSectionPayload(req.body);
    const { rows } = await pool.query(
      `
        INSERT INTO client_athlete_profile_sections (name, sort_order, is_active)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [section.name, section.sort_order, section.is_active]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Раздел с таким названием уже существует' });
    }
    return sendInternalError(res, err, { route: 'clients.athlete_sections.create' });
  }
});

router.patch('/athlete-profile/sections/:sectionId', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { rows: existingRows } = await pool.query(
      'SELECT * FROM client_athlete_profile_sections WHERE id = $1',
      [req.params.sectionId]
    );

    if (!existingRows[0]) {
      return res.status(404).json({ success: false, error: 'Раздел профиля не найден' });
    }

    const section = normalizeAthleteSectionPayload(req.body, existingRows[0]);
    const { rows } = await pool.query(
      `
        UPDATE client_athlete_profile_sections
        SET name = $1,
            sort_order = $2,
            is_active = $3,
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
      `,
      [section.name, section.sort_order, section.is_active, req.params.sectionId]
    );

    await pool.query(
      `
        UPDATE client_athlete_profile_fields
        SET section = $1,
            updated_at = NOW()
        WHERE section_id = $2
      `,
      [section.name, req.params.sectionId]
    );

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Раздел с таким названием уже существует' });
    }
    return sendInternalError(res, err, { route: 'clients.athlete_sections.update' });
  }
});

router.delete('/athlete-profile/sections/:sectionId', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { rowCount: fieldCount } = await pool.query(
      'SELECT 1 FROM client_athlete_profile_fields WHERE section_id = $1 LIMIT 1',
      [req.params.sectionId]
    );

    if (fieldCount > 0) {
      return res.status(409).json({ success: false, error: 'Сначала удалите или перенесите поля из этого раздела' });
    }

    const { rowCount } = await pool.query(
      'DELETE FROM client_athlete_profile_sections WHERE id = $1',
      [req.params.sectionId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Раздел профиля не найден' });
    }

    res.json({ success: true, data: { id: req.params.sectionId } });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.athlete_sections.delete' });
  }
});

router.post('/athlete-profile/fields', requireOwnerOrAdmin, async (req, res) => {
  try {
    const field = normalizeAthleteFieldPayload(req.body);
    const { rows } = await pool.query(
      `
        INSERT INTO client_athlete_profile_fields (
          section_id, section, label, field_key, field_type, unit, options,
          sort_order, visible_to, editable_by, is_required, is_active
        )
        SELECT $1, s.name, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        FROM client_athlete_profile_sections s
        WHERE s.id = $1
        RETURNING client_athlete_profile_fields.*
      `,
      [
        field.section_id,
        field.label,
        field.field_key,
        field.field_type,
        field.unit,
        JSON.stringify(field.options),
        field.sort_order,
        field.visible_to,
        field.editable_by,
        field.is_required,
        field.is_active,
      ]
    );

    if (!rows[0]) {
      return res.status(422).json({ success: false, error: 'Выберите существующий раздел' });
    }

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Поле с таким кодом уже существует' });
    }
    return sendInternalError(res, err, { route: 'clients.athlete_fields.create' });
  }
});

router.patch('/athlete-profile/fields/:fieldId', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { rows: existingRows } = await pool.query(
      'SELECT * FROM client_athlete_profile_fields WHERE id = $1',
      [req.params.fieldId]
    );

    if (!existingRows[0]) {
      return res.status(404).json({ success: false, error: 'Поле профиля не найдено' });
    }

    const field = normalizeAthleteFieldPayload(req.body, existingRows[0]);
    const { rows } = await pool.query(
      `
        UPDATE client_athlete_profile_fields
        SET section_id = $1,
            section = s.name,
            label = $2,
            field_key = $3,
            field_type = $4,
            unit = $5,
            options = $6,
            sort_order = $7,
            visible_to = $8,
            editable_by = $9,
            is_required = $10,
            is_active = $11,
            updated_at = NOW()
        FROM client_athlete_profile_sections s
        WHERE client_athlete_profile_fields.id = $12
          AND s.id = $1
        RETURNING client_athlete_profile_fields.*
      `,
      [
        field.section_id,
        field.label,
        field.field_key,
        field.field_type,
        field.unit,
        JSON.stringify(field.options),
        field.sort_order,
        field.visible_to,
        field.editable_by,
        field.is_required,
        field.is_active,
        req.params.fieldId,
      ]
    );

    if (!rows[0]) {
      return res.status(422).json({ success: false, error: 'Выберите существующий раздел' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Поле с таким кодом уже существует' });
    }
    return sendInternalError(res, err, { route: 'clients.athlete_fields.update' });
  }
});

router.delete('/athlete-profile/fields/:fieldId', requireOwnerOrAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM client_athlete_profile_fields WHERE id = $1',
      [req.params.fieldId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Поле профиля не найдено' });
    }

    res.json({ success: true, data: { id: req.params.fieldId } });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.athlete_fields.delete' });
  }
});

router.post('/import', requireClientsImport, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ success: false, error: 'Файл не загружен' });
    }

    const content = fs.readFileSync(req.file.path, 'utf-8').replace(/^\uFEFF/, '');
    const records = csv.parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of records) {
      try {
        const lastName = (row['Фамилия'] || '').trim();
        const firstName = (row['Имя'] || '').trim();
        const email = (row['Email'] || '').trim() || null;
        const phone = (row['Телефон'] || '').trim() || null;
        const discount = Number.parseFloat(row['Скидка']) || 0;
        const comment = (row['Комментарий'] || '').trim() || null;
        const tags = (row['Теги'] || '').trim() || null;

        if (!lastName && !firstName) {
          results.skipped += 1;
          continue;
        }

        if (lastName.toLowerCase().includes('тест') || firstName.toLowerCase().includes('тест')) {
          results.skipped += 1;
          continue;
        }

        if (phone || email) {
          const conditions = [];
          const values = [];

          if (phone) {
            values.push(normalizePhone(phone));
            conditions.push(`phone_normalized = $${values.length}`);
          }
          if (email) {
            values.push(email);
            conditions.push(`email = $${values.length}`);
          }

          const { rowCount } = await pool.query(
            `SELECT id FROM clients WHERE ${conditions.join(' OR ')} LIMIT 1`,
            values
          );

          if (rowCount > 0) {
            results.skipped += 1;
            continue;
          }
        }

        const barcode = await generateClientBarcode();

        await pool.query(
          `
            INSERT INTO clients (first_name, last_name, phone, phone_normalized, email, discount, comment, barcode, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
          `,
          [
            firstName,
            lastName,
            phone,
            normalizePhone(phone),
            email,
            discount,
            [comment, tags ? `Теги: ${tags}` : null].filter(Boolean).join(' | ') || null,
            barcode,
          ]
        );

        results.created += 1;
      } catch (error) {
        results.errors.push(`${row['Фамилия'] || ''} ${row['Имя'] || ''}: ${error.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, data: results });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    sendInternalError(res, err, { route: 'clients.import' });
  }
});

router.get('/barcode/:barcode', requireClientsRead, async (req, res) => {
  try {
    await expireActiveSubscriptions(pool);

    const { rows } = await pool.query(
      `
        SELECT
          c.*,
          cs.id AS subscription_id,
          cs.type AS subscription_type,
          cs.status AS subscription_status,
          cs.visits_left,
          cs.expires_at
        FROM clients c
        LEFT JOIN LATERAL (
          SELECT *
          FROM client_subscriptions cs
          WHERE cs.client_id = c.id
            AND cs.status = 'active'
          ORDER BY cs.expires_at NULLS LAST, cs.created_at DESC
          LIMIT 1
        ) cs ON true
        WHERE c.barcode = $1
      `,
      [req.params.barcode]
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.create' });
  }
});

router.get('/:id/athlete-profile', requireClientsRead, async (req, res) => {
  try {
    const { rowCount } = await pool.query('SELECT 1 FROM clients WHERE id = $1', [req.params.id]);

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    const accessRoles = await getAthleteProfileAccessRoles(req.user);
    const profile = await getClientAthleteProfile(req.params.id, { accessRoles });
    res.json({ success: true, data: profile });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.athlete_profile.get' });
  }
});

router.patch('/:id/athlete-profile', async (req, res) => {
  const client = await pool.connect();

  try {
    const values = Array.isArray(req.body?.values) ? req.body.values : [];
    if (!values.length) {
      return res.status(422).json({ success: false, error: 'Нет данных для обновления' });
    }

    const { rowCount } = await client.query('SELECT 1 FROM clients WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    const accessRoles = await getAthleteProfileAccessRoles(req.user);
    const fields = await getAthleteProfileFields({ accessRoles, accessMode: 'editable' });
    const fieldsById = new Map(fields.map((field) => [String(field.id), field]));
    const updatedBy = req.user?.username || req.user?.name || `user:${req.user?.id || 'unknown'}`;

    await client.query('BEGIN');

    for (const item of values) {
      const field = fieldsById.get(String(item.field_id));
      if (!field) {
        throw Object.assign(new Error('Поле профиля не найдено или недоступно для редактирования'), { statusCode: 403 });
      }

      const normalizedValue = normalizeAthleteValue(field, item.value);
      if (normalizedValue === null) {
        await client.query(
          'DELETE FROM client_athlete_profile_values WHERE client_id = $1 AND field_id = $2',
          [req.params.id, field.id]
        );
        continue;
      }

      await client.query(
        `
          INSERT INTO client_athlete_profile_values (client_id, field_id, value, updated_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (client_id, field_id)
          DO UPDATE SET value = EXCLUDED.value,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = NOW()
        `,
        [req.params.id, field.id, JSON.stringify(normalizedValue), updatedBy]
      );
    }

    await client.query('COMMIT');

    const profile = await getClientAthleteProfile(req.params.id, { accessRoles });
    res.json({ success: true, data: profile });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, error: err.message });
    }

    return sendInternalError(res, err, { route: 'clients.athlete_profile.update' });
  } finally {
    client.release();
  }
});

router.get('/:id', requireClientsRead, async (req, res) => {
  try {
    const { rows: clientRows } = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);

    if (!clientRows[0]) {
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    await expireActiveSubscriptions(pool, { clientId: req.params.id });

    const { rows: subscriptions } = await pool.query(
      `SELECT cs.*, p.name AS product_name,
          COALESCE(psp.allow_free_visit, false) AS allow_free_visit,
          COALESCE(psp.allow_group_training, false) AS allow_group_training,
          COALESCE(psp.allow_personal_training, false) AS allow_personal_training,
          COALESCE(
            ARRAY_AGG(ptt.training_type_id::INT ORDER BY ptt.training_type_id)
              FILTER (WHERE ptt.training_type_id IS NOT NULL),
            ARRAY[]::INT[]
          ) AS training_type_ids
       FROM client_subscriptions cs
       LEFT JOIN products p ON p.id = cs.product_id
       LEFT JOIN product_subscription_params psp ON psp.product_id = cs.product_id
       LEFT JOIN product_training_types ptt ON ptt.product_id = cs.product_id
       WHERE cs.client_id = $1
       GROUP BY cs.id, p.name, psp.allow_free_visit, psp.allow_group_training, psp.allow_personal_training
       ORDER BY cs.created_at DESC`,
      [req.params.id]
    );
    const { rows: visits } = await pool.query(
      'SELECT * FROM client_visits WHERE client_id = $1 ORDER BY visited_at DESC LIMIT 20',
      [req.params.id]
    );
    const accessRoles = await getAthleteProfileAccessRoles(req.user);
    const athleteProfile = await getClientAthleteProfile(req.params.id, { accessRoles });

    res.json({
      success: true,
      data: {
        ...clientRows[0],
        subscriptions,
        visits,
        athlete_profile: athleteProfile,
      },
    });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.get' });
  }
});

router.post('/', requireClientsCreate, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      middle_name,
      phone,
      email,
      birth_date,
      discount,
      status,
      status_comment,
      comment,
    } = req.body;

    if (!first_name || !last_name) {
      return res.status(422).json({ success: false, error: 'Укажите имя и фамилию' });
    }

    const barcode = await generateClientBarcode();

    const { rows } = await pool.query(
      `
        INSERT INTO clients (
          first_name,
          last_name,
          middle_name,
          phone,
          phone_normalized,
          email,
          birth_date,
          barcode,
          discount,
          status,
          status_comment,
          comment
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *
      `,
      [
        first_name,
        last_name,
        middle_name || null,
        phone || null,
        normalizePhone(phone),
        email || null,
        birth_date || null,
        barcode,
        discount || 0,
        status || 'active',
        status_comment || null,
        comment || null,
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.update' });
  }
});

router.patch('/:id', requireClientsUpdate, async (req, res) => {
  try {
    const fields = [
      'first_name',
      'last_name',
      'middle_name',
      'phone',
      'email',
      'birth_date',
      'discount',
      'status',
      'status_comment',
      'comment',
    ];
    const updates = [];
    const values = [];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        values.push(req.body[field]);
        updates.push(`${field} = $${values.length}`);
      }
    });

    if (req.body.phone !== undefined) {
      values.push(normalizePhone(req.body.phone));
      updates.push(`phone_normalized = $${values.length}`);
    }

    if (!updates.length) {
      return res.status(422).json({ success: false, error: 'Нет данных для обновления' });
    }

    values.push(req.params.id);
    const { rows } = await pool.query(
      `
        UPDATE clients SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING *
      `,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.delete' });
  }
});

router.post('/:id/photo', requireClientsUpdate, handleClientPhotoUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ success: false, error: 'Загрузите фото клиента' });
    }

    const photoUrl = `/uploads/clients/${req.file.filename}`;
    const { rows } = await pool.query(
      `
        WITH previous AS (
          SELECT id, photo_url AS old_photo_url
          FROM clients
          WHERE id = $2
        ),
        updated AS (
          UPDATE clients c
          SET photo_url = $1,
              updated_at = NOW()
          FROM previous
          WHERE c.id = previous.id
          RETURNING c.*
        )
        SELECT updated.*, previous.old_photo_url
        FROM updated
        JOIN previous ON previous.id = updated.id
      `,
      [photoUrl, req.params.id]
    );

    if (!rows[0]) {
      fs.rm(req.file.path, { force: true }, () => {});
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    removeLocalClientPhoto(rows[0].old_photo_url);
    delete rows[0].old_photo_url;

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    if (req.file?.path) {
      fs.rm(req.file.path, { force: true }, () => {});
    }

    if (err.message === 'Unsupported client photo type') {
      return res.status(422).json({ success: false, error: 'Поддерживаются JPG, PNG или WebP' });
    }

    return sendInternalError(res, err, { route: 'clients.photo' });
  }
});

module.exports = router;
