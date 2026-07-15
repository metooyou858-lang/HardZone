const express = require('express');

const { pool } = require('../db');
const { hasModuleAccess } = require('../authz');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const CLUB_TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Vladivostok';

router.get('/', async (req, res) => {
  try {
    const canReadSchedule = hasModuleAccess(req.user, 'schedule');
    const canReadClients = hasModuleAccess(req.user, 'clients') || canReadSchedule;
    const canReadWarehouse = hasModuleAccess(req.user, 'warehouse');
    const [schedule, unpaidVisits, expiringSubscriptions, lowStock] = await Promise.all([
      canReadSchedule ? loadSchedule() : null,
      canReadClients ? loadUnpaidVisits() : [],
      canReadClients ? loadExpiringSubscriptions() : [],
      canReadWarehouse ? loadLowStock() : [],
    ]);

    res.json({ success: true, data: { generated_at: new Date().toISOString(), schedule, attention: { unpaid_visits: unpaidVisits, expiring_subscriptions: expiringSubscriptions, low_stock: lowStock } } });
  } catch (err) {
    sendInternalError(res, err, { route: 'dashboard.get' });
  }
});

async function loadSchedule() {
  const { rows } = await pool.query(`
    WITH club_now AS (
      SELECT (NOW() AT TIME ZONE $1)::date AS today, (NOW() AT TIME ZONE $1) AS current_at
    ), day_slots AS (
      SELECT s.*, s.date + s.start_time AS starts_at,
        s.date + s.start_time + make_interval(mins => s.duration_minutes) AS ends_at
      FROM schedule_slots s, club_now n
      WHERE s.date = n.today AND s.status != 'cancelled'
    ), booking_totals AS (
      SELECT b.slot_id,
        COALESCE(SUM(b.places_count) FILTER (WHERE b.status IN ('confirmed', 'attended')), 0)::INT AS occupied_count
      FROM bookings b JOIN day_slots ds ON ds.id = b.slot_id GROUP BY b.slot_id
    ), summary AS (
      SELECT COUNT(ds.id)::INT AS total_slots,
        COUNT(ds.id) FILTER (WHERE ds.ends_at <= n.current_at)::INT AS completed_slots,
        COALESCE((SELECT SUM(b.places_count)::INT FROM bookings b JOIN day_slots listed ON listed.id = b.slot_id WHERE b.status IN ('confirmed', 'attended')), 0)::INT AS total_bookings
      FROM club_now n LEFT JOIN day_slots ds ON TRUE GROUP BY n.current_at
    )
    SELECT ds.id, ds.slot_type, ds.date, ds.start_time, ds.duration_minutes, ds.capacity, ds.status,
      ds.training_type_id, tt.name AS training_type_name, tr.id AS trainer_id,
      tr.first_name || ' ' || tr.last_name AS trainer_name,
      COALESCE(bt.occupied_count, 0)::INT AS occupied_count,
      ds.starts_at <= n.current_at AND ds.ends_at > n.current_at AS is_in_progress,
      summary.total_slots, summary.completed_slots, summary.total_bookings
    FROM day_slots ds CROSS JOIN club_now n CROSS JOIN summary
    LEFT JOIN booking_totals bt ON bt.slot_id = ds.id
    LEFT JOIN training_types tt ON tt.id = ds.training_type_id
    LEFT JOIN trainers tr ON tr.id = ds.trainer_id
    WHERE ds.ends_at > n.current_at
    ORDER BY ds.start_time, ds.id
  `, [CLUB_TIME_ZONE]);

  if (rows[0]) {
    const { total_slots, completed_slots, total_bookings } = rows[0];
    return { date: rows[0].date, total_slots, completed_slots, total_bookings, slots: rows.map(({ total_slots: _totalSlots, completed_slots: _completedSlots, total_bookings: _totalBookings, ...slot }) => slot) };
  }

  const { rows: summaryRows } = await pool.query(`
    WITH club_now AS (SELECT (NOW() AT TIME ZONE $1)::date AS today, (NOW() AT TIME ZONE $1) AS current_at),
    day_slots AS (
      SELECT s.id, s.date + s.start_time + make_interval(mins => s.duration_minutes) AS ends_at
      FROM schedule_slots s, club_now n WHERE s.date = n.today AND s.status != 'cancelled'
    )
    SELECT n.today AS date, COUNT(ds.id)::INT AS total_slots,
      COUNT(ds.id) FILTER (WHERE ds.ends_at <= n.current_at)::INT AS completed_slots,
      COALESCE((SELECT SUM(b.places_count)::INT FROM bookings b JOIN day_slots listed ON listed.id = b.slot_id WHERE b.status IN ('confirmed', 'attended')), 0)::INT AS total_bookings
    FROM club_now n LEFT JOIN day_slots ds ON TRUE GROUP BY n.today, n.current_at
  `, [CLUB_TIME_ZONE]);
  return { ...summaryRows[0], slots: [] };
}

async function loadUnpaidVisits() {
  const { rows } = await pool.query(`
    SELECT * FROM (
      SELECT 'booking-' || b.id AS id, 'group' AS visit_type, b.client_id,
        c.first_name || ' ' || c.last_name AS client_name, s.date AS visit_date,
        s.start_time AS visit_time, COALESCE(tt.name, 'Тренировка') AS title
      FROM bookings b JOIN clients c ON c.id = b.client_id JOIN schedule_slots s ON s.id = b.slot_id
      LEFT JOIN training_types tt ON tt.id = s.training_type_id
      WHERE b.status = 'attended' AND b.coverage_status = 'unpaid'
      UNION ALL
      SELECT 'visit-' || cv.id AS id, cv.visit_type, cv.client_id,
        c.first_name || ' ' || c.last_name AS client_name,
        (cv.visited_at AT TIME ZONE $1)::date AS visit_date,
        (cv.visited_at AT TIME ZONE $1)::time AS visit_time, 'Свободное посещение' AS title
      FROM client_visits cv JOIN clients c ON c.id = cv.client_id
      WHERE cv.coverage_status = 'unpaid' AND cv.visit_type = 'open_gym'
    ) unpaid ORDER BY visit_date, visit_time, id
  `, [CLUB_TIME_ZONE]);
  return rows;
}

async function loadExpiringSubscriptions() {
  const { rows } = await pool.query(`
    SELECT cs.id, cs.client_id, c.first_name || ' ' || c.last_name AS client_name,
      cs.type, cs.visits_total, cs.visits_left, cs.expires_at, p.name AS product_name
    FROM client_subscriptions cs JOIN clients c ON c.id = cs.client_id
    LEFT JOIN products p ON p.id = cs.product_id
    WHERE cs.status = 'active' AND cs.expires_at = (NOW() AT TIME ZONE $1)::date
    ORDER BY c.last_name, c.first_name, cs.id
  `, [CLUB_TIME_ZONE]);
  return rows;
}

async function loadLowStock() {
  const { rows } = await pool.query(`
    SELECT p.id, p.name, p.stock, p.min_stock, GREATEST(p.min_stock - p.stock, 0)::INT AS shortage
    FROM products p JOIN product_types pt ON pt.id = p.product_type_id
    WHERE p.is_archived = false AND pt.has_stock = true AND pt.has_min_stock = true
      AND p.min_stock > 0 AND p.stock < p.min_stock
    ORDER BY (p.min_stock - p.stock) DESC, p.name
  `);
  return rows;
}

module.exports = router;
