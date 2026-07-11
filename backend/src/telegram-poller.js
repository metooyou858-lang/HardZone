require('dotenv').config();

const { pool } = require('./db');
const logger = require('./services/logger');
const { getTelegramRetryDelayMs } = require('./services/telegram-api-error');
const { configureMenuButton, handleTelegramUpdate, telegramRequest } = require('./services/telegram-bot');

const POLL_TIMEOUT_SECONDS = Number.parseInt(process.env.TELEGRAM_POLL_TIMEOUT || '25', 10);
const REQUEST_TIMEOUT_MS = (POLL_TIMEOUT_SECONDS + 10) * 1000;

let stopped = false;

function isEnabled() {
  return process.env.TELEGRAM_ENABLED === 'true' && process.env.TELEGRAM_POLLING_ENABLED === 'true';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll() {
  if (!isEnabled()) {
    logger.info('telegram', { action: 'poller_disabled' });
    return;
  }

  while (!stopped) {
    try {
      await telegramRequest('deleteWebhook', { drop_pending_updates: false }, { timeoutMs: 15000 });
      await configureMenuButton();
      break;
    } catch (error) {
      const retryMs = getTelegramRetryDelayMs(error);
      logger.error('telegram', {
        action: 'poller_init_failed',
        message: error.message,
        retry_ms: retryMs,
      });
      await sleep(retryMs);
    }
  }

  if (stopped) return;
  logger.info('telegram', { action: 'poller_started' });

  let offset;
  while (!stopped) {
    try {
      const result = await telegramRequest(
        'getUpdates',
        {
          offset,
          timeout: POLL_TIMEOUT_SECONDS,
          allowed_updates: ['message', 'callback_query'],
        },
        { timeoutMs: REQUEST_TIMEOUT_MS }
      );

      const updates = Array.isArray(result?.result) ? result.result : [];
      for (const update of updates) {
        offset = Number(update.update_id) + 1;
        try {
          await handleTelegramUpdate(update);
        } catch (error) {
          logger.error('telegram', {
            action: 'poll_update_failed',
            update_id: update.update_id,
            message: error.message,
            stack: error.stack,
          });
        }
      }
    } catch (error) {
      const retryMs = getTelegramRetryDelayMs(error);
      logger.error('telegram', {
        action: 'poll_failed',
        message: error.message,
        stack: error.stack,
        retry_ms: retryMs,
      });
      await sleep(retryMs);
    }
  }
}

async function shutdown(signal) {
  stopped = true;
  logger.info('telegram', { action: 'poller_stopping', signal });
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

poll().catch(async (error) => {
  logger.error('telegram', {
    action: 'poller_crashed',
    message: error.message,
    stack: error.stack,
  });
  await pool.end();
  process.exit(1);
});
