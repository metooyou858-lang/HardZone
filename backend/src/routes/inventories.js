const express = require('express');
const { pool, query } = require('../db');

const router = express.Router();

function parseNonNegativeInteger(value) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function asOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        i.id,
        i.status,
        i.comment,
        i.created_at,
        i.confirmed_at,
        COUNT(ii.id) AS total_items,
        COUNT(ii.actual_qty) AS filled_items,
        COUNT(CASE WHEN ii.actual_qty IS NOT NULL AND ii.difference <> 0 THEN 1 END) AS items_with_diff
      FROM inventories i
      LEFT JOIN inventory_items ii ON ii.inventory_id = i.id
      GROUP BY i.id
      ORDER BY i.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const inventoryResult = await query(
      `
      SELECT
        i.id,
        i.status,
        i.comment,
        i.created_at,
        i.confirmed_at,
        COUNT(ii.id) AS total_items,
        COUNT(ii.actual_qty) AS filled_items,
        COUNT(CASE WHEN ii.actual_qty IS NOT NULL AND ii.difference <> 0 THEN 1 END) AS items_with_diff
      FROM inventories i
      LEFT JOIN inventory_items ii ON ii.inventory_id = i.id
      WHERE i.id = $1
      GROUP BY i.id
    `,
      [req.params.id]
    );

    if (inventoryResult.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const itemsResult = await query(
      `
      SELECT
        ii.id,
        ii.product_id,
        ii.expected_qty,
        ii.actual_qty,
        ii.difference,
        p.name AS product_name,
        p.sku AS product_sku,
        p.barcode,
        c.name AS category_name
      FROM inventory_items ii
      JOIN products p ON p.id = ii.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE ii.inventory_id = $1
      ORDER BY p.name ASC
    `,
      [req.params.id]
    );

    return res.json({
      ...inventoryResult.rows[0],
      items: itemsResult.rows,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();

    const comment = asOptionalString(req.body.comment);

    const openInventory = await client.query(
      `SELECT id FROM inventories WHERE status = 'draft' ORDER BY id DESC LIMIT 1`
    );

    if (openInventory.rowCount > 0) {
      return res.status(409).json({
        error: 'There is already an open inventory',
        inventory_id: openInventory.rows[0].id,
      });
    }

    await client.query('BEGIN');

    const inventoryResult = await client.query(
      `
      INSERT INTO inventories (comment)
      VALUES ($1)
      RETURNING id, status, comment, created_at, confirmed_at
    `,
      [comment]
    );

    const inventoryId = inventoryResult.rows[0].id;

    await client.query(
      `
      INSERT INTO inventory_items (inventory_id, product_id, expected_qty)
      SELECT $1, id, stock
      FROM products
      ORDER BY id
    `,
      [inventoryId]
    );

    await client.query('COMMIT');

    const summaryResult = await client.query(
      `
      SELECT
        i.id,
        i.status,
        i.comment,
        i.created_at,
        i.confirmed_at,
        COUNT(ii.id) AS total_items,
        COUNT(ii.actual_qty) AS filled_items,
        COUNT(CASE WHEN ii.actual_qty IS NOT NULL AND ii.difference <> 0 THEN 1 END) AS items_with_diff
      FROM inventories i
      LEFT JOIN inventory_items ii ON ii.inventory_id = i.id
      WHERE i.id = $1
      GROUP BY i.id
    `,
      [inventoryId]
    );

    return res.status(201).json(summaryResult.rows[0]);
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Inventory create rollback failed', rollbackError);
      }
    }
    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.patch('/:id/items/:itemId', async (req, res, next) => {
  try {
    const actualQty = parseNonNegativeInteger(req.body.actual_qty);

    if (actualQty === null) {
      return res.status(400).json({
        error: 'actual_qty must be a non-negative integer',
      });
    }

    const inventoryResult = await query(
      `SELECT status FROM inventories WHERE id = $1`,
      [req.params.id]
    );

    if (inventoryResult.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    if (inventoryResult.rows[0].status !== 'draft') {
      return res.status(409).json({ error: 'Inventory is already confirmed' });
    }

    const itemResult = await query(
      `
      UPDATE inventory_items
      SET actual_qty = $1
      WHERE id = $2 AND inventory_id = $3
      RETURNING id, inventory_id, product_id, expected_qty, actual_qty, difference, created_at
    `,
      [actualQty, req.params.itemId, req.params.id]
    );

    if (itemResult.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    return res.json(itemResult.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/confirm', async (req, res, next) => {
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const inventoryResult = await client.query(
      `
      SELECT id, status, comment, created_at, confirmed_at
      FROM inventories
      WHERE id = $1
      FOR UPDATE
    `,
      [req.params.id]
    );

    if (inventoryResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const inventory = inventoryResult.rows[0];

    if (inventory.status !== 'draft') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Inventory is already confirmed' });
    }

    const missingItemsResult = await client.query(
      `
      SELECT COUNT(*) AS count
      FROM inventory_items
      WHERE inventory_id = $1 AND actual_qty IS NULL
    `,
      [req.params.id]
    );

    const missingItems = Number(missingItemsResult.rows[0].count);

    if (missingItems > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Not all inventory items are filled',
        missing_items: missingItems,
      });
    }

    const itemsResult = await client.query(
      `
      SELECT product_id, expected_qty, actual_qty, difference
      FROM inventory_items
      WHERE inventory_id = $1
      ORDER BY product_id ASC
    `,
      [req.params.id]
    );

    for (const item of itemsResult.rows) {
      await client.query(
        `
        UPDATE products
        SET stock = $1, updated_at = NOW()
        WHERE id = $2
      `,
        [item.actual_qty, item.product_id]
      );

      if (Number(item.difference) > 0) {
        await client.query(
          `
          INSERT INTO receipts
            (product_id, quantity, method, cost_price_at_receipt, comment)
          VALUES ($1, $2, 'manual', NULL, $3)
        `,
          [item.product_id, item.difference, `Inventory #${req.params.id} adjustment`]
        );
      }

      if (Number(item.difference) < 0) {
        await client.query(
          `
          INSERT INTO writeoffs
            (product_id, quantity, reason_type, reason)
          VALUES ($1, $2, 'other', $3)
        `,
          [item.product_id, Math.abs(Number(item.difference)), `Inventory #${req.params.id} adjustment`]
        );
      }
    }

    const updatedInventoryResult = await client.query(
      `
      UPDATE inventories
      SET status = 'confirmed', confirmed_at = NOW()
      WHERE id = $1
      RETURNING id, status, comment, created_at, confirmed_at
    `,
      [req.params.id]
    );

    await client.query('COMMIT');

    return res.json({
      inventory: updatedInventoryResult.rows[0],
      updated_products: itemsResult.rowCount,
      items_with_diff: itemsResult.rows.filter(
        (item) => Number(item.difference) !== 0
      ).length,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Inventory confirm rollback failed', rollbackError);
      }
    }
    next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const inventoryResult = await query(
      `SELECT status FROM inventories WHERE id = $1`,
      [req.params.id]
    );

    if (inventoryResult.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    if (inventoryResult.rows[0].status !== 'draft') {
      return res.status(409).json({
        error: 'Cannot delete confirmed inventory',
      });
    }

    await query(`DELETE FROM inventories WHERE id = $1`, [req.params.id]);

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
