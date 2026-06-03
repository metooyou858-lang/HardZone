const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const requireSalesCreate = authMiddleware.requireModule('sales_create');
const requireSalesPay = authMiddleware.requireModule('sales_pay');
const requireSalesCancel = authMiddleware.requireModule('sales_cancel');

const VALID_PAYMENT_TYPES = ['cash', 'card'];

router.get('/', async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();
    const result = await client.query(`
      SELECT
        s.id,
        s.product_id,
        p.name AS product_name,
        p.sku AS product_sku,
        s.quantity,
        s.sale_price_at_sale,
        s.payment_type,
        s.status,
        s.aqsi_receipt_id,
        s.created_at
      FROM sales s
      JOIN products p ON p.id = s.product_id
      ORDER BY s.id DESC
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

router.post('/', requireSalesCreate, async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();

    const product_id = parseInt(req.body.product_id, 10);
    const quantity = parseInt(req.body.quantity, 10);
    const payment_type =
      typeof req.body.payment_type === 'string'
        ? req.body.payment_type.trim()
        : null;

    if (!product_id || Number.isNaN(product_id)) {
      return res.status(400).json({ error: 'product_id is required' });
    }
    if (!quantity || Number.isNaN(quantity) || quantity <= 0) {
      return res
        .status(400)
        .json({ error: 'quantity must be a positive integer' });
    }
    if (!payment_type || !VALID_PAYMENT_TYPES.includes(payment_type)) {
      return res.status(400).json({
        error: `payment_type is required and must be one of: ${VALID_PAYMENT_TYPES.join(', ')}`,
      });
    }

    await client.query('BEGIN');

    const productResult = await client.query(
      'SELECT id, name, sku, sale_price, stock FROM products WHERE id = $1 FOR UPDATE',
      [product_id]
    );
    if (productResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];

    if (Number(product.stock) < quantity) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Insufficient stock',
        available: Number(product.stock),
        requested: quantity,
      });
    }

    const saleResult = await client.query(
      `
      INSERT INTO sales
        (product_id, quantity, sale_price_at_sale, payment_type, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING id, product_id, quantity, sale_price_at_sale, payment_type, status, created_at
    `,
      [product_id, quantity, product.sale_price, payment_type]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      sale: saleResult.rows[0],
      message: 'Sale created. Waiting for payment confirmation from aqsi.',
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Sale create rollback failed', rollbackError);
      }
    }
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post('/:id/confirm', requireSalesPay, async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();

    const sale_id = parseInt(req.params.id, 10);
    const aqsi_receipt_id =
      typeof req.body.aqsi_receipt_id === 'string'
        ? req.body.aqsi_receipt_id.trim()
        : null;

    if (!sale_id || Number.isNaN(sale_id)) {
      return res.status(400).json({ error: 'sale id is invalid' });
    }

    await client.query('BEGIN');

    const saleResult = await client.query(
      'SELECT * FROM sales WHERE id = $1 FOR UPDATE',
      [sale_id]
    );
    if (saleResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleResult.rows[0];

    if (sale.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Cannot confirm sale with status: ${sale.status}`,
      });
    }

    const productResult = await client.query(
      'SELECT id, name, sku, stock FROM products WHERE id = $1 FOR UPDATE',
      [sale.product_id]
    );
    if (productResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];

    if (Number(product.stock) < Number(sale.quantity)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Insufficient stock at confirmation time',
        available: Number(product.stock),
        requested: Number(sale.quantity),
      });
    }

    const updatedSale = await client.query(
      `
      UPDATE sales
      SET status = 'confirmed', aqsi_receipt_id = $2
      WHERE id = $1
      RETURNING id, product_id, quantity, sale_price_at_sale, payment_type, status, aqsi_receipt_id, created_at
    `,
      [sale_id, aqsi_receipt_id]
    );

    const updatedProduct = await client.query(
      `
      UPDATE products
      SET stock = stock - $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, name, sku, stock
    `,
      [sale.quantity, sale.product_id]
    );

    await client.query('COMMIT');

    return res.json({
      sale: updatedSale.rows[0],
      product: updatedProduct.rows[0],
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Sale confirm rollback failed', rollbackError);
      }
    }
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.post('/:id/cancel', requireSalesCancel, async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();

    const sale_id = parseInt(req.params.id, 10);

    if (!sale_id || Number.isNaN(sale_id)) {
      return res.status(400).json({ error: 'sale id is invalid' });
    }

    await client.query('BEGIN');

    const saleResult = await client.query(
      'SELECT * FROM sales WHERE id = $1 FOR UPDATE',
      [sale_id]
    );
    if (saleResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleResult.rows[0];

    if (sale.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Cannot cancel sale with status: ${sale.status}`,
      });
    }

    const updatedSale = await client.query(
      `
      UPDATE sales SET status = 'cancelled'
      WHERE id = $1
      RETURNING id, product_id, quantity, sale_price_at_sale, payment_type, status, created_at
    `,
      [sale_id]
    );

    await client.query('COMMIT');

    return res.json({ sale: updatedSale.rows[0] });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Sale cancel rollback failed', rollbackError);
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
