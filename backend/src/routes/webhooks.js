const express = require('express');

const logger = require('../services/logger');
const { syncOrderWithAqsi: defaultSyncOrderWithAqsi } = require('../services/order-sync');
const { sendInternalError } = require('../utils/http-response');

function createWebhooksRouter({ syncOrderWithAqsi = defaultSyncOrderWithAqsi } = {}) {
  const router = express.Router();

  router.post('/aqsi', async (req, res) => {
    try {
      const orderId = req.body?.orderId || req.body?.id || req.body?.order?.id || null;

      if (!orderId) {
        return res.status(200).json({ ok: true });
      }

      const result = await syncOrderWithAqsi(orderId, { markAttempt: true });
      logger.info('aqsi_webhook', {
        action: 'authoritative_sync',
        order_id: orderId,
        paid: result.paid,
        reason: result.reason,
      });

      return res.status(200).json({ ok: true });
    } catch (error) {
      logger.warn('aqsi_webhook', {
        action: 'authoritative_sync_failed',
        order_id: req.body?.orderId || req.body?.id || req.body?.order?.id || null,
        message: error.message,
      });
      return sendInternalError(res, error, { route: 'webhooks.aqsi' });
    }
  });

  return router;
}

const router = createWebhooksRouter();
router.createWebhooksRouter = createWebhooksRouter;

module.exports = router;
