const express = require('express');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const requireTrainingTypesRead = authMiddleware.requireRole('owner', 'admin');
const requireTrainingTypesManage = authMiddleware.requireModule('services');

function normalizeTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

async function getTrainingTypeUsage(client, id) {
  const productLinks = await client.query(
    'SELECT COUNT(*)::INT AS count FROM product_training_types WHERE training_type_id = $1',
    [id]
  );
  const trainerLinks = await client.query(
    'SELECT COUNT(*)::INT AS count FROM trainer_training_types WHERE training_type_id = $1',
    [id]
  );
  const templateLinks = await client.query(
    'SELECT COUNT(*)::INT AS count FROM schedule_templates WHERE training_type_id = $1',
    [id]
  );
  const slotLinks = await client.query(
    'SELECT COUNT(*)::INT AS count FROM schedule_slots WHERE training_type_id = $1',
    [id]
  );

  return {
    products: productLinks.rows[0]?.count || 0,
    trainers: trainerLinks.rows[0]?.count || 0,
    schedule_templates: templateLinks.rows[0]?.count || 0,
    schedule_slots: slotLinks.rows[0]?.count || 0,
  };
}

function getUsageTotal(usage) {
  return Object.values(usage).reduce((sum, count) => sum + Number(count || 0), 0);
}

function formatUsageMessage(usage) {
  const parts = [
    usage.products ? `${usage.products} услуг/абонементов` : null,
    usage.trainers ? `${usage.trainers} тренеров` : null,
    usage.schedule_templates ? `${usage.schedule_templates} шаблонов расписания` : null,
    usage.schedule_slots ? `${usage.schedule_slots} занятий в расписании` : null,
  ].filter(Boolean);

  return parts.join(', ');
}

// GET /api/training-types — список видов тренировок
router.get('/', requireTrainingTypesRead, async (req, res) => {
  try {
    const params = [];
    const conditions = [];

    if (req.query.slot_type) {
      params.push(req.query.slot_type);
      conditions.push(`slot_type = $${params.length}`);
    }

    if (req.query.include_inactive !== 'true') {
      conditions.push('is_active = true');
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT * FROM training_types ${where} ORDER BY slot_type, name`, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'training_types.list' });
  }
});

// POST /api/training-types — создать вид тренировки
router.post('/', requireTrainingTypesManage, async (req, res) => {
  try {
    const {
      name,
      color,
      duration,
      capacity,
      description,
      slot_type = 'group',
      audience,
      location,
      booking_note,
      tags,
    } = req.body;

    if (!name) {
      return res.status(422).json({ success: false, error: 'Укажите название' });
    }

    const { rows } = await pool.query(
        `
        INSERT INTO training_types (
          name, color, duration, capacity, description, slot_type,
          audience, location, booking_note, tags
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
      [
        name,
        color || '#00BCD4',
        duration || null,
        capacity || null,
        description || null,
        slot_type,
        audience || null,
        location || null,
        booking_note || null,
        normalizeTextArray(tags),
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'training_types.create' });
  }
});

// PATCH /api/training-types/:id — обновить
router.patch('/:id', requireTrainingTypesManage, async (req, res) => {
  try {
    if (req.body?.tags !== undefined) {
      req.body.tags = normalizeTextArray(req.body.tags);
    }

    const fields = [
      'name',
      'color',
      'duration',
      'capacity',
      'description',
      'is_active',
      'slot_type',
      'audience',
      'location',
      'booking_note',
      'tags',
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
        UPDATE training_types
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING *
      `,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Не найдено' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'training_types.update' });
  }
});

// DELETE /api/training-types/:id — удалить; при force=true сначала отвязать от связанных сущностей
router.delete('/:id', requireTrainingTypesManage, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: existingRows } = await client.query(
      'SELECT id, name FROM training_types WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );

    if (!existingRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Вид тренировки не найден' });
    }

    const usage = await getTrainingTypeUsage(client, req.params.id);
    const usageTotal = getUsageTotal(usage);
    const forceDelete = req.query.force === 'true' || req.body?.force === true;

    if (usageTotal > 0 && !forceDelete) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `Вид тренировки используется: ${formatUsageMessage(usage)}. Можно удалить с отвязкой связей.`,
        code: 'training_type_in_use',
        data: {
          usage,
          can_force_delete: true,
        },
      });
    }

    if (usageTotal > 0) {
      await client.query('DELETE FROM product_training_types WHERE training_type_id = $1', [req.params.id]);
      await client.query('DELETE FROM trainer_training_types WHERE training_type_id = $1', [req.params.id]);
      await client.query(
        'UPDATE schedule_templates SET training_type_id = NULL, updated_at = NOW() WHERE training_type_id = $1',
        [req.params.id]
      );
      await client.query(
        'UPDATE schedule_slots SET training_type_id = NULL, updated_at = NOW() WHERE training_type_id = $1',
        [req.params.id]
      );
    }

    await client.query('DELETE FROM training_types WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    sendInternalError(res, err, { route: 'training_types.delete' });
  } finally {
    client.release();
  }
});

module.exports = router;
