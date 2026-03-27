const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const VALID_REASONS = ['damage', 'expired', 'own_use', 'other'];

function asOptionalString(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

router.get('/', async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();
    const result = await client.query(`
      SELECT
        w.id,
        w.product_id,
        p.name AS product_name,
        p.sku AS product_sku,
        w.quantity,
        w.reason_type,
        w.reason,
        w.created_at
      FROM writeoffs w
      JOIN products p ON p.id = w.product_id
      ORDER BY w.id DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (error) {
    next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post('/', async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();

    const product_id = parseInt(req.body.product_id, 10);
    const quantity = parseInt(req.body.quantity, 10);
    const reason_type = asOptionalString(req.body.reason_type);
    const reason = asOptionalString(req.body.reason);

    if (!product_id || Number.isNaN(product_id)) {
      return res.status(400).json({ error: 'product_id is required' });
    }
    if (!quantity || Number.isNaN(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({ error: 'quantity must be a positive integer' });
    }
    if (!reason_type || !VALID_REASONS.includes(reason_type)) {
      return res.status(400).json({
        error: `reason_type is required and must be one of: ${VALID_REASONS.join(', ')}`,
      });
    }

    await client.query('BEGIN');

    const productResult = await client.query(
      'SELECT id, name, sku, stock FROM products WHERE id = $1 FOR UPDATE',
      [product_id]
    );
    if (productResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const currentStock = Number(productResult.rows[0].stock);
    if (currentStock < quantity) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Insufficient stock',
        available: currentStock,
        requested: quantity,
      });
    }

    const writeoffResult = await client.query(
      `
      INSERT INTO writeoffs
        (product_id, quantity, reason_type, reason)
      VALUES ($1, $2, $3, $4)
      RETURNING id, product_id, quantity, reason_type, reason, created_at
    `,
      [product_id, quantity, reason_type, reason]
    );

    const updatedProduct = await client.query(
      `
      UPDATE products
      SET stock = stock - $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, sku, stock
    `,
      [quantity, product_id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      writeoff: writeoffResult.rows[0],
      product: updatedProduct.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Writeoff rollback failed', rollbackError);
      }
    }
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

module.exports = router;
