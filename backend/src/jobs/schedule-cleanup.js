const { pool } = require('../db');

async function markMissedBookings() {
  try {
    const { rows } = await pool.query(`
      UPDATE bookings b
      SET status = 'missed', updated_at = NOW()
      FROM schedule_slots s
      WHERE b.slot_id = s.id
        AND b.status = 'confirmed'
        AND (s.date + s.start_time + (s.duration_minutes * INTERVAL '1 minute')) < NOW()
      RETURNING b.id
    `);

    if (rows.length > 0) {
      console.log(`[schedule-cleanup] Marked ${rows.length} bookings as missed`);
    }
  } catch (err) {
    console.error('[schedule-cleanup] Error:', err.message);
  }
}

module.exports = { markMissedBookings };
