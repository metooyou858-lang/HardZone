const express = require('express');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const { markOpenGymVisit } = require('../services/booking-attendance');
const {
  refundSubscriptionVisit,
} = require('../services/subscription-access');
const { getPublicErrorMessage, sendInternalError } = require('../utils/http-response');

const router = express.Router();
const requireModule = authMiddleware.requireModule;
const CLUB_TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Vladivostok';

function getClubNowParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  const weekdayMap = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
    dayOfWeek: weekdayMap[parts.weekday] || 1,
  };
}

function normalizeTimeValue(value) {
  if (!value) {
    return null;
  }

  return String(value).slice(0, 8).padEnd(8, ':00');
}

function isTimeWithinWorkingHours(currentTime, openTime, closeTime) {
  const normalizedCurrent = normalizeTimeValue(currentTime);
  const normalizedOpen = normalizeTimeValue(openTime);
  const normalizedClose = normalizeTimeValue(closeTime);

  if (!normalizedCurrent || !normalizedOpen || !normalizedClose) {
    return false;
  }

  return normalizedCurrent >= normalizedOpen && normalizedCurrent < normalizedClose;
}

async function buildGymOverview(executor = pool) {
  const now = getClubNowParts();

  const { rows: hours } = await executor.query(
    `
      SELECT day_of_week, is_open, open_time, close_time, updated_at
      FROM gym_hours
      ORDER BY day_of_week
    `
  );

  const todayHours = hours.find((item) => Number(item.day_of_week) === now.dayOfWeek) || null;

  const { rows: visits } = await executor.query(
    `
      SELECT
        cv.*,
        c.first_name || ' ' || c.last_name AS client_name,
        c.phone AS client_phone,
        c.barcode AS client_barcode
      FROM client_visits cv
      JOIN clients c ON c.id = cv.client_id
      WHERE cv.visit_type = 'open_gym'
        AND ((cv.visited_at AT TIME ZONE '${CLUB_TIME_ZONE}')::date) = $1::date
      ORDER BY cv.visited_at DESC
    `,
    [now.date]
  );

  return {
    hours,
    today: todayHours
      ? {
          ...todayHours,
          current_date: now.date,
          current_time: now.time,
          is_open_now:
            todayHours.is_open &&
            isTimeWithinWorkingHours(now.time, todayHours.open_time, todayHours.close_time),
        }
      : {
          day_of_week: now.dayOfWeek,
          is_open: false,
          open_time: null,
          close_time: null,
          updated_at: null,
          current_date: now.date,
          current_time: now.time,
          is_open_now: false,
        },
    visits,
    total_today: visits.length,
  };
}

router.get('/gym-hours', async (req, res) => {
  try {
    const overview = await buildGymOverview();
    res.json({ success: true, data: overview });
  } catch (err) {
    sendInternalError(res, err, { route: 'schedule.week_template.get' });
  }
});

router.put('/gym-hours', requireModule('schedule_gym'), async (req, res) => {
  try {
    const days = Array.isArray(req.body?.days) ? req.body.days : null;

    if (!days || days.length === 0) {
      return res.status(422).json({ success: false, error: 'Передайте дни для обновления' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const day of days) {
        const dayOfWeek = Number(day.day_of_week);
        const isOpen = Boolean(day.is_open);
        const openTime = isOpen ? day.open_time || null : null;
        const closeTime = isOpen ? day.close_time || null : null;

        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
          throw new Error('Некорректный день недели');
        }

        if (isOpen && (!openTime || !closeTime)) {
          throw new Error('Для открытого дня укажите время начала и окончания');
        }

        await client.query(
          `
            INSERT INTO gym_hours (day_of_week, is_open, open_time, close_time)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (day_of_week) DO UPDATE SET
              is_open = EXCLUDED.is_open,
              open_time = EXCLUDED.open_time,
              close_time = EXCLUDED.close_time,
              updated_at = NOW()
          `,
          [dayOfWeek, isOpen, openTime, closeTime]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const overview = await buildGymOverview();
    res.json({ success: true, data: overview });
  } catch (err) {
    sendInternalError(res, err, { route: 'schedule.week_template.update' });
  }
});

router.post('/open-gym/check-in', requireModule('schedule_gym'), async (req, res) => {
  try {
    const {
      client_id,
      barcode,
      subscription_id,
      attendance_mode = 'auto',
      coverage_note,
      created_by = 'admin',
    } = req.body || {};

    if (!client_id && !barcode) {
      return res.status(422).json({ success: false, error: 'Укажите клиента или штрихкод' });
    }

    const client = await pool.connect();
    const now = getClubNowParts();

    try {
      await client.query('BEGIN');

      const clientLookup = client_id
        ? await client.query(
            `SELECT id, first_name, last_name, phone, barcode FROM clients WHERE id = $1`,
            [client_id]
          )
        : await client.query(
            `SELECT id, first_name, last_name, phone, barcode FROM clients WHERE barcode = $1`,
            [barcode]
          );

      const customer = clientLookup.rows[0];

      if (!customer) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Клиент не найден' });
      }

      const { rows: existing } = await client.query(
        `
          SELECT id
          FROM client_visits
          WHERE client_id = $1
            AND visit_type = 'open_gym'
            AND ((visited_at AT TIME ZONE '${CLUB_TIME_ZONE}')::date) = $2::date
          LIMIT 1
        `,
        [customer.id, now.date]
      );

      if (existing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Сегодня клиент уже отмечен в зале' });
      }

      if (!subscription_id && attendance_mode === 'auto') {
        await client.query('ROLLBACK');
        return res.status(422).json({
          success: false,
          error: 'Выберите абонемент или отметьте вход как неоплаченное посещение',
        });
      }

      const visitRow = await markOpenGymVisit(client, {
        clientId: customer.id,
        subscriptionId: subscription_id || null,
        attendanceMode: attendance_mode,
        coverageNote: coverage_note || null,
        createdBy: created_by,
      });

      await client.query('COMMIT');

      const overview = await buildGymOverview();
      const visit = {
        ...visitRow,
        client_name: `${customer.first_name} ${customer.last_name}`,
        client_phone: customer.phone,
        client_barcode: customer.barcode,
      };

      res.status(201).json({
        success: true,
        data: {
          visit,
          visits: overview.visits,
          total_today: overview.total_today,
          today: overview.today,
          within_hours: overview.today?.is_open_now ?? false,
        },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    const statusCode = err.statusCode || 500;
    if (statusCode >= 500) {
      return sendInternalError(res, err, { route: 'schedule.gym_visits.create' });
    }

    return res.status(statusCode).json({ success: false, error: getPublicErrorMessage(err, statusCode) });
  }
});

router.delete('/open-gym/visits/:id', requireModule('schedule_gym'), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    const { rows } = await client.query(
      `DELETE FROM client_visits
       WHERE id = $1 AND visit_type = 'open_gym'
       RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Визит не найден' });
    }

    const deleted = rows[0];

    if (deleted.subscription_id) {
      await refundSubscriptionVisit(client, deleted.subscription_id);
    }

    await client.query('COMMIT');

    const overview = await buildGymOverview();
    res.json({
      success: true,
      data: {
        visits: overview.visits,
        total_today: overview.total_today,
        today: overview.today,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'schedule.gym_visits.delete' });
  } finally {
    client.release();
  }
});

router.get('/slots', async (req, res) => {
  try {
    const { date_from, date_to, trainer_id, slot_type } = req.query;
    const params = ['cancelled'];
    const conditions = ['s.status != $1'];

    if (date_from) {
      params.push(date_from);
      conditions.push(`s.date >= $${params.length}`);
    }

    if (date_to) {
      params.push(date_to);
      conditions.push(`s.date <= $${params.length}`);
    }

    if (trainer_id) {
      params.push(trainer_id);
      conditions.push(`s.trainer_id = $${params.length}`);
    }

    if (slot_type) {
      params.push(slot_type);
      conditions.push(`s.slot_type = $${params.length}`);
    }

    const { rows } = await pool.query(
      `
        SELECT
          s.*,
          tt.name AS training_type_name,
          tt.color AS training_type_color,
          tr.first_name || ' ' || tr.last_name AS trainer_name,
          p.name AS product_name,
          (
            SELECT COUNT(*)
            FROM bookings b
            WHERE b.slot_id = s.id AND b.status = 'confirmed'
          ) AS confirmed_count
        FROM schedule_slots s
        LEFT JOIN training_types tt ON tt.id = s.training_type_id
        LEFT JOIN trainers tr ON tr.id = s.trainer_id
        LEFT JOIN products p ON p.id = s.product_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY s.date, s.start_time
      `,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'schedule.classes.list' });
  }
});

router.get('/slots/:id', async (req, res) => {
  try {
    const { rows: slotRows } = await pool.query(
      `
        SELECT
          s.*,
          tt.name AS training_type_name,
          tt.color AS training_type_color,
          tr.first_name || ' ' || tr.last_name AS trainer_name
        FROM schedule_slots s
        LEFT JOIN training_types tt ON tt.id = s.training_type_id
        LEFT JOIN trainers tr ON tr.id = s.trainer_id
        WHERE s.id = $1
      `,
      [req.params.id]
    );

    if (!slotRows[0]) {
      return res.status(404).json({ success: false, error: 'Занятие не найдено' });
    }

    const { rows: bookings } = await pool.query(
      `
        SELECT
          b.*,
          c.first_name || ' ' || c.last_name AS client_name,
          c.phone AS client_phone,
          c.barcode AS client_barcode
        FROM bookings b
        JOIN clients c ON c.id = b.client_id
        WHERE b.slot_id = $1
        ORDER BY b.created_at
      `,
      [req.params.id]
    );

    res.json({ success: true, data: { ...slotRows[0], bookings } });
  } catch (err) {
    sendInternalError(res, err, { route: 'schedule.classes.get' });
  }
});

router.post('/slots', async (req, res) => {
  try {
    const {
      slot_type = 'group',
      training_type_id,
      trainer_id,
      product_id,
      date,
      start_time,
      duration_minutes = 60,
      capacity = 20,
      is_free = false,
      block_if_empty_hours,
      comment,
    } = req.body;

    const isPersonal = slot_type === 'personal';
    const requiredPermission = isPersonal ? 'schedule_edit_personal' : 'schedule_edit_groups';
    if (!req.user.modules.includes(requiredPermission)) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    if (!date || !start_time) {
      return res.status(422).json({ success: false, error: 'Укажите дату и время' });
    }

    const { rows } = await pool.query(
      `
        INSERT INTO schedule_slots
          (slot_type, training_type_id, trainer_id, product_id, date, start_time,
           duration_minutes, capacity, is_free, block_if_empty_hours, comment)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `,
      [
        slot_type,
        training_type_id || null,
        trainer_id || null,
        product_id || null,
        date,
        start_time,
        duration_minutes,
        capacity,
        is_free,
        block_if_empty_hours || null,
        comment || null,
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'schedule.classes.create' });
  }
});

router.patch('/slots/:id', async (req, res) => {
  try {
    const { rows: slotTypeRows } = await pool.query(
      'SELECT slot_type FROM schedule_slots WHERE id = $1',
      [req.params.id]
    );
    if (!slotTypeRows[0]) {
      return res.status(404).json({ success: false, error: 'Занятие не найдено' });
    }
    const isPersonal = slotTypeRows[0].slot_type === 'personal';
    const requiredPermission = isPersonal ? 'schedule_edit_personal' : 'schedule_edit_groups';
    if (!req.user.modules.includes(requiredPermission)) {
      return res.status(403).json({ success: false, error: 'Недостаточно прав доступа' });
    }

    const fields = [
      'slot_type',
      'training_type_id',
      'trainer_id',
      'product_id',
      'date',
      'start_time',
      'duration_minutes',
      'capacity',
      'is_free',
      'block_if_empty_hours',
      'comment',
      'status',
    ];
    const updates = [];
    const values = [];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        values.push(req.body[field]);
        updates.push(`${field} = $${values.length}`);
      }
    });

    if (!updates.length) {
      return res.status(422).json({ success: false, error: 'Нет данных' });
    }

    values.push(req.params.id);
    const { rows } = await pool.query(
      `
        UPDATE schedule_slots
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING *
      `,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Занятие не найдено' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'schedule.classes.update' });
  }
});

router.post('/slots/:id/cancel', requireModule('schedule_cancel'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `
        UPDATE schedule_slots
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status = 'active'
        RETURNING *
      `,
      [req.params.id]
    );

    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Занятие не найдено или уже отменено' });
    }

    await client.query(
      `
        UPDATE bookings
        SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = 'Занятие отменено'
        WHERE slot_id = $1 AND status = 'confirmed'
      `,
      [req.params.id]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'schedule.classes.cancel' });
  } finally {
    client.release();
  }
});

router.get('/templates', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        st.*,
        tt.name AS training_type_name,
        tt.color AS training_type_color,
        tr.first_name || ' ' || tr.last_name AS trainer_name
      FROM schedule_templates st
      LEFT JOIN training_types tt ON tt.id = st.training_type_id
      LEFT JOIN trainers tr ON tr.id = st.trainer_id
      WHERE st.is_active = true
      ORDER BY st.day_of_week, st.start_time
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'schedule.personal.create' });
  }
});

router.post('/templates', requireModule('schedule_edit_groups'), async (req, res) => {
  try {
    const {
      slot_type = 'group',
      training_type_id,
      trainer_id,
      product_id,
      day_of_week,
      start_time,
      duration_minutes = 60,
      capacity = 20,
      block_if_empty_hours,
    } = req.body;

    if (!day_of_week || !start_time) {
      return res.status(422).json({ success: false, error: 'Укажите день недели и время' });
    }

    const { rows } = await pool.query(
      `
        INSERT INTO schedule_templates
          (slot_type, training_type_id, trainer_id, product_id, day_of_week,
           start_time, duration_minutes, capacity, block_if_empty_hours)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `,
      [
        slot_type,
        training_type_id || null,
        trainer_id || null,
        product_id || null,
        day_of_week,
        start_time,
        duration_minutes,
        capacity,
        block_if_empty_hours || null,
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'schedule.generate' });
  }
});

router.post('/templates/generate', requireModule('schedule_edit_groups'), async (req, res) => {
  try {
    const { date_from, date_to, template_ids } = req.body;

    if (!date_from || !date_to) {
      return res.status(422).json({ success: false, error: 'Укажите период' });
    }

    const hasTemplateFilter = Array.isArray(template_ids);
    const requestedTemplateIds = hasTemplateFilter
      ? template_ids
          .map((id) => Number.parseInt(String(id), 10))
          .filter((id) => Number.isInteger(id) && id > 0)
      : [];

    const templateQuery = hasTemplateFilter
      ? {
          text: 'SELECT * FROM schedule_templates WHERE is_active = true AND id = ANY($1::bigint[])',
          values: [requestedTemplateIds],
        }
      : {
          text: 'SELECT * FROM schedule_templates WHERE is_active = true',
          values: [],
        };

    const { rows: templates } = await pool.query(templateQuery);

    let created = 0;
    const from = new Date(date_from);
    const to = new Date(date_to);

    for (let current = new Date(from); current <= to; current.setDate(current.getDate() + 1)) {
      const dayOfWeek = current.getDay() === 0 ? 7 : current.getDay();
      const dateString = current.toISOString().split('T')[0];

      for (const template of templates) {
        if (template.day_of_week !== dayOfWeek) {
          continue;
        }

        const { rows: existing } = await pool.query(
          'SELECT id FROM schedule_slots WHERE template_id = $1 AND date = $2',
          [template.id, dateString]
        );

        if (existing.length > 0) {
          continue;
        }

        await pool.query(
          `
            INSERT INTO schedule_slots
              (template_id, slot_type, training_type_id, trainer_id, product_id,
               date, start_time, duration_minutes, capacity, is_free, block_if_empty_hours)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          `,
          [
            template.id,
            template.slot_type,
            template.training_type_id,
            template.trainer_id,
            template.product_id,
            dateString,
            template.start_time,
            template.duration_minutes,
            template.capacity,
            false,
            template.block_if_empty_hours,
          ]
        );

        created += 1;
      }
    }

    res.json({ success: true, data: { created } });
  } catch (err) {
    sendInternalError(res, err, { route: 'schedule.range' });
  }
});

module.exports = router;
