const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  createTelegramApiError,
  getTelegramRetryDelayMs,
} = require('../src/services/telegram-api-error');

test('Telegram 429 errors preserve retry_after for poller backoff', async () => {
  const response = new Response(JSON.stringify({
    ok: false,
    error_code: 429,
    description: 'Too Many Requests',
    parameters: { retry_after: 17 },
  }), { status: 429 });

  const error = await createTelegramApiError(response, 'Telegram client', 'getUpdates');

  assert.equal(error.status, 429);
  assert.equal(error.retryAfterMs, 17000);
  assert.equal(getTelegramRetryDelayMs(error), 17000);
});

test('Telegram retry delay uses a bounded fallback for malformed responses', async () => {
  const response = new Response('Bad Gateway', { status: 502 });
  const error = await createTelegramApiError(response, 'Telegram', 'getUpdates');

  assert.equal(error.status, 502);
  assert.equal(error.retryAfterMs, null);
  assert.equal(getTelegramRetryDelayMs(error), 5000);
  assert.equal(getTelegramRetryDelayMs({ retryAfterMs: 999999999 }), 300000);
});
