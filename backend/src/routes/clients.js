const express = require('express');
const multer = require('multer');
const csv = require('csv-parse/sync');
const fs = require('fs');

const authMiddleware = require('../middleware/auth');
const { pool } = require('../db');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const upload = multer({ dest: '/tmp/' });
const requireClientsRead = authMiddleware.requireModule('clients');
const requireClientsCreate = authMiddleware.requireModule('clients_create');
const requireClientsUpdate = authMiddleware.requireModule('clients_update');
const requireClientsImport = authMiddleware.requireModule('clients_import');

async function generateClientBarcode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const barcode = `${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, '0')}`;
    const { rowCount } = await pool.query('SELECT 1 FROM clients WHERE barcode = $1 LIMIT 1', [barcode]);

    if (rowCount === 0) {
      return barcode;
    }
  }

  throw new Error('Не удалось сгенерировать уникальный штрихкод');
}

router.get('/', requireClientsRead, async (req, res) => {
  try {
    const { search, status, limit = 50, offset = 0 } = req.query;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }

    const searchTokens = String(search || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (searchTokens.length > 0) {
      searchTokens.forEach((token) => {
        params.push(`%${token}%`);
        const index = params.length;
        conditions.push(`
          (
            c.first_name ILIKE $${index}
            OR c.last_name ILIKE $${index}
            OR COALESCE(c.middle_name, '') ILIKE $${index}
            OR CONCAT_WS(' ', c.last_name, c.first_name, c.middle_name) ILIKE $${index}
            OR CONCAT_WS(' ', c.first_name, c.middle_name, c.last_name) ILIKE $${index}
            OR COALESCE(c.phone, '') ILIKE $${index}
            OR COALESCE(c.email, '') ILIKE $${index}
            OR COALESCE(c.barcode, '') ILIKE $${index}
          )
        `);
      });
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(Number(limit), Number(offset));

    const { rows } = await pool.query(
      `
        SELECT
          c.*,
          cs.id AS subscription_id,
          cs.type AS subscription_type,
          cs.status AS subscription_status,
          cs.visits_left,
          cs.expires_at,
          cs.is_family
        FROM clients c
        LEFT JOIN client_subscriptions cs
          ON cs.client_id = c.id
          AND cs.status = 'active'
        ${where}
        ORDER BY c.last_name, c.first_name
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.list' });
  }
});

router.post('/import', requireClientsImport, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(422).json({ success: false, error: 'Файл не загружен' });
    }

    const content = fs.readFileSync(req.file.path, 'utf-8').replace(/^\uFEFF/, '');
    const records = csv.parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of records) {
      try {
        const lastName = (row['Фамилия'] || '').trim();
        const firstName = (row['Имя'] || '').trim();
        const email = (row['Email'] || '').trim() || null;
        const phone = (row['Телефон'] || '').trim() || null;
        const discount = Number.parseFloat(row['Скидка']) || 0;
        const comment = (row['Комментарий'] || '').trim() || null;
        const tags = (row['Теги'] || '').trim() || null;

        if (!lastName && !firstName) {
          results.skipped += 1;
          continue;
        }

        if (lastName.toLowerCase().includes('тест') || firstName.toLowerCase().includes('тест')) {
          results.skipped += 1;
          continue;
        }

        if (phone || email) {
          const conditions = [];
          const values = [];

          if (phone) {
            values.push(phone);
            conditions.push(`phone = $${values.length}`);
          }
          if (email) {
            values.push(email);
            conditions.push(`email = $${values.length}`);
          }

          const { rowCount } = await pool.query(
            `SELECT id FROM clients WHERE ${conditions.join(' OR ')} LIMIT 1`,
            values
          );

          if (rowCount > 0) {
            results.skipped += 1;
            continue;
          }
        }

        const barcode = await generateClientBarcode();

        await pool.query(
          `
            INSERT INTO clients (first_name, last_name, phone, email, discount, comment, barcode, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
          `,
          [
            firstName,
            lastName,
            phone,
            email,
            discount,
            [comment, tags ? `Теги: ${tags}` : null].filter(Boolean).join(' | ') || null,
            barcode,
          ]
        );

        results.created += 1;
      } catch (error) {
        results.errors.push(`${row['Фамилия'] || ''} ${row['Имя'] || ''}: ${error.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, data: results });
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    sendInternalError(res, err, { route: 'clients.import' });
  }
});

router.get('/barcode/:barcode', requireClientsRead, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT
          c.*,
          cs.id AS subscription_id,
          cs.type AS subscription_type,
          cs.status AS subscription_status,
          cs.visits_left,
          cs.expires_at,
          cs.is_family
        FROM clients c
        LEFT JOIN client_subscriptions cs
          ON cs.client_id = c.id
          AND cs.status = 'active'
        WHERE c.barcode = $1
      `,
      [req.params.barcode]
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.create' });
  }
});

router.get('/:id', requireClientsRead, async (req, res) => {
  try {
    const { rows: clientRows } = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);

    if (!clientRows[0]) {
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    const { rows: subscriptions } = await pool.query(
      `SELECT cs.*, p.name AS product_name,
          COALESCE(
            ARRAY_AGG(ptt.training_type_id ORDER BY ptt.training_type_id)
              FILTER (WHERE ptt.training_type_id IS NOT NULL),
            ARRAY[]::bigint[]
          ) AS training_type_ids
       FROM client_subscriptions cs
       LEFT JOIN products p ON p.id = cs.product_id
       LEFT JOIN product_training_types ptt ON ptt.product_id = cs.product_id
       WHERE cs.client_id = $1
       GROUP BY cs.id, p.name
       ORDER BY cs.created_at DESC`,
      [req.params.id]
    );
    const { rows: visits } = await pool.query(
      'SELECT * FROM client_visits WHERE client_id = $1 ORDER BY visited_at DESC LIMIT 20',
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        ...clientRows[0],
        subscriptions,
        visits,
      },
    });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.get' });
  }
});

router.post('/', requireClientsCreate, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      middle_name,
      phone,
      email,
      birth_date,
      discount,
      status,
      status_comment,
      comment,
    } = req.body;

    if (!first_name || !last_name) {
      return res.status(422).json({ success: false, error: 'Укажите имя и фамилию' });
    }

    const barcode = await generateClientBarcode();

    const { rows } = await pool.query(
      `
        INSERT INTO clients (
          first_name,
          last_name,
          middle_name,
          phone,
          email,
          birth_date,
          barcode,
          discount,
          status,
          status_comment,
          comment
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
      `,
      [
        first_name,
        last_name,
        middle_name || null,
        phone || null,
        email || null,
        birth_date || null,
        barcode,
        discount || 0,
        status || 'active',
        status_comment || null,
        comment || null,
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.update' });
  }
});

router.patch('/:id', requireClientsUpdate, async (req, res) => {
  try {
    const fields = [
      'first_name',
      'last_name',
      'middle_name',
      'phone',
      'email',
      'birth_date',
      'discount',
      'status',
      'status_comment',
      'comment',
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
      return res.status(422).json({ success: false, error: 'Нет данных для обновления' });
    }

    values.push(req.params.id);
    const { rows } = await pool.query(
      `
        UPDATE clients SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${values.length}
        RETURNING *
      `,
      values
    );

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: 'Клиент не найден' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    sendInternalError(res, err, { route: 'clients.delete' });
  }
});

module.exports = router;
