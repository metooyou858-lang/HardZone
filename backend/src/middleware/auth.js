const { resolveModules, hasModuleAccess } = require('../authz');
const { query } = require('../db');
const { getRequestSessionToken, readSessionToken } = require('../utils/session');

async function authMiddleware(req, res, next) {
  const sessionToken = getRequestSessionToken(req);
  const session = readSessionToken(sessionToken);

  if (!session?.user?.id) {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  try {
    const { rows } = await query(
      `
        SELECT id, name, role, username, is_active, module_grants, module_revokes
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [session.user.id]
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
        error: 'Недостаточно прав доступа',
      });
    }

    return next();
  };
}

module.exports = authMiddleware;
module.exports.requireRole = requireRole;
module.exports.requireModule = requireModule;
