const { createHmac, timingSafeEqual } = require('node:crypto');

const { hasModuleAccess, resolveModules } = require('../authz');
const { query } = require('../db');

const PROXY_MAX_SKEW_MS = 5 * 60 * 1000;
const STAFF_ROLES = ['owner', 'admin'];

function fromBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf-8');
}

function getProxySecret() {
  return process.env.AUTH_PROXY_SECRET || process.env.AUTH_TOKEN || '';
}

function buildProxySignaturePayload({ id, role, username, name, timestamp }) {
  return [id, role, username, name, timestamp].join(':');
}

function isSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readProxyUser(req) {
  const idRaw = req.headers['x-hardzone-user-id'];
  const role = req.headers['x-hardzone-user-role'];
  const usernameRaw = req.headers['x-hardzone-user-username'];
  const nameRaw = req.headers['x-hardzone-user-name'];
  const timestampRaw = req.headers['x-hardzone-user-ts'];
  const signature = req.headers['x-hardzone-user-signature'];

  if (!idRaw || !role || !usernameRaw || !nameRaw || !timestampRaw || !signature) {
    return null;
  }

  const id = Number(idRaw);
  const timestamp = Number(timestampRaw);
  const username = fromBase64Url(usernameRaw).trim().toLowerCase();
  const name = fromBase64Url(nameRaw).trim();

  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  if (!STAFF_ROLES.includes(role)) {
    return null;
  }

  if (!username || !name || !Number.isFinite(timestamp)) {
    return null;
  }

  if (Math.abs(Date.now() - timestamp) > PROXY_MAX_SKEW_MS) {
    return null;
  }

  const proxySecret = getProxySecret();
  if (!proxySecret) {
    return null;
  }

  const payload = buildProxySignaturePayload({
    id,
    role,
    username,
    name,
    timestamp: String(timestamp),
  });

  const expectedSignature = createHmac('sha256', proxySecret).update(payload).digest('base64url');
  if (!isSafeEqual(expectedSignature, signature)) {
    return null;
  }

  return {
    id,
    role,
    username,
    name,
  };
}

function hasProxyUserHeaders(req) {
  return Boolean(
    req.headers['x-hardzone-user-id'] ||
      req.headers['x-hardzone-user-role'] ||
      req.headers['x-hardzone-user-username'] ||
      req.headers['x-hardzone-user-name'] ||
      req.headers['x-hardzone-user-ts'] ||
      req.headers['x-hardzone-user-signature']
  );
}

async function authMiddleware(req, res, next) {
  const token = process.env.AUTH_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: 'AUTH_TOKEN is not configured',
    });
  }

  const header = req.headers.authorization || '';
  const [scheme, value] = header.split(' ');

  if (scheme !== 'Bearer' || value !== token) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const proxyUser = readProxyUser(req);
  if (!proxyUser && hasProxyUserHeaders(req)) {
    return res.status(401).json({
      error: 'Invalid proxy user headers',
    });
  }

  if (!proxyUser) {
    req.user = null;
    return next();
  }

  try {
    const { rows } = await query(
      `
        SELECT id, name, role, username, is_active, module_grants, module_revokes
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [proxyUser.id]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        error: 'User is inactive',
      });
    }

    if (String(user.role) !== proxyUser.role) {
      return res.status(401).json({
        error: 'User context is outdated',
      });
    }

    req.user = {
      id: Number(user.id),
      role: user.role,
      username: user.username,
      name: user.name,
      modules: resolveModules(user.role, user.module_grants, user.module_revokes),
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role;

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        error: 'Недостаточно прав доступа',
      });
    }

    return next();
  };
}

function requireModule(...allowedModules) {
  return (req, res, next) => {
    const hasAccess = allowedModules.some((permission) => hasModuleAccess(req.user, permission));

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: 'РќРµРґРѕСЃС‚Р°С‚РѕС‡РЅРѕ РїСЂР°РІ РґРѕСЃС‚СѓРїР°',
      });
    }

    return next();
  };
}

module.exports = authMiddleware;
module.exports.requireRole = requireRole;
module.exports.requireModule = requireModule;
module.exports.STAFF_ROLES = STAFF_ROLES;
