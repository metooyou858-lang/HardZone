const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const { parseTelegramInitData } = require('../src/services/telegram-init-data');

function sign(user, token, authDate) {
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify(user) });
  const check = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

test('Telegram init data accepts a fresh signed user', () => {
  const now = Date.UTC(2026, 6, 11, 7, 0, 0);
  const value = sign({ id: 123, first_name: 'CI' }, 'token', now / 1000 - 60);
  assert.deepEqual(parseTelegramInitData(value, 'token', { now }), { id: 123, first_name: 'CI' });
});

test('Telegram init data rejects tampering, stale data, future data, and missing user id', () => {
  const now = Date.UTC(2026, 6, 11, 7, 0, 0);
  const fresh = sign({ id: 123, first_name: 'CI' }, 'token', now / 1000 - 60);
  const stale = sign({ id: 123 }, 'token', now / 1000 - 86401);
  const future = sign({ id: 123 }, 'token', now / 1000 + 61);
  const noId = sign({ first_name: 'CI' }, 'token', now / 1000 - 60);

  assert.equal(parseTelegramInitData(fresh.replace('CI', 'Bad'), 'token', { now }), null);
  assert.equal(parseTelegramInitData(stale, 'token', { now }), null);
  assert.equal(parseTelegramInitData(future, 'token', { now }), null);
  assert.equal(parseTelegramInitData(noId, 'token', { now }), null);
});
