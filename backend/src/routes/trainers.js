const express = require('express');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const requireTrainersRead = authMiddleware.requireRole('owner', 'admin');
const requireTrainersManage = authMiddleware.requireModule('services');

router.get('/', requireTrainersRead, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        t.*,
        COALESCE(json_agg(tt.*) FILTER (WHERE tt.id IS NOT NULL), '[]') AS training_types
      FROM trainers t
      LEFT JOIN trainer_training_types ttt ON ttt.trainer_id = t.id
      LEFT JOIN training_types tt ON tt.id = ttt.training_type_id
      WHERE t.is_active = true
      GROUP BY t.id
      ORDER BY t.last_name, t.first_name
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'trainers.list' });
  }
});

router.post('/', requireTrainersManage, async (req, res) => {
  try {
    const { first_name, last_name, phone, email, bio, user_id, training_type_ids } = req.body;

    if (!first_name || !last_name) {
      return res.status(422).json({ success: false, error: 'Укажите имя и фамилию' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `
          INSERT INTO trainers (user_id, first_name, last_name, phone, email, bio)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [user_id || null, first_name, last_name, phone || null, email || null, bio || null]
      );

      if (Array.isArray(training_type_ids) && training_type_ids.length > 0) {
        for (const trainingTypeId of training_type_ids) {
          await client.query(
            'INSERT INTO trainer_training_types (trainer_id, training_type_id) VALUES ($1, $2)',
            [rows[0].id, trainingTypeId]
          );
        }
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    sendInternalError(res, err, { route: 'trainers.create' });
  }
});

router.patch('/:id', requireTrainersManage, async (req, res) => {
  try {
    const { first_name, last_name, phone, email, bio, user_id, is_active, training_type_ids } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `
          UPDATE trainers SET
            first_name = COALESCE($1, first_name),
            last_name  = COALESCE($2, last_name),
            phone      = COALESCE($3, phone),
            email      = COALESCE($4, email),
            bio        = COALESCE($5, bio),
            user_id    = CASE WHEN $6::BOOLEAN THEN $7 ELSE user_id END,
            is_active  = COALESCE($8, is_active),
            updated_at = NOW()
          WHERE id = $9
          RETURNING *
        `,
        [first_name, last_name, phone, email, bio, req.body?.user_id !== undefined, user_id || null, is_active, req.params.id]
      );

      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Тренер не найден' });
      }

      if (training_type_ids !== undefined) {
        await client.query('DELETE FROM trainer_training_types WHERE trainer_id = $1', [req.params.id]);

        for (const trainingTypeId of training_type_ids) {
          await client.query(
            'INSERT INTO trainer_training_types (trainer_id, training_type_id) VALUES ($1, $2)',
            [req.params.id, trainingTypeId]
          );
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, data: rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    sendInternalError(res, err, { route: 'trainers.update' });
  }
});

router.delete('/:id', requireTrainersManage, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
        UPDATE trainers
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Тренер не найден' });
    }

    res.status(204).end();
  } catch (err) {
    sendInternalError(res, err, { route: 'trainers.delete' });
  }
});

module.exports = router;
