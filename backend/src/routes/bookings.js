const express = require('express');

const { pool } = require('../db');

const router = express.Router();

function combineSlotDateTime(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue}`);
}

async function markBookingAsAttended(client, bookingId) {
  const { rows: bookingRows } = await client.query(
    'SELECT * FROM bookings WHERE id = $1 AND status = $2',
    [bookingId, 'confirmed']
  );
  const booking = bookingRows[0];

  if (!booking) {
    const error = new Error('Запись не найдена');
    error.statusCode = 404;
    throw error;
  }

  await client.query(
    'UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2',
    ['attended', bookingId]
  );

  if (booking.subscription_id) {
    const { rows: subscriptionRows } = await client.query(
      'SELECT * FROM client_subscriptions WHERE id = $1',
      [booking.subscription_id]
    );
    const subscription = subscriptionRows[0];

    if (subscription && ['visits', 'single'].includes(subscription.type) && (subscription.visits_left || 0) > 0) {
      await client.query(
        'UPDATE client_subscriptions SET visits_left = visits_left - 1, updated_at = NOW() WHERE id = $1',
        [booking.subscription_id]
      );

      if ((subscription.visits_left || 0) - 1 === 0) {
        await client.query(
          'UPDATE client_subscriptions SET status = $1, updated_at = NOW() WHERE id = $2',
          ['exhausted', booking.subscription_id]
        );
      }
    }
  }

  await client.query(
    `
      INSERT INTO client_visits (client_id, subscription_id, visit_type, slot_id)
      VALUES ($1, $2, 'group', $3)
    `,
    [booking.client_id, booking.subscription_id || null, booking.slot_id]
  );

  return booking;
}

router.post('/', async (req, res) => {
  try {
    const { slot_id, client_id, subscription_id, booked_by = 'admin' } = req.body;

    if (!slot_id || !client_id) {
      return res.status(422).json({ success: false, error: 'Укажите занятие и клиента' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: slotRows } = await client.query(
        'SELECT * FROM schedule_slots WHERE id = $1 AND status = $2',
        [slot_id, 'active']
      );
      const slot = slotRows[0];

      if (!slot) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Занятие не найдено или отменено' });
      }

      if (slot.block_if_empty_hours && slot.booked_count === 0) {
        const slotDateTime = combineSlotDateTime(slot.date, slot.start_time);
        const hoursUntil = (slotDateTime.getTime() - Date.now()) / 3600000;

        if (hoursUntil <= slot.block_if_empty_hours) {
          await client.query('ROLLBACK');
          return res.status(409).json({ success: false, error: 'Запись закрыта — никто не записался заблаговременно' });
        }
      }

      let placesCount = 1;
      if (subscription_id) {
        const { rows: subscriptionRows } = await client.query(
          'SELECT is_family FROM client_subscriptions WHERE id = $1',
          [subscription_id]
        );

        if (subscriptionRows[0]?.is_family) {
          placesCount = 2;
        }
      }

      if ((slot.booked_count || 0) + placesCount > slot.capacity) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Нет свободных мест' });
      }

      const { rows: existingRows } = await client.query(
        'SELECT id FROM bookings WHERE slot_id = $1 AND client_id = $2 AND status = $3',
        [slot_id, client_id, 'confirmed']
      );

      if (existingRows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Клиент уже записан' });
      }

      const { rows } = await client.query(
        `
          INSERT INTO bookings (slot_id, client_id, subscription_id, places_count, booked_by)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [slot_id, client_id, subscription_id || null, placesCount, booked_by]
      );

      await client.query(
        'UPDATE schedule_slots SET booked_count = booked_count + $1, updated_at = NOW() WHERE id = $2',
        [placesCount, slot_id]
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post('/:id/cancel', async (req, res) => {
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

      await client.query(
        `
          UPDATE bookings
          SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $1, updated_at = NOW()
          WHERE id = $2
        `,
        [cancel_reason || null, req.params.id]
      );

      await client.query(
        'UPDATE schedule_slots SET booked_count = booked_count - $1, updated_at = NOW() WHERE id = $2',
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
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post('/:id/attend', async (req, res) => {
  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await markBookingAsAttended(client, req.params.id);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post('/attend-by-barcode', async (req, res) => {
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

      await markBookingAsAttended(client, bookingRows[0].id);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
