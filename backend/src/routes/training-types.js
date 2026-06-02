const express = require('express');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const requireTrainingTypesRead = authMiddleware.requireRole('owner', 'admin');
const requireTrainingTypesManage = authMiddleware.requireModule('services');

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
    const { name, color, duration, capacity, description, slot_type = 'group' } = req.body;

    if (!name) {
      return res.status(422).json({ success: false, error: 'Укажите название' });
    }

    const { rows } = await pool.query(
      `
        INSERT INTO training_types (name, color, duration, capacity, description, slot_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [name, color || '#00BCD4', duration || null, capacity || null, description || null, slot_type]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'training_types.create' });
  }
});

// PATCH /api/training-types/:id — обновить
router.patch('/:id', requireTrainingTypesManage, async (req, res) => {
  try {
    const fields = ['name', 'color', 'duration', 'capacity', 'description', 'is_active', 'slot_type'];
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

// DELETE /api/training-types/:id — удалить (только если не используется)
router.delete('/:id', requireTrainingTypesManage, async (req, res) => {
  try {
    const { rows: used } = await pool.query(
      'SELECT id FROM product_training_types WHERE training_type_id = $1 LIMIT 1',
      [req.params.id]
    );

    if (used.length) {
      return res.status(409).json({ success: false, error: 'Вид тренировки используется в абонементах' });
    }

    await pool.query('DELETE FROM training_types WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    sendInternalError(res, err, { route: 'training_types.delete' });
  }
});

module.exports = router;
