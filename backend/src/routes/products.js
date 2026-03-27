const express = require('express');

const { query } = require('../db');

const router = express.Router();

const PRODUCT_SELECT = `
  SELECT
    p.id,
    p.name,
    p.sku,
    p.barcode,
    p.datamatrix_code,
    p.is_marked,
    p.cost_price,
    p.sale_price,
    ROUND(p.sale_price - p.cost_price, 2) AS margin,
    ROUND(p.sale_price * p.stock, 2) AS position_value,
    p.stock,
    p.min_stock,
    p.category_id,
    c.name AS category_name,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
`;

function asStr(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asDecimal(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) || parsed < 0 ? null : parsed;
}

function asInt(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? null : parsed;
}

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`${PRODUCT_SELECT} ORDER BY p.id DESC`);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/barcode/:barcode', async (req, res, next) => {
  try {
    const result = await query(
      `${PRODUCT_SELECT} WHERE p.barcode = $1 OR p.datamatrix_code = $1`,
      [req.params.barcode.trim()]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (q.length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const result = await query(
      `${PRODUCT_SELECT} WHERE p.name ILIKE $1 OR p.sku ILIKE $1 ORDER BY p.name ASC LIMIT 50`,
      [`%${q}%`]
    );

    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`${PRODUCT_SELECT} WHERE p.id = $1`, [req.params.id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
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

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!sku) {
      return res.status(400).json({ error: 'sku is required' });
    }

    const result = await query(
      `
        INSERT INTO products
          (name, sku, barcode, datamatrix_code, is_marked, cost_price, sale_price, category_id, min_stock)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `,
      [name, sku, barcode, datamatrix, is_marked, cost_price, sale_price, category_id, min_stock]
    );

    const full = await query(`${PRODUCT_SELECT} WHERE p.id = $1`, [result.rows[0].id]);
    return res.status(201).json(full.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'SKU or barcode already exists' });
    }

    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const name = asStr(req.body.name);
    const sku = asStr(req.body.sku);
    const barcode = asStr(req.body.barcode);
    const datamatrix = asStr(req.body.datamatrix_code);
    const is_marked = typeof req.body.is_marked === 'boolean' ? req.body.is_marked : null;
    const cost_price = asDecimal(req.body.cost_price);
    const sale_price = asDecimal(req.body.sale_price);
    const category_id = req.body.category_id !== undefined ? asInt(req.body.category_id) : undefined;
    const min_stock = asInt(req.body.min_stock);

    const result = await query(
      `
        UPDATE products
        SET
          name = COALESCE($2, name),
          sku = COALESCE($3, sku),
          barcode = COALESCE($4, barcode),
          datamatrix_code = COALESCE($5, datamatrix_code),
          is_marked = COALESCE($6, is_marked),
          cost_price = COALESCE($7, cost_price),
          sale_price = COALESCE($8, sale_price),
          category_id = COALESCE($9, category_id),
          min_stock = COALESCE($10, min_stock),
          updated_at = NOW()
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
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const full = await query(`${PRODUCT_SELECT} WHERE p.id = $1`, [result.rows[0].id]);
    return res.json(full.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'SKU or barcode already exists' });
    }

    return next(error);
  }
});

module.exports = router;
