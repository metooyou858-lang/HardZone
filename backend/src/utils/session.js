const { createHmac, timingSafeEqual } = require('node:crypto');

const STAFF_ROLES = ['owner', 'admin'];

function getSessionSecret() {
  return (
    process.env.HARDZONE_SESSION_SECRET ||
    process.env.BACKEND_API_TOKEN ||
    process.env.AUTH_PROXY_SECRET ||
    process.env.AUTH_TOKEN ||
    ''
  );
}

function isSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function createSignature(encodedPayload) {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf-8');
}

function isValidSessionUser(user) {
  if (!user || typeof user !== 'object') {
    return false;
  }

  return (
    Number.isFinite(user.id) &&
    user.id > 0 &&
    typeof user.name === 'string' &&
    user.name.trim().length > 0 &&
    typeof user.username === 'string' &&
    user.username.trim().length > 0 &&
    STAFF_ROLES.includes(user.role)
  );
}

function readSessionToken(token) {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = String(token).split('.');
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createSignature(encodedPayload);
  if (!expectedSignature || !isSafeEqual(expectedSignature, signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));

    if (!payload || typeof payload.exp !== 'number' || payload.exp <= Date.now() || !isValidSessionUser(payload.user)) {
      return null;
    }

    return {
      exp: payload.exp,
      user: {
        id: Number(payload.user.id),
        role: payload.user.role,
        username: String(payload.user.username).trim(),
        name: String(payload.user.name).trim(),
      },
    };
  } catch {
    return null;
  }
}

function getRequestSessionToken(req) {
  const header = req.headers['x-hardzone-session'];

  if (Array.isArray(header)) {
    return String(header[0] || '').trim() || null;
  }

  return String(header || '').trim() || null;
}

module.exports = {
  STAFF_ROLES,
  getRequestSessionToken,
  readSessionToken,
};
