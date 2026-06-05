const express = require('express');
const { createHmac, timingSafeEqual } = require('node:crypto');

const { handleTelegramUpdate } = require('../services/telegram-bot');
const { resolveModules } = require('../authz');
const { query } = require('../db');
const logger = require('../services/logger');
const { sendInternalError } = require('../utils/http-response');

const router = express.Router();

function isTelegramEnabled() {
  return process.env.TELEGRAM_ENABLED === 'true';
}

function getWebhookSecret() {
  return String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
}

function getBotToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function isSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseTelegramInitData(initData) {
  const params = new URLSearchParams(String(initData || ''));
  const hash = params.get('hash');

  if (!hash) {
    return null;
  }

  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(getBotToken()).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!isSafeEqual(expectedHash, hash)) {
    return null;
  }

  const authDate = Number.parseInt(params.get('auth_date') || '', 10);
  if (!Number.isInteger(authDate) || Date.now() / 1000 - authDate > 24 * 60 * 60) {
    return null;
  }

  try {
    return JSON.parse(params.get('user') || '{}');
  } catch {
    return null;
  }
}

async function findSessionUserByTelegramId(telegramId) {
  const { rows } = await query(
    `
      SELECT id, name, role, role_title, username, is_active, module_grants, module_revokes
      FROM users
      WHERE telegram_id = $1
      LIMIT 1
    `,
    [String(telegramId)]
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    return null;
  }

  return {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    role: user.role,
    role_title: user.role_title,
    modules: resolveModules(user.role, user.module_grants, user.module_revokes),
  };
}

router.post('/miniapp-login', async (req, res) => {
  try {
    if (!getBotToken()) {
      return res.status(503).json({ success: false, error: 'Telegram bot token is not configured' });
    }

    const telegramUser = parseTelegramInitData(req.body?.init_data);
    if (!telegramUser?.id) {
      return res.status(401).json({ success: false, error: 'Telegram авторизация недействительна' });
    }

    const user = await findSessionUserByTelegramId(telegramUser.id);
    if (!user) {
      return res.status(403).json({ success: false, error: 'Telegram не привязан к сотруднику HardZone' });
    }

    return res.json({ success: true, data: { user } });
  } catch (error) {
    return sendInternalError(res, error, { route: 'telegram.miniapp_login' });
  }
});

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
