const express = require('express');

const { handleTelegramUpdate } = require('../services/telegram-bot');
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

    await handleTelegramUpdate(req.body || {});
    return res.json({ success: true });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.webhook' });
  }
});

module.exports = router;
