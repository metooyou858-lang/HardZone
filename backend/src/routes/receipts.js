const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const VALID_METHODS = ['barcode', 'datamatrix', 'manual'];

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
        r.id,
        r.product_id,
        p.name AS product_name,
        p.sku AS product_sku,
        r.method,
        r.quantity,
        r.cost_price_at_receipt,
        r.comment,
        r.created_at
      FROM receipts r
      JOIN products p ON p.id = r.product_id
      ORDER BY r.id DESC
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
    const method = asOptionalString(req.body.method) || 'manual';
    const comment = asOptionalString(req.body.comment);
    const cost_price_at_receipt =
      req.body.cost_price_at_receipt != null
        ? parseFloat(req.body.cost_price_at_receipt)
        : null;

    if (!product_id || Number.isNaN(product_id)) {
      return res.status(400).json({ error: 'product_id is required' });
    }
    if (!quantity || Number.isNaN(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({ error: 'quantity must be a positive integer' });
    }
    if (!VALID_METHODS.includes(method)) {
      return res.status(400).json({
        error: `method must be one of: ${VALID_METHODS.join(', ')}`,
      });
    }
    if (
      cost_price_at_receipt !== null &&
      (Number.isNaN(cost_price_at_receipt) || cost_price_at_receipt < 0)
    ) {
      return res.status(400).json({
        error: 'cost_price_at_receipt must be a non-negative number',
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

    const receiptResult = await client.query(
      `
      INSERT INTO receipts
        (product_id, quantity, method, cost_price_at_receipt, comment)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, product_id, quantity, method, cost_price_at_receipt, comment, created_at
    `,
      [product_id, quantity, method, cost_price_at_receipt, comment]
    );

    const updatedProduct = await client.query(
      `
      UPDATE products
      SET stock = stock + $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, sku, stock
    `,
      [quantity, product_id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      receipt: receiptResult.rows[0],
      product: updatedProduct.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Receipt rollback failed', rollbackError);
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
