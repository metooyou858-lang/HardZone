const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const requireTrainersRead = authMiddleware.requireRole('owner', 'admin');
const requireTrainersManage = authMiddleware.requireModule('services');
const SUPPORTED_TRAINER_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const trainerPhotoDir = path.join(__dirname, '..', '..', 'uploads', 'trainers');
const trainerPhotoStorage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    fs.mkdirSync(trainerPhotoDir, { recursive: true });
    callback(null, trainerPhotoDir);
  },
  filename: (_req, file, callback) => {
    const extensionByMime = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const extension = extensionByMime[file.mimetype] || path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
  },
});
const uploadTrainerPhoto = multer({
  storage: trainerPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (SUPPORTED_TRAINER_PHOTO_TYPES.includes(file.mimetype)) {
      callback(null, true);
      return;
    }

    callback(new Error('Unsupported trainer photo type'));
  },
});

function handleTrainerPhotoUpload(req, res, next) {
  uploadTrainerPhoto.single('photo')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(422).json({ success: false, error: 'Фото слишком большое. Максимальный размер - 5 МБ.' });
    }

    if (err.message === 'Unsupported trainer photo type') {
      return res.status(422).json({ success: false, error: 'Поддерживаются JPG, PNG или WebP. Фото HEIC/HEIF с iPhone нужно сначала сохранить как JPEG.' });
    }

    return next(err);
  });
}

function isUniqueUserLinkViolation(error) {
  return String(error?.message || '').includes('idx_trainers_user_id_unique');
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
}

router.get('/', requireTrainersRead, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH training_type_map AS (
        SELECT
          ttt.trainer_id,
          COALESCE(json_agg(tt.* ORDER BY tt.name) FILTER (WHERE tt.id IS NOT NULL), '[]') AS training_types
        FROM trainer_training_types ttt
        LEFT JOIN training_types tt ON tt.id = ttt.training_type_id
        GROUP BY ttt.trainer_id
      ),
      review_stats AS (
        SELECT
          trainer_id,
          ROUND(AVG(rating)::NUMERIC, 1) AS rating,
          COUNT(*) AS reviews_count
        FROM trainer_reviews
        WHERE is_visible = true
        GROUP BY trainer_id
      ),
      review_preview AS (
        SELECT
          trainer_id,
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', id,
                'rating', rating,
                'comment', comment,
                'created_at', created_at,
                'updated_at', updated_at,
                'client_name', client_name
              )
              ORDER BY created_at DESC
            ),
            '[]'::jsonb
          ) AS reviews
        FROM (
          SELECT
            tr.id,
            tr.trainer_id,
            tr.rating,
            tr.comment,
            tr.created_at,
            tr.updated_at,
            NULLIF(CONCAT_WS(' ', c.last_name, c.first_name), '') AS client_name,
            ROW_NUMBER() OVER (PARTITION BY tr.trainer_id ORDER BY tr.created_at DESC) AS row_number
          FROM trainer_reviews tr
          LEFT JOIN clients c ON c.id = tr.client_id
          WHERE tr.is_visible = true
        ) ranked_reviews
        WHERE row_number <= 5
        GROUP BY trainer_id
      )
      SELECT
        t.id,
        t.user_id,
        t.first_name,
        t.last_name,
        t.phone,
        t.email,
        t.bio,
        t.photo_url,
        t.position,
        COALESCE(rs.rating, 0)::FLOAT AS rating,
        COALESCE(rs.reviews_count, 0)::INT AS reviews_count,
        t.specialties,
        t.is_active,
        t.created_at,
        t.updated_at,
        COALESCE(rp.reviews, '[]'::jsonb) AS reviews,
        CASE
          WHEN u.id IS NULL THEN NULL
          ELSE json_build_object(
            'id', u.id,
            'name', u.name,
            'email', u.email,
            'role_title', u.role_title,
            'is_active', u.is_active
          )
        END AS linked_user,
        COALESCE(ttm.training_types, '[]') AS training_types
      FROM trainers t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN training_type_map ttm ON ttm.trainer_id = t.id
      LEFT JOIN review_stats rs ON rs.trainer_id = t.id
      LEFT JOIN review_preview rp ON rp.trainer_id = t.id
      WHERE t.is_active = true
      ORDER BY t.last_name, t.first_name
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'trainers.list' });
  }
});

router.get('/staff-users', requireTrainersManage, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role_title,
        u.is_active,
        t.id AS trainer_id
      FROM users u
      LEFT JOIN trainers t ON t.user_id = u.id AND t.is_active = true
      WHERE u.is_active = true
      ORDER BY u.name, u.id
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'trainers.staff_users' });
  }
});

router.post('/', requireTrainersManage, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      phone,
      email,
      bio,
      user_id,
      training_type_ids,
      photo_url,
      position,
      specialties,
    } = req.body;

    if (!first_name || !last_name) {
      return res.status(422).json({ success: false, error: 'Укажите имя и фамилию' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `
          INSERT INTO trainers (
            user_id, first_name, last_name, phone, email, bio,
            photo_url, position, specialties
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `,
        [
          user_id || null,
          first_name,
          last_name,
          phone || null,
          email || null,
          bio || null,
          photo_url || null,
          position || null,
          normalizeTextArray(specialties),
        ]
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
    if (isUniqueUserLinkViolation(err)) {
      return res.status(409).json({ success: false, error: 'Этот сотрудник уже привязан к другой карточке тренера' });
    }

    sendInternalError(res, err, { route: 'trainers.create' });
  }
});

router.patch('/:id', requireTrainersManage, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      phone,
      email,
      bio,
      user_id,
      is_active,
      training_type_ids,
      photo_url,
      position,
      specialties,
    } = req.body;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `
          UPDATE trainers SET
            first_name = COALESCE($1, first_name),
            last_name  = COALESCE($2, last_name),
            phone      = CASE WHEN $3::BOOLEAN THEN $4 ELSE phone END,
            email      = CASE WHEN $5::BOOLEAN THEN $6 ELSE email END,
            bio        = CASE WHEN $7::BOOLEAN THEN $8 ELSE bio END,
            user_id    = CASE WHEN $9::BOOLEAN THEN $10 ELSE user_id END,
            is_active  = COALESCE($11, is_active),
            photo_url  = CASE WHEN $12::BOOLEAN THEN $13 ELSE photo_url END,
            position   = CASE WHEN $14::BOOLEAN THEN $15 ELSE position END,
            specialties = CASE WHEN $16::BOOLEAN THEN $17 ELSE specialties END,
            updated_at = NOW()
          WHERE id = $18
          RETURNING *
        `,
        [
          first_name,
          last_name,
          req.body?.phone !== undefined,
          phone || null,
          req.body?.email !== undefined,
          email || null,
          req.body?.bio !== undefined,
          bio || null,
          req.body?.user_id !== undefined,
          user_id || null,
          is_active,
          req.body?.photo_url !== undefined,
          photo_url || null,
          req.body?.position !== undefined,
          position || null,
          req.body?.specialties !== undefined,
          normalizeTextArray(specialties),
          req.params.id,
        ]
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
    if (isUniqueUserLinkViolation(err)) {
      return res.status(409).json({ success: false, error: 'Этот сотрудник уже привязан к другой карточке тренера' });
    }

    sendInternalError(res, err, { route: 'trainers.update' });
  }
});

router.post('/:id/photo', requireTrainersManage, handleTrainerPhotoUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ success: false, error: 'Загрузите фото тренера' });
    }

    const photoUrl = `/uploads/trainers/${req.file.filename}`;
    const { rows } = await pool.query(
      `
        UPDATE trainers
        SET photo_url = $1,
            updated_at = NOW()
        WHERE id = $2
          AND is_active = true
        RETURNING *
      `,
      [photoUrl, req.params.id]
    );

    if (!rows[0]) {
      fs.rm(req.file.path, { force: true }, () => {});
      return res.status(404).json({ success: false, error: 'Тренер не найден' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    if (req.file?.path) {
      fs.rm(req.file.path, { force: true }, () => {});
    }

    if (err.message === 'Unsupported trainer photo type') {
      return res.status(422).json({ success: false, error: 'Поддерживаются JPG, PNG или WebP' });
    }

    return sendInternalError(res, err, { route: 'trainers.photo' });
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
