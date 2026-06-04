const express = require('express');

const { handleTelegramUpdate } = require('../services/telegram-bot');
const logger = require('../services/logger');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();

function isTelegramEnabled() {
  return process.env.TELEGRAM_ENABLED === 'true';
}

function getWebhookSecret() {
  return String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

router.post('/webhook/:secret', async (req, res) => {
  try {
    const expectedSecret = getWebhookSecret();
    const actualSecret = String(req.params.secret || '');

    if (!isTelegramEnabled() || !expectedSecret || actualSecret !== expectedSecret) {
      return res.status(404).json({ success: false, error: 'Route not found' });
    }

    res.json({ success: true });

    handleTelegramUpdate(req.body || {}).catch((error) => {
      logger.error('telegram', {
        action: 'handle_update_failed',
        message: error.message,
        stack: error.stack,
      });
    });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.webhook' });
  }
});

module.exports = router;
