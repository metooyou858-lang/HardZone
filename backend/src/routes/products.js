const express = require('express');
const authMiddleware = require('../middleware/auth');
const { pool, query } = require('../db');

const router = express.Router();
const requireProductsRead = authMiddleware.requireRole('owner', 'admin');
const requireProductsManage = authMiddleware.requireModule('warehouse', 'services');
const requireServiceSettingsManage = authMiddleware.requireModule('services');

const PRODUCT_SELECT = `
  SELECT
    p.id, p.name, p.sku, p.barcode, p.datamatrix_code, p.is_marked, p.marking_type,
    p.is_archived,
    p.product_type_id,
    pt.name AS product_type_name,
    pt.has_barcode, pt.has_sku, pt.has_cost_price,
    pt.has_sale_price, pt.has_stock, pt.has_min_stock, pt.has_marking,
    p.cost_price, p.sale_price,
    CASE WHEN pt.has_sale_price AND pt.has_cost_price
      THEN ROUND(p.sale_price - p.cost_price, 2)
      ELSE NULL
    END AS margin,
    CASE WHEN pt.has_stock
      THEN ROUND(p.sale_price * p.stock, 2)
      ELSE NULL
    END AS position_value,
    p.stock, p.min_stock,
    p.category_id,
    c.name AS category_name,
    p.created_at, p.updated_at
  FROM products p
  LEFT JOIN product_types pt ON pt.id = p.product_type_id
  LEFT JOIN categories c ON c.id = p.category_id
`;

function asStr(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function asDecimal(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) || n < 0 ? null : n;
}

function asInt(v) {
  if (v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? null : n;
}

function normalizeTrainingTypeIds(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((item) => parseInt(item, 10))
      .filter((item) => Number.isInteger(item) && item > 0)
  )];
}

function normalizeProductIds(value) {
  if (typeof value !== 'string') return [];

  return [...new Set(
    value
      .split(',')
      .map((item) => parseInt(item.trim(), 10))
      .filter((item) => Number.isInteger(item) && item > 0)
  )];
}

// GET /api/products
router.get('/', requireProductsRead, async (req, res, next) => {
  try {
    const includeArchived = req.query.archived === 'true';
    const forSale = req.query.forSale === 'true';
    const excludeServices = req.query.excludeServices === 'true';
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const category_id = asInt(req.query.category_id);
    const limit = asInt(req.query.limit);
    const params = [];
    const conditions = [];

    if (forSale) {
      conditions.push('p.is_archived = false');
      conditions.push('(pt.has_stock = false OR p.stock > 0)');
      conditions.push('(p.sale_price IS NOT NULL AND p.sale_price > 0)');
    } else {
      params.push(includeArchived);
      conditions.push(`p.is_archived = $${params.length}`);
    }

    if (excludeServices) {
      conditions.push('pt.has_stock = true');
    }

    if (type === 'service') {
      conditions.push('pt.has_stock = false AND pt.has_sale_price = true');
    }

    if (category_id) {
      params.push(category_id);
      conditions.push(`p.category_id = $${params.length}`);
    }

    let sql = `
      ${PRODUCT_SELECT}
      WHERE ${conditions.join(' AND ')}
      ORDER BY pt.sort_order ASC, p.id DESC
    `;

    if (limit) {
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
    }

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * Extract EAN-13 from a GS1 DataMatrix marking code.
 * GS1 format: 01{14-digit GTIN}21{serial}...
 * Returns null if the value doesn't look like GS1.
 */
function extractEanFromGs1(value) {
  const noGs = value.replace(/\x1d/g, '');
  const match = noGs.match(/^01(\d{14})21/);
  if (!match) return null;
  const gtin14 = match[1];
  return gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;
}

// GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', requireProductsRead, async (req, res, next) => {
  try {
    const raw = req.params.barcode.trim();

    let result = await query(
      `${PRODUCT_SELECT}
       WHERE (p.barcode = $1 OR p.datamatrix_code = $1)
       AND p.is_archived = false`,
      [raw]
    );

    // If not found by exact match, try to extract EAN-13 from GS1 DataMatrix marking code
    if (result.rowCount === 0) {
      const ean = extractEanFromGs1(raw);
      if (ean && ean !== raw) {
        result = await query(
          `${PRODUCT_SELECT}
           WHERE (p.barcode = $1 OR p.datamatrix_code = $1)
           AND p.is_archived = false`,
          [ean]
        );
      }
    }

    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

// GET /api/products/search?q=
router.get('/search', requireProductsRead, async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q.length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });
    const result = await query(
      `${PRODUCT_SELECT}
       WHERE (p.name ILIKE $1 OR p.sku ILIKE $1)
       AND p.is_archived = false
       ORDER BY pt.sort_order ASC, p.name ASC LIMIT 50`,
      [`%${q}%`]
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

// GET /api/products/subscription-params?ids=1,2 — получить параметры абонементов пачкой
router.get('/subscription-params', requireServiceSettingsManage, async (req, res, next) => {
  try {
    const productIds = normalizeProductIds(req.query.ids);

    if (productIds.length === 0) {
      return res.json({ success: true, data: {} });
    }

    const { rows: paramsRows } = await query(
      'SELECT * FROM product_subscription_params WHERE product_id = ANY($1::BIGINT[])',
      [productIds]
    );

    const { rows: trainingTypeRows } = await query(
      `
        SELECT ptt.product_id, tt.*
        FROM product_training_types ptt
        JOIN training_types tt ON tt.id = ptt.training_type_id
        WHERE ptt.product_id = ANY($1::BIGINT[])
        ORDER BY tt.name ASC
      `,
      [productIds]
    );

    const data = Object.fromEntries(
      productIds.map((id) => [String(id), { params: null, training_types: [] }])
    );

    paramsRows.forEach((row) => {
      data[String(row.product_id)].params = row;
    });

    trainingTypeRows.forEach((row) => {
      const productId = String(row.product_id);
      const { product_id: _productId, ...trainingType } = row;
      data[productId].training_types.push(trainingType);
    });

    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
});

// GET /api/products/:id/subscription-params — получить параметры абонемента
router.get('/:id/subscription-params', requireServiceSettingsManage, async (req, res, next) => {
  try {
    const { rows: paramsRows } = await query(
      'SELECT * FROM product_subscription_params WHERE product_id = $1',
      [req.params.id]
    );

    const { rows: trainingTypes } = await query(
      `
        SELECT tt.*
        FROM training_types tt
        JOIN product_training_types ptt ON ptt.training_type_id = tt.id
        WHERE ptt.product_id = $1
      `,
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        params: paramsRows[0] || null,
        training_types: trainingTypes,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:id/subscription-params — сохранить параметры абонемента
router.post('/:id/subscription-params', requireServiceSettingsManage, async (req, res, next) => {
  try {
    const {
      subscription_type,
      visits_total,
      validity_days,
      activation_type,
      freeze_days_allowed,
      freeze_min_days,
      freeze_max_count,
      is_family,
      allow_free_visit,
      allow_group_training,
      allow_personal_training,
      training_type_ids,
    } = req.body;
    const allowFreeVisit = allow_free_visit === true;
    const allowGroupTraining = allow_group_training === true;
    const allowPersonalTraining = allow_personal_training === true;
    const allowedSlotTypes = [
      allowGroupTraining ? 'group' : null,
      allowPersonalTraining ? 'personal' : null,
    ].filter(Boolean);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const requestedTrainingTypeIds = normalizeTrainingTypeIds(training_type_ids);
      let trainingTypeIdsToSave = [];

      if (requestedTrainingTypeIds.length > 0 && allowedSlotTypes.length > 0) {
        const { rows: trainingTypeRows } = await client.query(
          `
            SELECT id, slot_type
            FROM training_types
            WHERE id = ANY($1::INT[])
          `,
          [requestedTrainingTypeIds]
        );

        if (trainingTypeRows.length !== requestedTrainingTypeIds.length) {
          await client.query('ROLLBACK');
          return res.status(422).json({ success: false, error: 'Некоторые виды тренировок не найдены' });
        }

        const invalidTrainingType = trainingTypeRows.find((item) => !allowedSlotTypes.includes(item.slot_type));
        if (invalidTrainingType) {
          await client.query('ROLLBACK');
          return res.status(422).json({
            success: false,
            error: 'Виды тренировок не соответствуют правам доступа услуги',
          });
        }

        trainingTypeIdsToSave = requestedTrainingTypeIds;
      }

      const { rows } = await client.query(
        `
          INSERT INTO product_subscription_params
            (product_id, subscription_type, visits_total, validity_days, activation_type,
             freeze_days_allowed, freeze_min_days, freeze_max_count, is_family,
             allow_free_visit, allow_group_training, allow_personal_training)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (product_id) DO UPDATE SET
            subscription_type   = EXCLUDED.subscription_type,
            visits_total        = EXCLUDED.visits_total,
            validity_days       = EXCLUDED.validity_days,
            activation_type     = EXCLUDED.activation_type,
            freeze_days_allowed = EXCLUDED.freeze_days_allowed,
            freeze_min_days     = EXCLUDED.freeze_min_days,
            freeze_max_count    = EXCLUDED.freeze_max_count,
            is_family           = EXCLUDED.is_family,
            allow_free_visit    = EXCLUDED.allow_free_visit,
            allow_group_training = EXCLUDED.allow_group_training,
            allow_personal_training = EXCLUDED.allow_personal_training,
            updated_at          = NOW()
          RETURNING *
        `,
        [
          req.params.id,
          subscription_type,
          visits_total || null,
          validity_days || null,
          activation_type || 'purchase',
          freeze_days_allowed || 0,
          freeze_min_days || 1,
          freeze_max_count || null,
          is_family || false,
          allowFreeVisit,
          allowGroupTraining,
          allowPersonalTraining,
        ]
      );

      await client.query('DELETE FROM product_training_types WHERE product_id = $1', [req.params.id]);

      if (trainingTypeIdsToSave.length > 0) {
        for (const trainingTypeId of trainingTypeIdsToSave) {
          await client.query(
            'INSERT INTO product_training_types (product_id, training_type_id) VALUES ($1, $2)',
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
    next(err);
  }
});

// GET /api/products/:id
router.get('/:id', requireProductsRead, async (req, res, next) => {
  try {
    const result = await query(`${PRODUCT_SELECT} WHERE p.id = $1`, [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

// POST /api/products
router.post('/', requireProductsManage, async (req, res, next) => {
  try {
    const name = asStr(req.body.name);
    const sku = asStr(req.body.sku);
    const barcode = asStr(req.body.barcode);
    const datamatrix = asStr(req.body.datamatrix_code);
    const is_marked = req.body.is_marked === true;
    const cost_price = asDecimal(req.body.cost_price);
    const sale_price = asDecimal(req.body.sale_price);
    const category_id = asInt(req.body.category_id);
    const min_stock = asInt(req.body.min_stock) ?? 0;
    const product_type_id = asInt(req.body.product_type_id);

    if (!name) return res.status(400).json({ error: 'name is required' });

    const typeId =
      product_type_id ??
      (
        await query(`
          SELECT id
          FROM product_types
          WHERE name = 'Товар'
          LIMIT 1
        `)
      ).rows[0]?.id;

    const result = await query(
      `
      INSERT INTO products
        (name, sku, barcode, datamatrix_code, is_marked,
         cost_price, sale_price, category_id, min_stock, product_type_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
    `,
      [name, sku, barcode, datamatrix, is_marked, cost_price, sale_price, category_id, min_stock, typeId]
    );

    const full = await query(`${PRODUCT_SELECT} WHERE p.id = $1`, [result.rows[0].id]);
    return res.status(201).json(full.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'SKU or barcode already exists' });
    next(error);
  }
});

// PATCH /api/products/:id
router.patch('/:id', requireProductsManage, async (req, res, next) => {
  try {
    const name = asStr(req.body.name);
    const sku = asStr(req.body.sku);
    const barcode = asStr(req.body.barcode);
    const datamatrix = asStr(req.body.datamatrix_code);
    const is_marked = typeof req.body.is_marked === 'boolean' ? req.body.is_marked : null;
    const marking_type = req.body.marking_type !== undefined
      ? (req.body.marking_type === null ? null : asInt(req.body.marking_type))
      : undefined;
    const cost_price = asDecimal(req.body.cost_price);
    const sale_price = asDecimal(req.body.sale_price);
    const category_id = req.body.category_id !== undefined ? asInt(req.body.category_id) : undefined;
    const min_stock = asInt(req.body.min_stock);
    const product_type_id = asInt(req.body.product_type_id);

    const result = await query(
      `
      UPDATE products SET
        name            = COALESCE($2, name),
        sku             = COALESCE($3, sku),
        barcode         = COALESCE($4, barcode),
        datamatrix_code = COALESCE($5, datamatrix_code),
        is_marked       = COALESCE($6, is_marked),
        cost_price      = COALESCE($7, cost_price),
        sale_price      = COALESCE($8, sale_price),
        category_id     = COALESCE($9, category_id),
        min_stock       = COALESCE($10, min_stock),
        product_type_id = COALESCE($11, product_type_id),
        marking_type    = CASE WHEN $12 THEN $13 ELSE marking_type END,
        updated_at      = NOW()
      WHERE id = $1
      RETURNING id
    `,
      [
        req.params.id,
        name,
        sku,
        barcode,
        datamatrix,
        is_marked,
        cost_price,
        sale_price,
        category_id !== undefined ? category_id : null,
        min_stock,
        product_type_id,
        marking_type !== undefined,               // $12: был ли передан
        marking_type !== undefined ? marking_type : null, // $13: значение
      ]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    const full = await query(`${PRODUCT_SELECT} WHERE p.id = $1`, [result.rows[0].id]);
    return res.json(full.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'SKU or barcode already exists' });
    next(error);
  }
});

// PATCH /api/products/:id/archive
router.patch('/:id/archive', requireProductsManage, async (req, res, next) => {
  try {
    const archive = req.body.is_archived !== false;
    const result = await query(
      `
      UPDATE products SET is_archived = $1, updated_at = NOW()
      WHERE id = $2 RETURNING id, name, is_archived
    `,
      [archive, req.params.id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: 'Product not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
