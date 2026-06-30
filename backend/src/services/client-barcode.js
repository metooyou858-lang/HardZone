const { pool } = require('../db');

async function generateClientBarcode(db = pool) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const barcode = `${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, '0')}`;
    const { rowCount } = await db.query('SELECT 1 FROM clients WHERE barcode = $1 LIMIT 1', [barcode]);

    if (rowCount === 0) {
      return barcode;
    }
  }

  throw new Error('Не удалось сгенерировать уникальный штрихкод');
}

async function ensureClientBarcode(clientId, db = pool) {
  const { rows } = await db.query('SELECT barcode FROM clients WHERE id = $1 LIMIT 1', [clientId]);
  const currentBarcode = rows[0]?.barcode;

  if (currentBarcode) {
    return currentBarcode;
  }

  const barcode = await generateClientBarcode(db);
  await db.query('UPDATE clients SET barcode = $1, updated_at = NOW() WHERE id = $2', [barcode, clientId]);
  return barcode;
}

module.exports = {
  ensureClientBarcode,
  generateClientBarcode,
};
