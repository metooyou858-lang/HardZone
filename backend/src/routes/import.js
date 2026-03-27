const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

const { pool } = require('../db');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const COL_MAP = {
  name: ['наименование', 'название', 'товар', 'name', 'номенклатура'],
  barcode: [
    'штрихкод',
    'штрихкод(ы)',
    'barcode',
    'ean',
    'код товара',
    'штрих-код',
  ],
  quantity: ['количество', 'кол-во', 'кол', 'qty', 'quantity', 'остаток'],
  cost_price: [
    'себестоимость',
    'себестоимость, ₽',
    'цена закупки',
    'закупка',
    'закупочная цена',
    'cost',
    'приход',
  ],
  sale_price: [
    'цена продажи',
    'цена, ₽',
    'цена',
    'розница',
    'розничная цена',
    'price',
    'стоимость',
  ],
  sku: ['артикул', 'sku', 'арт', 'арт.'],
};

function getHeaderMatchScore(header, aliases) {
  const normalizedHeader = String(header).toLowerCase().trim();
  let bestScore = -1;

  aliases.forEach((alias) => {
    const normalizedAlias = alias.toLowerCase().trim();

    if (normalizedHeader === normalizedAlias) {
      bestScore = Math.max(bestScore, 1000 + normalizedAlias.length);
      return;
    }

    if (normalizedHeader.includes(normalizedAlias)) {
      bestScore = Math.max(bestScore, normalizedAlias.length);
    }
  });

  return bestScore;
}

function detectColumns(headers) {
  const map = {};
  const scores = {};

  headers.forEach((header, index) => {
    if (!header) {
      return;
    }

    Object.entries(COL_MAP).forEach(([field, aliases]) => {
      const score = getHeaderMatchScore(header, aliases);

      if (score < 0) {
        return;
      }

      if (scores[field] === undefined || score > scores[field]) {
        scores[field] = score;
        map[field] = index;
      }
    });
  });

  return map;
}

function parseRow(row, colMap) {
  const get = (field) => {
    const index = colMap[field];

    if (index === undefined) {
      return null;
    }

    const value = row[index];

    if (value === null || value === undefined || value === '') {
      return null;
    }

    return value;
  };

  const name = get('name');

  if (!name) {
    return null;
  }

  const quantity = get('quantity');
  const costPrice = get('cost_price');
  const salePrice = get('sale_price');

  return {
    name: String(name).trim(),
    barcode: (() => {
      const val = get('barcode');

      if (val === null || val === undefined || val === '') {
        return null;
      }

      // Excel can return barcode cells as numbers, so normalize them
      // without scientific notation before storing/searching.
      if (typeof val === 'number') {
        return Math.round(val).toString().trim();
      }

      return String(val).trim();
    })(),
    sku: get('sku') ? String(get('sku')).trim() : null,
    quantity: quantity ? Math.abs(Number.parseInt(quantity, 10)) : null,
    cost_price: costPrice ? Math.abs(Number.parseFloat(costPrice)) : null,
    sale_price: salePrice ? Math.abs(Number.parseFloat(salePrice)) : null,
  };
}

function makeFallbackSku(item) {
  if (item.sku) {
    return item.sku;
  }

  if (item.barcode) {
    return item.barcode;
  }

  return `IMPORT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

router.post('/parse', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const ext = req.file.originalname.split('.').pop().toLowerCase();

    if (!['xlsx', 'xls'].includes(ext)) {
      return res.status(400).json({
        error: 'Поддерживается только Excel (.xlsx, .xls)',
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName =
      workbook.SheetNames.find((name) => name.toLowerCase().includes('товар')) ??
      workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rows.length < 2) {
      return res.status(400).json({
        error: 'Файл пустой или содержит только заголовки',
      });
    }

    let headerRowIdx = 0;
    let colMap = {};

    for (let index = 0; index < Math.min(5, rows.length); index += 1) {
      const candidate = detectColumns(rows[index]);

      if (candidate.name !== undefined) {
        headerRowIdx = index;
        colMap = candidate;
        break;
      }
    }

    if (colMap.name === undefined) {
      return res.status(400).json({
        error: 'Не найдена колонка с названием товара',
        hint: 'Убедитесь что в файле есть колонка: Наименование, Название или Товар',
      });
    }

    const items = [];

    for (let index = headerRowIdx + 1; index < rows.length; index += 1) {
      const parsed = parseRow(rows[index], colMap);

      if (parsed) {
        items.push({ ...parsed, row: index + 1 });
      }
    }

    if (items.length === 0) {
      return res.status(400).json({
        error: 'Не удалось распознать ни одной позиции',
      });
    }

    const client = await pool.connect();

    try {
      const enriched = await Promise.all(
        items.map(async (item) => {
          if (item.barcode) {
            const barcodeResult = await client.query(
              `
                SELECT id, name, sku, stock, cost_price, sale_price
                FROM products
                WHERE barcode = $1
              `,
              [item.barcode]
            );

            if (barcodeResult.rowCount > 0) {
              return {
                ...item,
                matched: true,
                existing_product: barcodeResult.rows[0],
              };
            }
          }

          const nameResult = await client.query(
            `
              SELECT id, name, sku, stock, cost_price, sale_price
              FROM products
              WHERE LOWER(name) = LOWER($1)
            `,
            [item.name]
          );

          if (nameResult.rowCount > 0) {
            return {
              ...item,
              matched: true,
              existing_product: nameResult.rows[0],
            };
          }

          return {
            ...item,
            matched: false,
            existing_product: null,
          };
        })
      );

      return res.json({
        total: enriched.length,
        matched: enriched.filter((item) => item.matched).length,
        new: enriched.filter((item) => !item.matched).length,
        columns_detected: Object.keys(colMap),
        items: enriched,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

router.post('/confirm', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { items, mode } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Список позиций пустой' });
    }

    await client.query('BEGIN');

    const results = [];

    for (const item of items) {
      if (item.skip) {
        // eslint-disable-next-line no-continue
        continue;
      }

      let productId = item.existing_product?.id ?? null;

      if (!productId) {
        const created = await client.query(
          `
            INSERT INTO products (name, sku, barcode, cost_price, sale_price)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (barcode) DO UPDATE
            SET
              name = EXCLUDED.name,
              cost_price = COALESCE(EXCLUDED.cost_price, products.cost_price),
              sale_price = COALESCE(EXCLUDED.sale_price, products.sale_price),
              updated_at = NOW()
            RETURNING id
          `,
          [
            item.name,
            makeFallbackSku(item),
            item.barcode || null,
            item.cost_price || null,
            item.sale_price || null,
          ]
        );

        productId = created.rows[0].id;
      } else if (item.barcode) {
        await client.query(
          `
            UPDATE products
            SET
              barcode = COALESCE(barcode, $1),
              sku = COALESCE(sku, $2),
              updated_at = NOW()
            WHERE id = $3
          `,
          [item.barcode, item.sku || null, productId]
        );
      }

      if (mode === 'receipt' && item.quantity > 0) {
        await client.query(
          `
            INSERT INTO receipts (product_id, quantity, method, cost_price_at_receipt)
            VALUES ($1, $2, 'manual', $3)
          `,
          [productId, item.quantity, item.cost_price || null]
        );

        await client.query(
          `
            UPDATE products
            SET stock = stock + $1, updated_at = NOW()
            WHERE id = $2
          `,
          [item.quantity, productId]
        );
      }

      results.push({
        product_id: productId,
        name: item.name,
        quantity: item.quantity,
      });
    }

    await client.query('COMMIT');

    return res.status(201).json({
      imported: results.length,
      results,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
