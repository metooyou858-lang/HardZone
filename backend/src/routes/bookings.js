const express = require('express');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const {
  attachEligibleSubscriptionToBooking,
  createTrainingBooking,
  markTrainingBookingArrived,
  unmarkTrainingBookingArrived,
} = require('../services/booking-attendance');
const { getPublicErrorMessage } = require('../utils/http-response');

const router = express.Router();
const requireModule = authMiddleware.requireModule;

function combineSlotDateTime(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue}`);
}

router.post('/', requireModule('schedule_clients'), async (req, res) => {
  try {
    const {
      slot_id,
      client_id,
      subscription_id,
      booked_by = 'admin',
      covered_by_booking_id,
      allow_unpaid = false,
      unpaid_reason = 'no_subscription',
    } = req.body;

    if (!slot_id || !client_id) {
      return res.status(422).json({ success: false, error: 'Укажите занятие и клиента' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const booking = await createTrainingBooking(client, {
        slotId: slot_id,
        clientId: client_id,
        subscriptionId: subscription_id || null,
        bookedBy: booked_by,
        coveredByBookingId: covered_by_booking_id || null,
        allowUnpaid: allow_unpaid === true,
        unpaidReason: unpaid_reason,
      });
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: booking });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

router.post('/:id/cancel', requireModule('schedule_clients'), async (req, res) => {
  try {
    const { cancel_reason } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: bookingRows } = await client.query(
        'SELECT * FROM bookings WHERE id = $1 AND status = $2',
        [req.params.id, 'confirmed']
      );
      const booking = bookingRows[0];

      if (!booking) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Запись не найдена' });
      }

      const { rows: slotRows } = await client.query(
        'SELECT date, start_time FROM schedule_slots WHERE id = $1',
        [booking.slot_id]
      );
      const slot = slotRows[0];

      const slotDateTime = combineSlotDateTime(slot.date, slot.start_time);
      if (slotDateTime <= new Date()) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Нельзя отменить запись после начала занятия' });
      }

      await client.query('DELETE FROM bookings WHERE id = $1', [req.params.id]);

      await client.query(
        'UPDATE schedule_slots SET booked_count = GREATEST(booked_count - $1, 0), updated_at = NOW() WHERE id = $2',
        [booking.places_count, booking.slot_id]
      );

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

router.post('/:id/attend', requireModule('schedule_attendance'), async (req, res) => {
  try {
    const attendanceMode = req.body?.skip_subscription === true
      ? 'unpaid'
      : req.body?.attendance_mode || 'auto';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await markTrainingBookingArrived(client, {
        bookingId: req.params.id,
        attendanceMode,
        coverageNote: req.body?.coverage_note || null,
        createdBy: req.user?.username || req.user?.email || req.user?.id || null,
      });
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

router.post('/:id/attach-eligible-subscription', requireModule('schedule_clients'), async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await attachEligibleSubscriptionToBooking(client, req.params.id);
    await client.query('COMMIT');

    res.json({ success: true, data: result });
  } catch (err) {
    await client.query('ROLLBACK');
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  } finally {
    client.release();
  }
});

router.post('/:id/unattend', requireModule('schedule_attendance'), async (req, res) => {
  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await unmarkTrainingBookingArrived(client, req.params.id);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

router.post('/attend-by-barcode', requireModule('schedule_attendance'), async (req, res) => {
  try {
    const { barcode, slot_id } = req.body;

    if (!barcode || !slot_id) {
      return res.status(422).json({ success: false, error: 'Укажите штрихкод и занятие' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: clientRows } = await client.query(
        'SELECT * FROM clients WHERE barcode = $1',
        [barcode]
      );

      if (!clientRows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Клиент не найден' });
      }

      const { rows: bookingRows } = await client.query(
        'SELECT * FROM bookings WHERE slot_id = $1 AND client_id = $2 AND status = $3',
        [slot_id, clientRows[0].id, 'confirmed']
      );

      if (!bookingRows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Запись не найдена' });
      }

      await markTrainingBookingArrived(client, {
        bookingId: bookingRows[0].id,
        createdBy: req.user?.username || req.user?.email || req.user?.id || null,
      });
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

module.exports = router;
