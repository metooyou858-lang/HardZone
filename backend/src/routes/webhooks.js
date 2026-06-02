const express = require('express');
const fs = require('fs');
const path = require('path');

const { pool } = require('../db');
const { getAqsiOrder } = require('../services/aqsi');
const { confirmOpenOrderPayment, detectPaymentType, saveOrderFiscalData } = require('../services/order-sync');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();
const logDir = process.env.AQSI_WEBHOOK_LOG_DIR
  ? path.resolve(process.env.AQSI_WEBHOOK_LOG_DIR)
  : path.resolve(process.env.HOME || process.cwd(), '.pm2/logs');
const aqsiWebhookLogPath = path.join(logDir, 'aqsi-webhooks.ndjson');

function writeAqsiWebhookLog(req) {
  try {
    fs.mkdirSync(logDir, { recursive: true });

    fs.appendFileSync(
      aqsiWebhookLogPath,
      `${JSON.stringify({
        receivedAt: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        headers: {
          'content-type': req.headers['content-type'] || null,
          'user-agent': req.headers['user-agent'] || null,
          'x-forwarded-for': req.headers['x-forwarded-for'] || null,
        },
        body: req.body || null,
      })}\n`
    );
  } catch (error) {
    console.error('Failed to write AQSI webhook log', error);
  }
}

function isPaidStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return (
    normalized === '\u043e\u043f\u043b\u0430\u0447\u0435\u043d' ||
    normalized === 'paid' ||
    normalized === 'completed'
  );
}

router.post('/aqsi', async (req, res) => {
  try {
    const orderId = req.body?.orderId || req.body?.id || req.body?.order?.id || null;

    writeAqsiWebhookLog(req);
    console.log('AQSI webhook payload:', JSON.stringify(req.body));

    if (!orderId || !isPaidStatus(req.body?.status)) {
      return res.status(200).json({ ok: true });
    }

    const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1 AND status = $2', [
      orderId,
      'open',
    ]);

    if (!orderRows[0]) {
      return res.status(200).json({ ok: true });
    }

    let aqsiOrder = null;

    try {
      aqsiOrder = await getAqsiOrder(orderId);
    } catch (error) {
      console.error(`Failed to fetch AQSI order ${orderId} after webhook`, error);
    }

    const finalized = await confirmOpenOrderPayment(orderId, aqsiOrder ? detectPaymentType(aqsiOrder) : null);

    if (aqsiOrder && finalized.order) {
      await saveOrderFiscalData({ query: (...args) => pool.query(...args) }, orderId, aqsiOrder);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendInternalError(res, err, { route: 'webhooks.aqsi' });
  }
});

module.exports = router;
