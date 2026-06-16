const express = require('express');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const {
  assertSubscriptionAccess,
  chargeSubscriptionVisit,
  getSlotAccessContext,
  refundSubscriptionVisit,
} = require('../services/subscription-access');
const { expireActiveSubscriptions } = require('../services/subscription-validity');
const { getPublicErrorMessage, sendInternalError } = require('../utils/http-response');

const router = express.Router();
const requireModule = authMiddleware.requireModule;
const CLUB_TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Vladivostok';

function getClubDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseLimit(value, fallback = 10, max = 25) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

async function getSlotBookings(executor, slotId) {
  const { rows: slotRows } = await executor.query(
    `
      SELECT
        s.id,
        s.slot_type,
        s.date,
        s.start_time,
        s.duration_minutes,
        s.capacity,
        s.booked_count,
        s.status,
        tt.name AS training_type_name,
        tr.first_name || ' ' || tr.last_name AS trainer_name
      FROM schedule_slots s
      LEFT JOIN training_types tt ON tt.id = s.training_type_id
      LEFT JOIN trainers tr ON tr.id = s.trainer_id
      WHERE s.id = $1
    `,
    [slotId]
  );

  if (!slotRows[0]) {
    return null;
  }

  const { rows: bookings } = await executor.query(
    `
      SELECT
        b.id,
        b.status,
        b.places_count,
        b.subscription_id,
        b.created_at,
        c.id AS client_id,
        c.first_name || ' ' || c.last_name AS client_name,
        c.phone AS client_phone,
        c.barcode AS client_barcode,
        cs.type AS subscription_type,
        cs.status AS subscription_status,
        cs.visits_left,
        cs.expires_at,
        cs.is_family
      FROM bookings b
      JOIN clients c ON c.id = b.client_id
      LEFT JOIN client_subscriptions cs ON cs.id = b.subscription_id
      WHERE b.slot_id = $1
        AND b.status IN ('confirmed', 'attended')
      ORDER BY b.created_at, b.id
    `,
    [slotId]
  );

  return { slot: slotRows[0], bookings };
}

async function markBookingAsAttended(executor, bookingId, { skipSubscription = false } = {}) {
  const { rows: bookingRows } = await executor.query(
    'SELECT * FROM bookings WHERE id = $1 AND status = $2',
    [bookingId, 'confirmed']
  );
  const booking = bookingRows[0];

  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  const isCoveredPartner = !!booking.covered_by_booking_id;
  const effectiveSubscriptionId = (skipSubscription || isCoveredPartner) ? null : booking.subscription_id;

  await executor.query(
    'UPDATE bookings SET status = $1, subscription_id = $2, updated_at = NOW() WHERE id = $3',
    ['attended', effectiveSubscriptionId, bookingId]
  );

  if (effectiveSubscriptionId) {
    await chargeSubscriptionVisit(executor, {
      subscriptionId: effectiveSubscriptionId,
      clientId: booking.client_id,
      context: await getSlotAccessContext(executor, booking.slot_id),
    });

  }

  await executor.query(
    `
      INSERT INTO client_visits (client_id, subscription_id, visit_type, slot_id)
      VALUES ($1, $2, 'group', $3)
    `,
    [booking.client_id, effectiveSubscriptionId, booking.slot_id]
  );

  return booking;
}

router.get('/me', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT id, first_name, last_name, phone, email, is_active
        FROM trainers
        WHERE user_id = $1 AND is_active = true
        LIMIT 1
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        user: req.user,
        trainer_profile: rows[0] || null,
      },
    });
  } catch (err) {
    sendInternalError(res, err, { route: 'staff.me' });
  }
});

router.get('/schedule/today', requireModule('schedule'), async (req, res) => {
  try {
    const date = String(req.query.date || getClubDate());

    const { rows } = await pool.query(
      `
        SELECT
          s.id,
          s.slot_type,
          s.date,
          s.start_time,
          s.duration_minutes,
          s.capacity,
          s.booked_count,
          s.status,
          s.is_free,
          s.comment,
          tt.name AS training_type_name,
          tt.color AS training_type_color,
          tr.id AS trainer_id,
          tr.first_name || ' ' || tr.last_name AS trainer_name,
          (
            SELECT COUNT(*)::INT
            FROM bookings b
            WHERE b.slot_id = s.id AND b.status = 'confirmed'
          ) AS confirmed_count,
          (
            SELECT COUNT(*)::INT
            FROM bookings b
            WHERE b.slot_id = s.id AND b.status = 'attended'
          ) AS attended_count
        FROM schedule_slots s
        LEFT JOIN training_types tt ON tt.id = s.training_type_id
        LEFT JOIN trainers tr ON tr.id = s.trainer_id
        WHERE s.date = $1::date
          AND s.status != 'cancelled'
        ORDER BY s.start_time, s.id
      `,
      [date]
    );

    res.json({ success: true, data: { date, slots: rows } });
  } catch (err) {
    sendInternalError(res, err, { route: 'staff.schedule.today' });
  }
});

router.get('/bookings', requireModule('schedule'), async (req, res) => {
  try {
    const slotId = Number.parseInt(String(req.query.slot_id || ''), 10);
    if (!Number.isInteger(slotId) || slotId <= 0) {
      return res.status(422).json({ success: false, error: 'Укажите занятие' });
    }

    const { rows: slotRows } = await pool.query(
      `
        SELECT
          s.id,
          s.slot_type,
          s.date,
          s.start_time,
          s.duration_minutes,
          s.capacity,
          s.booked_count,
          s.status,
          tt.name AS training_type_name,
          tr.first_name || ' ' || tr.last_name AS trainer_name
        FROM schedule_slots s
        LEFT JOIN training_types tt ON tt.id = s.training_type_id
        LEFT JOIN trainers tr ON tr.id = s.trainer_id
        WHERE s.id = $1
      `,
      [slotId]
    );

    if (!slotRows[0]) {
      return res.status(404).json({ success: false, error: 'Занятие не найдено' });
    }

    const { rows: bookings } = await pool.query(
      `
        SELECT
          b.id,
          b.status,
          b.places_count,
          b.subscription_id,
          b.created_at,
          c.id AS client_id,
          c.first_name || ' ' || c.last_name AS client_name,
          c.phone AS client_phone,
          c.barcode AS client_barcode,
          cs.type AS subscription_type,
          cs.status AS subscription_status,
          cs.visits_left,
          cs.expires_at,
          cs.is_family
        FROM bookings b
        JOIN clients c ON c.id = b.client_id
        LEFT JOIN client_subscriptions cs ON cs.id = b.subscription_id
        WHERE b.slot_id = $1
          AND b.status IN ('confirmed', 'attended')
        ORDER BY b.created_at, b.id
      `,
      [slotId]
    );

    res.json({ success: true, data: { slot: slotRows[0], bookings } });
  } catch (err) {
    sendInternalError(res, err, { route: 'staff.bookings' });
  }
});

router.post('/bookings', requireModule('schedule_clients'), async (req, res) => {
  const client = await pool.connect();

  try {
    const { slot_id, client_id, subscription_id } = req.body || {};

    if (!slot_id || !client_id) {
      return res.status(422).json({ success: false, error: 'Slot and client are required' });
    }

    await client.query('BEGIN');

    const { rows: slotRows } = await client.query(
      'SELECT * FROM schedule_slots WHERE id = $1 AND status = $2',
      [slot_id, 'active']
    );
    const slot = slotRows[0];

    if (!slot) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Slot not found or cancelled' });
    }

    if (!subscription_id) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, error: 'Выберите подходящий абонемент для записи' });
    }

    let placesCount = 1;
    if (subscription_id) {
      const subscription = await assertSubscriptionAccess(client, {
        subscriptionId: subscription_id,
        clientId: client_id,
        context: await getSlotAccessContext(client, slot_id),
      });

      if (subscription.is_family) {
        placesCount = 2;
      }
    }

    if ((slot.booked_count || 0) + placesCount > slot.capacity) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'No free places' });
    }

    const { rows: existingRows } = await client.query(
      "SELECT id FROM bookings WHERE slot_id = $1 AND client_id = $2 AND status IN ('confirmed', 'attended')",
      [slot_id, client_id]
    );

    if (existingRows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Client already booked' });
    }

    const { rows } = await client.query(
      `
        INSERT INTO bookings (slot_id, client_id, subscription_id, places_count, booked_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [slot_id, client_id, subscription_id || null, placesCount, `staff:${req.user.username || req.user.email || req.user.id}`]
    );

    await client.query(
      'UPDATE schedule_slots SET booked_count = booked_count + $1, updated_at = NOW() WHERE id = $2',
      [placesCount, slot_id]
    );

    const slotBookings = await getSlotBookings(client, slot_id);

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { booking: rows[0], ...slotBookings } });
  } catch (err) {
    await client.query('ROLLBACK');
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
      return sendInternalError(res, err, { route: 'staff.bookings.create' });
    }

    return res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  } finally {
    client.release();
  }
});

router.post('/bookings/:id/attend', requireModule('schedule_attendance'), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const booking = await markBookingAsAttended(client, req.params.id, {
      skipSubscription: req.body?.skip_subscription === true,
    });
    const slotBookings = await getSlotBookings(client, booking.slot_id);
    await client.query('COMMIT');

    res.json({ success: true, data: { booking_id: Number(req.params.id), ...slotBookings } });
  } catch (err) {
    await client.query('ROLLBACK');
    const statusCode = err.statusCode || 500;
    if (statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    sendInternalError(res, err, { route: 'staff.bookings.attend' });
  } finally {
    client.release();
  }
});

router.post('/bookings/:id/unattend', requireModule('schedule_attendance'), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: bookingRows } = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND status = $2',
      [req.params.id, 'attended']
    );
    const booking = bookingRows[0];

    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Booking not found or not attended' });
    }

    const { rows: visitRows } = await client.query(
      `DELETE FROM client_visits
       WHERE id = (
         SELECT id FROM client_visits
         WHERE client_id = $1 AND slot_id = $2 AND visit_type = 'group'
         ORDER BY visited_at DESC
         LIMIT 1
       )
       RETURNING subscription_id`,
      [booking.client_id, booking.slot_id]
    );

    const chargedSubscriptionId = visitRows[0]?.subscription_id ?? null;
    if (chargedSubscriptionId) {
      await refundSubscriptionVisit(client, chargedSubscriptionId);
    }

    await client.query('DELETE FROM bookings WHERE id = $1', [booking.id]);
    await client.query(
      'UPDATE schedule_slots SET booked_count = GREATEST(booked_count - $1, 0), updated_at = NOW() WHERE id = $2',
      [booking.places_count, booking.slot_id]
    );

    const slotBookings = await getSlotBookings(client, booking.slot_id);

    await client.query('COMMIT');
    res.json({ success: true, data: { booking_id: Number(req.params.id), ...slotBookings } });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'staff.bookings.unattend' });
  } finally {
    client.release();
  }
});

router.get('/client-search', requireModule('clients'), async (req, res) => {
  try {
    await expireActiveSubscriptions(pool);

    const search = String(req.query.search || req.query.q || '').trim();
    const limit = parseLimit(req.query.limit, 10, 25);

    if (search.length < 2) {
      return res.status(422).json({ success: false, error: 'Введите минимум 2 символа' });
    }

    const tokens = search.split(/\s+/).filter(Boolean);
    const params = [];
    const conditions = [];

    tokens.forEach((token) => {
      params.push(`%${token}%`);
      const index = params.length;
      conditions.push(`
        (
          c.first_name ILIKE $${index}
          OR c.last_name ILIKE $${index}
          OR COALESCE(c.middle_name, '') ILIKE $${index}
          OR CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) ILIKE $${index}
          OR CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) ILIKE $${index}
          OR COALESCE(c.phone, '') ILIKE $${index}
          OR COALESCE(c.barcode, '') ILIKE $${index}
        )
      `);
    });

    params.push(limit);

    const { rows } = await pool.query(
      `
        SELECT
          c.id,
          c.first_name,
          c.last_name,
          c.middle_name,
          c.phone,
          c.barcode,
          c.status,
          cs.id AS subscription_id,
          cs.type AS subscription_type,
          cs.status AS subscription_status,
          cs.visits_left,
          cs.expires_at,
          cs.is_family
        FROM clients c
        LEFT JOIN client_subscriptions cs
          ON cs.client_id = c.id
          AND cs.status IN ('active', 'frozen')
        WHERE ${conditions.join(' AND ')}
        ORDER BY c.last_name, c.first_name
        LIMIT $${params.length}
      `,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'staff.client_search' });
  }
});

module.exports = router;
