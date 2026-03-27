const express = require('express');

const { query } = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        c.id,
        c.name,
        COUNT(p.id)::INTEGER AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id
      ORDER BY c.name ASC
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : null;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const result = await query(
      `
        INSERT INTO categories (name)
        VALUES ($1)
        RETURNING id, name, created_at
      `,
      [name]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Категория с таким названием уже существует',
      });
    }

    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : null;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const result = await query(
      `
        UPDATE categories
        SET name = $1
        WHERE id = $2
        RETURNING id, name, created_at
      `,
      [name, req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Категория с таким названием уже существует',
      });
    }

    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const check = await query(
      `
        SELECT COUNT(*)::INTEGER AS count
        FROM products
        WHERE category_id = $1
      `,
      [req.params.id]
    );

    if (check.rows[0].count > 0) {
      return res.status(409).json({
        error: 'Нельзя удалить категорию в которой есть товары',
        product_count: check.rows[0].count,
      });
    }

    await query('DELETE FROM categories WHERE id = $1', [req.params.id]);

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
