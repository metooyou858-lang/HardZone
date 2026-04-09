require('dotenv').config();

const fs = require('fs');
const path = require('path');

const { query, pool } = require('../db');
const {
  buildAqsiOrderPayload,
  getAqsiHook,
  getAqsiOrder,
  listAqsiReceipts,
} = require('../services/aqsi');

const webhookLogPath = process.env.AQSI_WEBHOOK_LOG_DIR
  ? path.join(path.resolve(process.env.AQSI_WEBHOOK_LOG_DIR), 'aqsi-webhooks.ndjson')
  : path.resolve(process.env.HOME || process.cwd(), '.pm2/logs/aqsi-webhooks.ndjson');

function usage() {
  console.log('Usage: node src/scripts/aqsi-debug.js <order-id>');
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function parseWebhookLogLines() {
  if (!fs.existsSync(webhookLogPath)) {
    return [];
  }

  return fs
    .readFileSync(webhookLogPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { parseError: true, raw: line };
      }
    });
}

function findWebhookEvents(orderId, aqsiReceiptId) {
  return parseWebhookLogLines()
    .filter((event) => {
      const raw = JSON.stringify(event);
      return raw.includes(orderId) || (aqsiReceiptId && raw.includes(aqsiReceiptId));
    })
    .slice(-10);
}

function recentReceiptFilter() {
  const to = new Date();
  const from = new Date(to.getTime() - 1000 * 60 * 60 * 24 * 7);

  return {
    page: 1,
    pageSize: 50,
    'filtered.processedAtTzFrom': from.toISOString(),
    'filtered.processedAtTzTo': to.toISOString(),
  };
}

async function main() {
  const orderId = process.argv[2];

  if (!orderId) {
    usage();
    process.exitCode = 1;
    return;
  }

  const { rows: orders } = await query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!orders[0]) {
    console.error(`CRM order not found: ${orderId}`);
    process.exitCode = 1;
    return;
  }

  const order = orders[0];
  const { rows: items } = await query(
    'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
    [orderId]
  );
  const crmOrder = { ...order, items };

  console.log('=== CRM ORDER ===');
  console.log(formatJson(crmOrder));

  console.log('\n=== OUTBOUND AQSI PAYLOAD ===');
  console.log(formatJson(buildAqsiOrderPayload(crmOrder)));

  console.log('\n=== AQSI HOOK ===');
  try {
    const hook = await getAqsiHook();
    console.log(formatJson(hook));
  } catch (error) {
    console.log(formatJson({ error: error.message }));
  }

  console.log('\n=== AQSI ORDER STATE ===');
  try {
    const aqsiOrder = await getAqsiOrder(orderId);
    console.log(formatJson(aqsiOrder));
  } catch (error) {
    console.log(formatJson({ error: error.message }));
  }

  console.log('\n=== RECENT RECEIPTS MATCHES ===');
  try {
    const receipts = await listAqsiReceipts(recentReceiptFilter());
    const raw = JSON.stringify(receipts);
    if (!raw.includes(orderId) && !(order.aqsi_receipt_id && raw.includes(order.aqsi_receipt_id))) {
      console.log('[]');
    } else {
      console.log(formatJson(receipts));
    }
  } catch (error) {
    console.log(formatJson({ error: error.message }));
  }

  console.log('\n=== WEBHOOK EVENTS ===');
  console.log(formatJson(findWebhookEvents(orderId, order.aqsi_receipt_id)));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
