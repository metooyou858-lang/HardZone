const { createHmac, timingSafeEqual } = require('node:crypto');

function isSafeHexEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'hex');
  const rightBuffer = Buffer.from(String(right || ''), 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseTelegramInitData(initData, botToken, { maxAgeSeconds = 24 * 60 * 60, now = Date.now() } = {}) {
  const params = new URLSearchParams(String(initData || ''));
  const hash = params.get('hash');
  if (!hash || !botToken) return null;

  params.delete('hash');
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!isSafeHexEqual(expectedHash, hash)) return null;

  const authDate = Number.parseInt(params.get('auth_date') || '', 10);
  const ageSeconds = now / 1000 - authDate;
  if (!Number.isInteger(authDate) || ageSeconds < -60 || ageSeconds > maxAgeSeconds) return null;

  try {
    const user = JSON.parse(params.get('user') || '{}');
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

module.exports = { parseTelegramInitData };
