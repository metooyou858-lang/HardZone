const express = require('express');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');

const router = express.Router();
const requireModule = authMiddleware.requireModule;

function combineSlotDateTime(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue}`);
}

async function markBookingAsAttended(client, bookingId, { skipSubscription = false } = {}) {
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

  // партнёр по сплиту — всегда без списания, независимо от флага skipSubscription
  const isCoveredPartner = !!booking.covered_by_booking_id;
  const effectiveSubscriptionId = (skipSubscription || isCoveredPartner) ? null : booking.subscription_id;

  // если фактически не списываем — обнуляем subscription_id в брони,
  // чтобы UI показывал реальную картину а не "выбранный при записи" абонемент
  await client.query(
    'UPDATE bookings SET status = $1, subscription_id = $2, updated_at = NOW() WHERE id = $3',
    ['attended', effectiveSubscriptionId, bookingId]
  );

  if (effectiveSubscriptionId) {
    const { rows: subscriptionRows } = await client.query(
      'SELECT * FROM client_subscriptions WHERE id = $1',
      [effectiveSubscriptionId]
    );
    const subscription = subscriptionRows[0];

    if (subscription && ['visits', 'single'].includes(subscription.type) && (subscription.visits_left || 0) > 0) {
      await client.query(
        'UPDATE client_subscriptions SET visits_left = visits_left - 1, updated_at = NOW() WHERE id = $1',
        [effectiveSubscriptionId]
      );

      if ((subscription.visits_left || 0) - 1 === 0) {
        await client.query(
          'UPDATE client_subscriptions SET status = $1, updated_at = NOW() WHERE id = $2',
          ['exhausted', effectiveSubscriptionId]
        );
      }
    }
  }

  await client.query(
    `
      INSERT INTO client_visits (client_id, subscription_id, visit_type, slot_id)
      VALUES ($1, $2, 'group', $3)
    `,
    [booking.client_id, effectiveSubscriptionId, booking.slot_id]
  );

  return booking;
}

router.post('/', requireModule('schedule_clients'), async (req, res) => {
  try {
    const { slot_id, client_id, subscription_id, booked_by = 'admin', covered_by_booking_id } = req.body;

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

      // партнёр по сплиту не занимает отдельное место — проверку вместимости пропускаем
      if (!covered_by_booking_id && (slot.booked_count || 0) + placesCount > slot.capacity) {
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
          INSERT INTO bookings (slot_id, client_id, subscription_id, places_count, booked_by, covered_by_booking_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [slot_id, client_id, subscription_id || null, placesCount, booked_by, covered_by_booking_id || null]
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
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post('/:id/attend', requireModule('schedule_attendance'), async (req, res) => {
  try {
    const skipSubscription = req.body?.skip_subscription === true;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await markBookingAsAttended(client, req.params.id, { skipSubscription });
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

router.post('/:id/unattend', requireModule('schedule_attendance'), async (req, res) => {
  try {
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
        return res.status(404).json({ success: false, error: 'Запись не найдена или статус не «attended»' });
      }

      // Удаляем запись о визите, возвращаем реальный subscription_id (null при skip_subscription)
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

      // Возвращаем визит только если при attend реально списывали (subscription_id в client_visits не null)
      const chargedSubscriptionId = visitRows[0]?.subscription_id ?? null;
      if (chargedSubscriptionId) {
        const { rows: subRows } = await client.query(
          'SELECT * FROM client_subscriptions WHERE id = $1',
          [chargedSubscriptionId]
        );
        const sub = subRows[0];

        if (sub && ['visits', 'single'].includes(sub.type)) {
          await client.query(
            'UPDATE client_subscriptions SET visits_left = visits_left + 1, updated_at = NOW() WHERE id = $1',
            [chargedSubscriptionId]
          );
          if (sub.status === 'exhausted') {
            await client.query(
              "UPDATE client_subscriptions SET status = 'active', updated_at = NOW() WHERE id = $1",
              [chargedSubscriptionId]
            );
          }
        }
      }

      // Удаляем бронь целиком и уменьшаем счётчик слота
      await client.query('DELETE FROM bookings WHERE id = $1', [booking.id]);
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
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
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
