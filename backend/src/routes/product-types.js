const express = require('express');
const { query } = require('../db');

const router = express.Router();

// GET /api/product-types
router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        pt.id, pt.name, pt.is_system, pt.sort_order,
        pt.has_barcode, pt.has_sku, pt.has_cost_price,
        pt.has_sale_price, pt.has_stock, pt.has_min_stock, pt.has_marking,
        COUNT(p.id) AS product_count
      FROM product_types pt
      LEFT JOIN products p ON p.product_type_id = pt.id AND p.is_archived = false
      GROUP BY pt.id
      ORDER BY pt.sort_order ASC, pt.id ASC
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// POST /api/product-types
router.post('/', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : null;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const result = await query(
      `
      INSERT INTO product_types
        (name, has_barcode, has_sku, has_cost_price,
         has_sale_price, has_stock, has_min_stock, has_marking)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `,
      [
        name,
        req.body.has_barcode !== false,
        req.body.has_sku !== false,
        req.body.has_cost_price !== false,
        req.body.has_sale_price !== false,
        req.body.has_stock !== false,
        req.body.has_min_stock !== false,
        req.body.has_marking === true,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Тип с таким названием уже существует' });
    }
    next(error);
  }
});

// PATCH /api/product-types/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const current = await query('SELECT * FROM product_types WHERE id = $1', [req.params.id]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Type not found' });
    }

    const pt = current.rows[0];
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : pt.name;

    const bool = (field, fallback) =>
      typeof req.body[field] === 'boolean' ? req.body[field] : fallback;

    const result = await query(
      `
      UPDATE product_types SET
        name            = $2,
        has_barcode     = $3,
        has_sku         = $4,
        has_cost_price  = $5,
        has_sale_price  = $6,
        has_stock       = $7,
        has_min_stock   = $8,
        has_marking     = $9
      WHERE id = $1
      RETURNING *
    `,
      [
        req.params.id,
        name,
        bool('has_barcode', pt.has_barcode),
        bool('has_sku', pt.has_sku),
        bool('has_cost_price', pt.has_cost_price),
        bool('has_sale_price', pt.has_sale_price),
        bool('has_stock', pt.has_stock),
        bool('has_min_stock', pt.has_min_stock),
        bool('has_marking', pt.has_marking),
      ]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Тип с таким названием уже существует' });
    }
    next(error);
  }
});

// DELETE /api/product-types/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const pt = await query('SELECT is_system FROM product_types WHERE id = $1', [req.params.id]);
    if (pt.rowCount === 0) return res.status(404).json({ error: 'Type not found' });
    if (pt.rows[0].is_system) {
      return res.status(409).json({ error: 'Нельзя удалить системный тип' });
    }

    const count = await query('SELECT COUNT(*) FROM products WHERE product_type_id = $1', [req.params.id]);
    if (parseInt(count.rows[0].count, 10) > 0) {
      return res.status(409).json({
        error: 'Нельзя удалить тип — есть товары',
        product_count: parseInt(count.rows[0].count, 10),
      });
    }

    await query('DELETE FROM product_types WHERE id = $1', [req.params.id]);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
