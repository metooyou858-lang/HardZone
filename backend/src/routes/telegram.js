const express = require('express');
const { createHmac, timingSafeEqual } = require('node:crypto');

const { handleTelegramUpdate } = require('../services/telegram-bot');
const { resolveModules } = require('../authz');
const { pool, query } = require('../db');
const logger = require('../services/logger');
const { expireActiveSubscriptions } = require('../services/subscription-validity');
const { createTrainingBooking } = require('../services/booking-attendance');
const { assertSubscriptionAccess } = require('../services/subscription-access');
const { sendInternalError } = require('../utils/http-response');
const { normalizePhone } = require('../utils/phones');

const router = express.Router();

function isTelegramEnabled() {
  return process.env.TELEGRAM_ENABLED === 'true';
}

function getWebhookSecret() {
  return String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

function getBotToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function getClientBotToken() {
  return String(process.env.TELEGRAM_CLIENT_BOT_TOKEN || '').trim();
}

function isSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseTelegramInitData(initData, botToken = getBotToken()) {
  const params = new URLSearchParams(String(initData || ''));
  const hash = params.get('hash');

  if (!hash || !botToken) {
    return null;
  }

  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!isSafeEqual(expectedHash, hash)) {
    return null;
  }

  const authDate = Number.parseInt(params.get('auth_date') || '', 10);
  if (!Number.isInteger(authDate) || Date.now() / 1000 - authDate > 24 * 60 * 60) {
    return null;
  }

  try {
    return JSON.parse(params.get('user') || '{}');
  } catch {
    return null;
  }
}

function toSessionUser(user) {
  return {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    role: user.role,
    role_title: user.role_title,
    modules: resolveModules(user.role, user.module_grants, user.module_revokes),
  };
}

async function findSessionUserByTelegramId(telegramId) {
  const { rows } = await query(
    `
      SELECT id, name, role, role_title, username, is_active, module_grants, module_revokes
      FROM users
      WHERE telegram_id = $1
      LIMIT 1
    `,
    [String(telegramId)]
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    return null;
  }

  return toSessionUser(user);
}

async function linkSessionUserByPhone(telegramId, phone) {
  const phoneNormalized = normalizePhone(phone);

  if (!phoneNormalized) {
    return { status: 'invalid_phone' };
  }

  const { rows } = await query(
    `
      SELECT id, name, role, role_title, username, is_active, module_grants, module_revokes
      FROM users
      WHERE phone_normalized = $1
        AND is_active = true
      ORDER BY id
    `,
    [phoneNormalized]
  );

  if (rows.length === 0) {
    return { status: 'not_found', phone_normalized: phoneNormalized };
  }

  if (rows.length > 1) {
    return { status: 'duplicate', phone_normalized: phoneNormalized };
  }

  const user = rows[0];
  await query(
    `
      UPDATE users
      SET telegram_id = $1,
          phone = COALESCE(NULLIF(phone, ''), $2),
          phone_normalized = $3,
          updated_at = NOW()
      WHERE id = $4
    `,
    [String(telegramId), phone, phoneNormalized, user.id]
  );

  return {
    status: 'linked',
    user: toSessionUser(user),
  };
}

function toClientIdentity(client) {
  return {
    id: Number(client.id),
    first_name: client.first_name,
    last_name: client.last_name,
    middle_name: client.middle_name,
    phone: client.phone,
    email: client.email,
    barcode: client.barcode,
    status: client.status,
  };
}

function normalizeClientAthleteValue(field, value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (field.field_type === 'number') {
    const normalized = String(value).replace(',', '.').trim();
    const number = Number(normalized);
    if (!Number.isFinite(number)) {
      throw Object.assign(new Error(`Поле "${field.label}" ожидает число`), { statusCode: 422 });
    }
    return number;
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

async function getClientMiniAppAthleteProfile(clientId) {
  const { rows } = await query(
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
      WHERE f.is_active = true
        AND s.is_active = true
        AND 'client' = ANY(f.visible_to)
      ORDER BY s.sort_order, f.sort_order, f.id
    `,
    [clientId]
  );

  return rows.map((field) => ({
    ...field,
    options: Array.isArray(field.options) ? field.options : [],
    visible_to: Array.isArray(field.visible_to) ? field.visible_to : [],
    editable_by: Array.isArray(field.editable_by) ? field.editable_by : [],
    value: field.value ?? null,
    can_edit: Array.isArray(field.editable_by) && field.editable_by.includes('client'),
  }));
}

async function updateClientMiniAppAthleteProfile(clientId, values, updatedBy) {
  if (!Array.isArray(values) || values.length === 0) {
    return { status: 'empty' };
  }

  const dbClient = await pool.connect();

  try {
    const { rows: fields } = await dbClient.query(
      `
        SELECT f.*
        FROM client_athlete_profile_fields f
        JOIN client_athlete_profile_sections s ON s.id = f.section_id
        WHERE f.is_active = true
          AND s.is_active = true
          AND 'client' = ANY(f.visible_to)
          AND 'client' = ANY(f.editable_by)
      `
    );
    const fieldsById = new Map(fields.map((field) => [String(field.id), field]));

    await dbClient.query('BEGIN');

    for (const item of values) {
      const field = fieldsById.get(String(item?.field_id));
      if (!field) {
        throw Object.assign(new Error('Поле профиля не найдено или недоступно для редактирования'), { statusCode: 403 });
      }

      const normalizedValue = normalizeClientAthleteValue(field, item.value);
      if (normalizedValue === null) {
        await dbClient.query(
          'DELETE FROM client_athlete_profile_values WHERE client_id = $1 AND field_id = $2',
          [clientId, field.id]
        );
        continue;
      }

      await dbClient.query(
        `
          INSERT INTO client_athlete_profile_values (client_id, field_id, value, updated_by)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (client_id, field_id)
          DO UPDATE SET value = EXCLUDED.value,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = NOW()
        `,
        [clientId, field.id, JSON.stringify(normalizedValue), updatedBy]
      );
    }

    await dbClient.query('COMMIT');
    return { status: 'saved' };
  } catch (error) {
    await dbClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    dbClient.release();
  }
}

async function logClientMiniAppAuthAttempt({
  action,
  status,
  telegramUser,
  phoneNormalized = null,
  matchedClientId = null,
  errorCode = null,
}) {
  try {
    await query(
      `
        INSERT INTO client_miniapp_auth_audit (
          action, status, telegram_id, telegram_username,
          phone_normalized, matched_client_id, error_code
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        action,
        status,
        telegramUser?.id ? String(telegramUser.id) : null,
        telegramUser?.username ? String(telegramUser.username) : null,
        phoneNormalized,
        matchedClientId,
        errorCode,
      ]
    );
  } catch (error) {
    logger.warn('telegram_client_auth_audit_failed', {
      action,
      status,
      message: error.message,
    });
  }
}

async function buildClientMiniAppPayload(clientId) {
  const { rows: clientRows } = await query(
    `
      SELECT id, first_name, last_name, middle_name, phone, email, barcode, status
      FROM clients
      WHERE id = $1
      LIMIT 1
    `,
    [clientId]
  );

  const client = clientRows[0];
  if (!client) {
    return null;
  }

  await expireActiveSubscriptions(pool, { clientId: client.id });

  const { rows: subscriptions } = await query(
    `
      SELECT
        cs.id,
        cs.type,
        cs.status,
        cs.visits_total,
        cs.visits_left,
        cs.started_at,
        cs.expires_at,
        cs.is_family,
        p.name AS product_name
      FROM client_subscriptions cs
      LEFT JOIN products p ON p.id = cs.product_id
      WHERE cs.client_id = $1
      ORDER BY
        CASE cs.status WHEN 'active' THEN 0 WHEN 'frozen' THEN 1 ELSE 2 END,
        cs.expires_at NULLS LAST,
        cs.created_at DESC
      LIMIT 5
    `,
    [client.id]
  );

  const { rows: bookings } = await query(
    `
      SELECT
        b.id,
        b.status,
        b.coverage_status,
        b.coverage_reason,
        ss.date,
        ss.start_time,
        ss.duration_minutes,
        tt.name AS training_type_name,
        tr.first_name || ' ' || tr.last_name AS trainer_name
      FROM bookings b
      JOIN schedule_slots ss ON ss.id = b.slot_id
      LEFT JOIN training_types tt ON tt.id = ss.training_type_id
      LEFT JOIN trainers tr ON tr.id = ss.trainer_id
      WHERE b.client_id = $1
        AND b.status IN ('confirmed', 'attended')
        AND ss.status = 'active'
        AND ss.date >= CURRENT_DATE
      ORDER BY ss.date, ss.start_time
      LIMIT 8
    `,
    [client.id]
  );

  const { rows: visits } = await query(
    `
      SELECT
        cv.id,
        cv.visit_type,
        cv.visited_at,
        cv.coverage_status,
        cv.coverage_reason,
        ss.date,
        ss.start_time,
        tt.name AS training_type_name
      FROM client_visits cv
      LEFT JOIN schedule_slots ss ON ss.id = cv.slot_id
      LEFT JOIN training_types tt ON tt.id = ss.training_type_id
      WHERE cv.client_id = $1
      ORDER BY cv.visited_at DESC
      LIMIT 8
    `,
    [client.id]
  );

  const { rows: availableSlots } = await query(
    `
      SELECT
        ss.id,
        ss.date,
        ss.start_time,
        ss.duration_minutes,
        ss.capacity,
        ss.slot_type,
        ss.is_free,
        ss.block_if_empty_hours,
        tt.name AS training_type_name,
        tt.color AS training_type_color,
        tt.description AS training_type_description,
        tt.audience AS training_type_audience,
        tt.location AS training_type_location,
        tt.booking_note AS training_type_booking_note,
        tt.tags AS training_type_tags,
        tr.id AS trainer_id,
        tr.first_name || ' ' || tr.last_name AS trainer_name,
        tr.photo_url AS trainer_photo_url,
        COALESCE(rs.rating, 0)::FLOAT AS trainer_rating,
        COALESCE(rs.reviews_count, 0)::INT AS trainer_reviews_count,
        COALESCE(SUM(
          CASE
            WHEN b.status IN ('confirmed', 'attended') THEN b.places_count
            ELSE 0
          END
        ), 0)::INT AS booked_count,
        BOOL_OR(b.client_id = $1 AND b.status IN ('confirmed', 'attended')) AS is_booked,
        MAX(CASE
          WHEN b.client_id = $1 AND b.status IN ('confirmed', 'attended') THEN b.id
          ELSE NULL
        END) AS client_booking_id
        ,
        MAX(CASE
          WHEN b.client_id = $1 AND b.status IN ('confirmed', 'attended') THEN b.status
          ELSE NULL
        END) AS client_booking_status
      FROM schedule_slots ss
      LEFT JOIN training_types tt ON tt.id = ss.training_type_id
      LEFT JOIN trainers tr ON tr.id = ss.trainer_id
      LEFT JOIN (
        SELECT
          trainer_id,
          ROUND(AVG(rating)::NUMERIC, 1) AS rating,
          COUNT(*) AS reviews_count
        FROM trainer_reviews
        WHERE is_visible = true
        GROUP BY trainer_id
      ) rs ON rs.trainer_id = tr.id
      LEFT JOIN bookings b ON b.slot_id = ss.id
      WHERE ss.status = 'active'
        AND ss.slot_type = 'group'
        AND ss.date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
      GROUP BY ss.id, tt.name, tt.color, tt.description, tt.audience, tt.location, tt.booking_note, tt.tags, tr.id, tr.first_name, tr.last_name, tr.photo_url, rs.rating, rs.reviews_count
      HAVING ss.capacity > COALESCE(SUM(CASE WHEN b.status IN ('confirmed', 'attended') THEN b.places_count ELSE 0 END), 0)
        OR COALESCE(BOOL_OR(b.client_id = $1 AND b.status IN ('confirmed', 'attended')), false)
      ORDER BY ss.date, ss.start_time
      LIMIT 120
    `,
    [client.id]
  );

  const { rows: trainers } = await query(
    `
      WITH review_preview AS (
        SELECT
          trainer_id,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', id,
                'rating', rating,
                'comment', comment,
                'created_at', created_at,
                'updated_at', updated_at,
                'client_name', client_name
              )
              ORDER BY created_at DESC
            ),
            '[]'::jsonb
          ) AS reviews
        FROM (
          SELECT
            tr.id,
            tr.trainer_id,
            tr.rating,
            tr.comment,
            tr.created_at,
            tr.updated_at,
            NULLIF(CONCAT_WS(' ', c.last_name, c.first_name), '') AS client_name,
            ROW_NUMBER() OVER (PARTITION BY tr.trainer_id ORDER BY tr.created_at DESC) AS row_number
          FROM trainer_reviews tr
          LEFT JOIN clients c ON c.id = tr.client_id
          WHERE tr.is_visible = true
        ) ranked_reviews
        WHERE row_number <= 8
        GROUP BY trainer_id
      )
      SELECT
        t.id,
        t.first_name,
        t.last_name,
        t.position,
        t.bio,
        t.photo_url,
        COALESCE(rs.rating, 0)::FLOAT AS rating,
        COALESCE(rs.reviews_count, 0)::INT AS reviews_count,
        COALESCE(rp.reviews, '[]'::jsonb) AS reviews,
        t.specialties,
        CASE
          WHEN my_review.id IS NULL THEN NULL
          ELSE json_build_object(
            'rating', my_review.rating,
            'comment', my_review.comment,
            'updated_at', my_review.updated_at
          )
        END AS my_review,
        COALESCE(json_agg(tt.*) FILTER (WHERE tt.id IS NOT NULL), '[]') AS training_types
      FROM trainers t
      LEFT JOIN trainer_training_types ttt ON ttt.trainer_id = t.id
      LEFT JOIN training_types tt ON tt.id = ttt.training_type_id AND tt.is_active = true
      LEFT JOIN (
        SELECT
          trainer_id,
          ROUND(AVG(rating)::NUMERIC, 1) AS rating,
          COUNT(*) AS reviews_count
        FROM trainer_reviews
        WHERE is_visible = true
        GROUP BY trainer_id
      ) rs ON rs.trainer_id = t.id
      LEFT JOIN review_preview rp ON rp.trainer_id = t.id
      LEFT JOIN trainer_reviews my_review ON my_review.trainer_id = t.id
        AND my_review.client_id = $1
        AND my_review.is_visible = true
      WHERE t.is_active = true
      GROUP BY t.id, rs.rating, rs.reviews_count, rp.reviews, my_review.id
      ORDER BY t.last_name, t.first_name
      LIMIT 50
    `,
    [client.id]
  );

  const { rows: debtRows } = await query(
    `
      SELECT COUNT(*)::INT AS unpaid_missed_count
      FROM bookings
      WHERE client_id = $1
        AND status = 'missed'
        AND subscription_id IS NULL
    `,
    [client.id]
  );

  const athleteProfile = await getClientMiniAppAthleteProfile(client.id);

  return {
    client: toClientIdentity(client),
    subscriptions,
    bookings,
    visits,
      available_slots: availableSlots.map((slot) => ({
        ...slot,
        training_type_tags: Array.isArray(slot.training_type_tags) ? slot.training_type_tags : [],
        trainer_rating: slot.trainer_rating === null ? null : Number(slot.trainer_rating),
        free_places: Math.max(0, Number(slot.capacity || 0) - Number(slot.booked_count || 0)),
        is_booked: Boolean(slot.is_booked),
        can_cancel_booking: Boolean(slot.is_booked) && slot.client_booking_status === 'confirmed',
      })),
    trainers: trainers.map((trainer) => ({
      ...trainer,
      rating: trainer.rating === null ? null : Number(trainer.rating),
      reviews_count: Number(trainer.reviews_count || 0),
      reviews: Array.isArray(trainer.reviews) ? trainer.reviews : [],
      specialties: Array.isArray(trainer.specialties) ? trainer.specialties : [],
    })),
    debt: {
      unpaid_missed_count: Number(debtRows[0]?.unpaid_missed_count || 0),
    },
    athlete_profile: athleteProfile,
  };
}

async function findClientIdByTelegramId(telegramId) {
  const { rows } = await query(
    `
      SELECT id
      FROM clients
      WHERE telegram_id = $1
        AND status <> 'inactive'
      LIMIT 1
    `,
    [String(telegramId)]
  );

  if (!rows[0]) {
    return null;
  }

  return rows[0].id;
}

async function findClientByTelegramId(telegramId) {
  const clientId = await findClientIdByTelegramId(telegramId);
  if (!clientId) {
    return null;
  }

  return buildClientMiniAppPayload(clientId);
}

async function linkClientByPhone(telegramId, phone) {
  const phoneNormalized = normalizePhone(phone);

  if (!phoneNormalized) {
    return { status: 'invalid_phone' };
  }

  const { rows } = await query(
    `
      SELECT id
      FROM clients
      WHERE phone_normalized = $1
        AND status <> 'inactive'
      ORDER BY id
    `,
    [phoneNormalized]
  );

  if (rows.length === 0) {
    return { status: 'not_found', phone_normalized: phoneNormalized };
  }

  if (rows.length > 1) {
    return { status: 'duplicate', phone_normalized: phoneNormalized };
  }

  const matchedClientId = rows[0].id;

  await query(
    `
      UPDATE clients
      SET telegram_id = $1,
          phone = COALESCE(NULLIF(phone, ''), $2),
          phone_normalized = $3,
          updated_at = NOW()
      WHERE id = $4
    `,
    [String(telegramId), phone, phoneNormalized, matchedClientId]
  );

  return {
    status: 'linked',
    phone_normalized: phoneNormalized,
    matched_client_id: matchedClientId,
    data: await buildClientMiniAppPayload(matchedClientId),
  };
}

function getTelegramClientName(telegramUser) {
  const firstName = String(telegramUser?.first_name || '').trim();
  const lastName = String(telegramUser?.last_name || '').trim();
  const username = String(telegramUser?.username || '').trim();

  return {
    firstName: firstName || username || 'Клиент',
    lastName,
  };
}

async function createAndLinkClientByPhone(telegramUser, phone) {
  const phoneNormalized = normalizePhone(phone);

  if (!phoneNormalized) {
    return { status: 'invalid_phone' };
  }

  const telegramId = String(telegramUser.id);
  const existingByTelegram = await findClientIdByTelegramId(telegramId);
  if (existingByTelegram) {
    return {
      status: 'linked',
      phone_normalized: phoneNormalized,
      matched_client_id: existingByTelegram,
      data: await buildClientMiniAppPayload(existingByTelegram),
    };
  }

  const { rows: inactiveTelegramRows } = await query(
    `
      SELECT id
      FROM clients
      WHERE telegram_id = $1
      LIMIT 1
    `,
    [telegramId]
  );

  if (inactiveTelegramRows[0]) {
    const { firstName, lastName } = getTelegramClientName(telegramUser);
    const clientId = inactiveTelegramRows[0].id;
    await query(
      `
        UPDATE clients
        SET first_name = CASE WHEN NULLIF(first_name, '') IS NULL THEN $1 ELSE first_name END,
            last_name = CASE WHEN NULLIF(last_name, '') IS NULL THEN $2 ELSE last_name END,
            phone = COALESCE(NULLIF(phone, ''), $3),
            phone_normalized = $4,
            status = 'active',
            updated_at = NOW()
        WHERE id = $5
      `,
      [firstName, lastName, phone, phoneNormalized, clientId]
    );

    return {
      status: 'linked',
      phone_normalized: phoneNormalized,
      matched_client_id: clientId,
      data: await buildClientMiniAppPayload(clientId),
    };
  }

  const linkedResult = await linkClientByPhone(telegramId, phone);
  if (linkedResult.status !== 'not_found') {
    return linkedResult;
  }

  const { firstName, lastName } = getTelegramClientName(telegramUser);
  const { rows } = await query(
    `
      INSERT INTO clients (
        first_name, last_name, phone, phone_normalized, telegram_id, status, comment, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW())
      RETURNING id
    `,
    [
      firstName,
      lastName,
      phone,
      phoneNormalized,
      telegramId,
      'Создан через клиентский Telegram Mini App',
    ]
  );

  const clientId = rows[0].id;
  return {
    status: 'created',
    phone_normalized: phoneNormalized,
    matched_client_id: clientId,
    data: await buildClientMiniAppPayload(clientId),
  };
}

function combineSlotDateTime(dateValue, timeValue) {
  return new Date(`${String(dateValue).slice(0, 10)}T${String(timeValue).slice(0, 8)}`);
}

async function bookClientSlot(telegramId, slotId) {
  const clientId = await findClientIdByTelegramId(telegramId);
  if (!clientId) {
    return { status: 'not_linked' };
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query('BEGIN');

    const { rows: slotRows } = await dbClient.query(
      `
        SELECT *
        FROM schedule_slots
        WHERE id = $1
          AND status = 'active'
          AND slot_type = 'group'
        LIMIT 1
      `,
      [slotId]
    );

    const slot = slotRows[0];
    if (!slot) {
      await dbClient.query('ROLLBACK');
      return { status: 'slot_not_found' };
    }

    const slotDateTime = combineSlotDateTime(slot.date, slot.start_time);
    if (slotDateTime <= new Date()) {
      await dbClient.query('ROLLBACK');
      return { status: 'slot_started' };
    }

    if (slot.block_if_empty_hours && Number(slot.booked_count || 0) === 0) {
      const hoursUntil = (slotDateTime.getTime() - Date.now()) / 3600000;
      if (hoursUntil <= slot.block_if_empty_hours) {
        await dbClient.query('ROLLBACK');
        return { status: 'booking_closed' };
      }
    }

    await expireActiveSubscriptions(dbClient, { clientId });

    const { rows: subscriptionRows } = await dbClient.query(
      `
        SELECT id
        FROM client_subscriptions
        WHERE client_id = $1
          AND status = 'active'
          AND (
            type IN ('period', 'unlimited')
            OR COALESCE(visits_left, 0) > 0
          )
        ORDER BY expires_at NULLS LAST, created_at DESC
      `,
      [clientId]
    );

    let subscription = null;
    for (const candidate of subscriptionRows) {
      try {
        subscription = await assertSubscriptionAccess(dbClient, {
          subscriptionId: candidate.id,
          clientId,
          context: {
            kind: 'slot',
            slotId: slot.id,
            slotType: slot.slot_type,
            trainingTypeId: slot.training_type_id,
          },
        });
        break;
      } catch (error) {
        if (![404, 409].includes(error.statusCode)) {
          throw error;
        }
      }
    }

    const placesCount = subscription?.is_family ? 2 : 1;

    const { rows: countRows } = await dbClient.query(
      `
        SELECT COALESCE(SUM(places_count), 0)::INT AS booked_count
        FROM bookings
        WHERE slot_id = $1
          AND status IN ('confirmed', 'attended')
      `,
      [slot.id]
    );

    if (Number(countRows[0]?.booked_count || 0) + placesCount > Number(slot.capacity || 0)) {
      await dbClient.query('ROLLBACK');
      return { status: 'no_places' };
    }

    const { rows: existingRows } = await dbClient.query(
      `
        SELECT id
        FROM bookings
        WHERE slot_id = $1
          AND client_id = $2
          AND status IN ('confirmed', 'attended')
        LIMIT 1
      `,
      [slot.id, clientId]
    );

    if (existingRows.length > 0) {
      await dbClient.query('ROLLBACK');
      return { status: 'already_booked' };
    }

    await createTrainingBooking(dbClient, {
      slotId: slot.id,
      clientId,
      subscriptionId: subscription?.id || null,
      bookedBy: `telegram-client:${telegramId}`,
      allowUnpaid: !subscription,
      unpaidReason: 'no_subscription',
    });

    await dbClient.query('COMMIT');
    return {
      status: 'booked',
      coverage_status: subscription ? 'pending' : 'unpaid',
      data: await buildClientMiniAppPayload(clientId),
    };
  } catch (error) {
    await dbClient.query('ROLLBACK');
    throw error;
  } finally {
    dbClient.release();
  }
}

async function cancelClientBooking(telegramId, bookingId) {
  const clientId = await findClientIdByTelegramId(telegramId);
  if (!clientId) {
    return { status: 'not_linked' };
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query('BEGIN');

    const { rows: bookingRows } = await dbClient.query(
      `
        SELECT b.*, ss.date, ss.start_time
        FROM bookings b
        JOIN schedule_slots ss ON ss.id = b.slot_id
        WHERE b.id = $1
          AND b.client_id = $2
        LIMIT 1
      `,
      [bookingId, clientId]
    );

    const booking = bookingRows[0];
    if (!booking) {
      await dbClient.query('ROLLBACK');
      return { status: 'booking_not_found' };
    }

    if (booking.status === 'attended') {
      await dbClient.query('ROLLBACK');
      return { status: 'already_attended' };
    }

    if (booking.status !== 'confirmed') {
      await dbClient.query('ROLLBACK');
      return { status: 'already_cancelled' };
    }

    if (combineSlotDateTime(booking.date, booking.start_time) <= new Date()) {
      await dbClient.query('ROLLBACK');
      return { status: 'slot_started' };
    }

    await dbClient.query('DELETE FROM bookings WHERE id = $1', [booking.id]);
    await dbClient.query(
      'UPDATE schedule_slots SET booked_count = GREATEST(booked_count - $1, 0), updated_at = NOW() WHERE id = $2',
      [booking.places_count, booking.slot_id]
    );

    await dbClient.query('COMMIT');
    return { status: 'cancelled', data: await buildClientMiniAppPayload(clientId) };
  } catch (error) {
    await dbClient.query('ROLLBACK');
    throw error;
  } finally {
    dbClient.release();
  }
}

async function saveTrainerReview(telegramId, trainerId, rating, comment) {
  const clientId = await findClientIdByTelegramId(telegramId);
  if (!clientId) {
    return { status: 'not_linked' };
  }

  const normalizedRating = Number.parseInt(rating, 10);
  if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    return { status: 'invalid_rating' };
  }

  const { rows: trainerRows } = await query(
    `
      SELECT id
      FROM trainers
      WHERE id = $1
        AND is_active = true
      LIMIT 1
    `,
    [trainerId]
  );

  if (!trainerRows[0]) {
    return { status: 'trainer_not_found' };
  }

  const normalizedComment = String(comment || '').trim().slice(0, 1000) || null;
  await query(
    `
      INSERT INTO trainer_reviews (trainer_id, client_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (trainer_id, client_id)
      DO UPDATE SET
        rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        is_visible = true,
        updated_at = NOW()
    `,
    [trainerId, clientId, normalizedRating, normalizedComment]
  );

  return { status: 'saved', data: await buildClientMiniAppPayload(clientId) };
}

router.post('/miniapp-login', async (req, res) => {
  try {
    if (!getBotToken()) {
      return res.status(503).json({ success: false, error: 'Telegram bot token is not configured' });
    }

    const telegramUser = parseTelegramInitData(req.body?.init_data);
    if (!telegramUser?.id) {
      return res.status(401).json({ success: false, error: 'Telegram авторизация недействительна' });
    }

    const user = await findSessionUserByTelegramId(telegramUser.id);
    if (!user) {
      return res.status(403).json({ success: false, error: 'Telegram не привязан к сотруднику HardZone' });
    }

    return res.json({ success: true, data: { user } });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.miniapp_login' });
  }
});

router.post('/miniapp-link-phone', async (req, res) => {
  try {
    if (!getBotToken()) {
      return res.status(503).json({ success: false, error: 'Telegram bot token is not configured' });
    }

    const telegramUser = parseTelegramInitData(req.body?.init_data);
    if (!telegramUser?.id) {
      return res.status(401).json({ success: false, error: 'Telegram авторизация недействительна' });
    }

    const result = await linkSessionUserByPhone(telegramUser.id, req.body?.phone);
    if (result.status === 'invalid_phone') {
      return res.status(422).json({ success: false, error: 'Укажите корректный номер телефона' });
    }

    if (result.status === 'not_found') {
      return res.status(404).json({ success: false, error: 'Номер не найден среди активных сотрудников HardZone' });
    }

    if (result.status === 'duplicate') {
      return res.status(409).json({
        success: false,
        error: 'В CRM найдено несколько сотрудников с таким номером. Обратитесь к администратору.',
      });
    }

    return res.json({ success: true, data: { user: result.user } });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.miniapp_link_phone' });
  }
});

router.post('/client-miniapp-login', async (req, res) => {
  try {
    const clientBotToken = getClientBotToken();
    if (!clientBotToken) {
      return res.status(503).json({ success: false, error: 'Telegram client bot token is not configured' });
    }

    const telegramUser = parseTelegramInitData(req.body?.init_data, clientBotToken);
    if (!telegramUser?.id) {
      return res.status(401).json({ success: false, error: 'Telegram авторизация недействительна' });
    }

    const data = await findClientByTelegramId(telegramUser.id);
    if (!data) {
      await logClientMiniAppAuthAttempt({
        action: 'login',
        status: 'not_linked',
        telegramUser,
        errorCode: 'telegram_not_linked',
      });
      return res.status(403).json({ success: false, error: 'Telegram не привязан к клиенту HardZone' });
    }

    await logClientMiniAppAuthAttempt({
      action: 'login',
      status: 'success',
      telegramUser,
      matchedClientId: data.client.id,
    });

    return res.json({ success: true, data });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.client_miniapp_login' });
  }
});

router.post('/client-miniapp-link-phone', async (req, res) => {
  try {
    const clientBotToken = getClientBotToken();
    if (!clientBotToken) {
      return res.status(503).json({ success: false, error: 'Telegram client bot token is not configured' });
    }

    const telegramUser = parseTelegramInitData(req.body?.init_data, clientBotToken);
    if (!telegramUser?.id) {
      return res.status(401).json({ success: false, error: 'Telegram авторизация недействительна' });
    }

    const result = await createAndLinkClientByPhone(telegramUser, req.body?.phone);
    if (result.status === 'invalid_phone') {
      await logClientMiniAppAuthAttempt({
        action: 'link_phone',
        status: 'invalid_phone',
        telegramUser,
        errorCode: 'invalid_phone',
      });
      return res.status(422).json({ success: false, error: 'Укажите корректный номер телефона' });
    }

    if (result.status === 'duplicate') {
      await logClientMiniAppAuthAttempt({
        action: 'link_phone',
        status: 'duplicate',
        telegramUser,
        phoneNormalized: result.phone_normalized,
        errorCode: 'client_phone_duplicate',
      });
      return res.status(409).json({
        success: false,
        error: 'В CRM найдено несколько клиентов с таким номером. Обратитесь к администратору.',
      });
    }

    await logClientMiniAppAuthAttempt({
      action: 'link_phone',
      status: result.status === 'created' ? 'created' : 'linked',
      telegramUser,
      phoneNormalized: result.phone_normalized,
      matchedClientId: result.matched_client_id,
    });

    return res.json({ success: true, data: result.data });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.client_miniapp_link_phone' });
  }
});

router.post('/client-miniapp-book', async (req, res) => {
  try {
    const clientBotToken = getClientBotToken();
    if (!clientBotToken) {
      return res.status(503).json({ success: false, error: 'Telegram client bot token is not configured' });
    }

    const telegramUser = parseTelegramInitData(req.body?.init_data, clientBotToken);
    if (!telegramUser?.id) {
      return res.status(401).json({ success: false, error: 'Telegram авторизация недействительна' });
    }

    if (!req.body?.slot_id) {
      return res.status(422).json({ success: false, error: 'Укажите занятие' });
    }

    const result = await bookClientSlot(telegramUser.id, req.body.slot_id);
    const errorByStatus = {
      not_linked: [403, 'Telegram не привязан к клиенту HardZone'],
      slot_not_found: [404, 'Занятие не найдено или отменено'],
      slot_started: [409, 'Запись закрыта после начала занятия'],
      booking_closed: [409, 'Запись закрыта'],
      no_subscription: [409, 'Нет активного абонемента для записи'],
      no_places: [409, 'Нет свободных мест'],
      already_booked: [409, 'Вы уже записаны на это занятие'],
    };

    if (result.status !== 'booked') {
      const [status, message] = errorByStatus[result.status] || [500, 'Не удалось записаться'];
      return res.status(status).json({ success: false, error: message });
    }

    return res.status(201).json({ success: true, data: result.data });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.client_miniapp_book' });
  }
});

router.post('/client-miniapp-cancel-booking', async (req, res) => {
  try {
    const clientBotToken = getClientBotToken();
    if (!clientBotToken) {
      return res.status(503).json({ success: false, error: 'Telegram client bot token is not configured' });
    }

    const telegramUser = parseTelegramInitData(req.body?.init_data, clientBotToken);
    if (!telegramUser?.id) {
      return res.status(401).json({ success: false, error: 'Telegram авторизация недействительна' });
    }

    if (!req.body?.booking_id) {
      return res.status(422).json({ success: false, error: 'Укажите запись' });
    }

    const result = await cancelClientBooking(telegramUser.id, req.body.booking_id);
    const errorByStatus = {
      not_linked: [403, 'Telegram не привязан к клиенту HardZone'],
      booking_not_found: [404, 'Запись не найдена'],
      already_attended: [409, 'Посещение уже отмечено. Отменить запись после отметки прихода нельзя.'],
      already_cancelled: [409, 'Эта запись уже отменена или закрыта'],
      slot_started: [409, 'Нельзя отменить запись после начала занятия'],
    };

    if (result.status !== 'cancelled') {
      const [status, message] = errorByStatus[result.status] || [500, 'Не удалось отменить запись'];
      return res.status(status).json({ success: false, error: message });
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.client_miniapp_cancel_booking' });
  }
});

router.post('/client-miniapp-trainer-review', async (req, res) => {
  try {
    const clientBotToken = getClientBotToken();
    if (!clientBotToken) {
      return res.status(503).json({ success: false, error: 'Telegram client bot token is not configured' });
    }

    const telegramUser = parseTelegramInitData(req.body?.init_data, clientBotToken);
    if (!telegramUser?.id) {
      return res.status(401).json({ success: false, error: 'Telegram авторизация недействительна' });
    }

    if (!req.body?.trainer_id) {
      return res.status(422).json({ success: false, error: 'Укажите тренера' });
    }

    const result = await saveTrainerReview(
      telegramUser.id,
      req.body.trainer_id,
      req.body.rating,
      req.body.comment
    );
    const errorByStatus = {
      not_linked: [403, 'Telegram не привязан к клиенту HardZone'],
      invalid_rating: [422, 'Оценка должна быть от 1 до 5'],
      trainer_not_found: [404, 'Тренер не найден'],
    };

    if (result.status !== 'saved') {
      const [status, message] = errorByStatus[result.status] || [500, 'Не удалось сохранить отзыв'];
      return res.status(status).json({ success: false, error: message });
    }

    return res.json({ success: true, data: result.data });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.client_miniapp_trainer_review' });
  }
});

router.post('/client-miniapp-athlete-profile', async (req, res) => {
  try {
    const clientBotToken = getClientBotToken();
    if (!clientBotToken) {
      return res.status(503).json({ success: false, error: 'Telegram client bot token is not configured' });
    }

    const telegramUser = parseTelegramInitData(req.body?.init_data, clientBotToken);
    if (!telegramUser?.id) {
      return res.status(401).json({ success: false, error: 'Telegram авторизация недействительна' });
    }

    const clientId = await findClientIdByTelegramId(telegramUser.id);
    if (!clientId) {
      return res.status(403).json({ success: false, error: 'Telegram не привязан к клиенту HardZone' });
    }

    const result = await updateClientMiniAppAthleteProfile(
      clientId,
      req.body?.values,
      `telegram-client:${telegramUser.id}`
    );

    if (result.status === 'empty') {
      return res.status(422).json({ success: false, error: 'Нет данных для обновления' });
    }

    return res.json({ success: true, data: await buildClientMiniAppPayload(clientId) });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }

    return sendInternalError(res, error, { route: 'telegram.client_miniapp_athlete_profile' });
  }
});

router.post('/webhook/:secret', async (req, res) => {
  try {
    const expectedSecret = getWebhookSecret();
    const actualSecret = String(req.params.secret || '');

    if (!isTelegramEnabled() || !expectedSecret || actualSecret !== expectedSecret) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    res.json({ success: true });

    handleTelegramUpdate(req.body || {}).catch((error) => {
      logger.error('telegram', {
        action: 'handle_update_failed',
        message: error.message,
        stack: error.stack,
      });
    });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.webhook' });
  }
});

router.findClientByTelegramId = findClientByTelegramId;
router.buildClientMiniAppPayload = buildClientMiniAppPayload;
router.bookClientSlot = bookClientSlot;
router.cancelClientBooking = cancelClientBooking;

module.exports = router;
