const express = require('express');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const { sendInternalError } = require('../utils/http-response');

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

router.get('/client-search', requireModule('clients'), async (req, res) => {
  try {
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
