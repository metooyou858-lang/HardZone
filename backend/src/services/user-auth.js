const { getDefaultRoleTitle, resolveModules, normalizeModules } = require('../authz');
const { query } = require('../db');
const { hashPassword, normalizeUsername } = require('../utils/passwords');

function normalizeEmail(value) {
  const email = String(value || '')
    .trim()
    .toLowerCase();
  return email || null;
}

function serializeUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    name: row.name,
    username: row.username,
    email: row.email || null,
    role: row.role,
    role_title: row.role_title || getDefaultRoleTitle(row.role),
    is_active: row.is_active,
    last_login_at: row.last_login_at,
    module_grants: normalizeModules(row.module_grants),
    module_revokes: normalizeModules(row.module_revokes),
    modules: resolveModules(row.role, row.module_grants, row.module_revokes),
  };
}

async function ensureBootstrapUser() {
  const username = normalizeUsername(process.env.AUTH_BOOTSTRAP_USERNAME);
  const password = String(process.env.AUTH_BOOTSTRAP_PASSWORD || '');

  if (!username || !password) {
    return null;
  }

  const name = String(process.env.AUTH_BOOTSTRAP_NAME || 'Главный администратор').trim();
  const role = ['owner', 'admin'].includes(process.env.AUTH_BOOTSTRAP_ROLE)
    ? process.env.AUTH_BOOTSTRAP_ROLE
    : 'owner';
  const email = normalizeEmail(process.env.AUTH_BOOTSTRAP_EMAIL);
  const roleTitle = getDefaultRoleTitle(role);

  const { rows: existingRows } = await query(
    'SELECT id, name, role, role_title, username, email, password_hash, is_active, last_login_at, module_grants, module_revokes FROM users WHERE LOWER(username) = $1 LIMIT 1',
    [username]
  );

  if (!existingRows[0]) {
    const passwordHash = await hashPassword(password);
    const { rows } = await query(
      `
        INSERT INTO users (name, role, role_title, username, email, password_hash, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
        RETURNING id, name, username, email, role, role_title, is_active, last_login_at, module_grants, module_revokes
      `,
      [name, role, roleTitle, username, email, passwordHash]
    );

    return serializeUser(rows[0]);
  }

  if (!existingRows[0].password_hash || (email && !existingRows[0].email) || !existingRows[0].role_title) {
    const passwordHash = existingRows[0].password_hash || (await hashPassword(password));
    const { rows } = await query(
      `
        UPDATE users
        SET password_hash = $1,
            email = COALESCE(email, $2),
            role_title = COALESCE(role_title, $3),
            updated_at = NOW()
        WHERE id = $4
        RETURNING id, name, username, email, role, role_title, is_active, last_login_at, module_grants, module_revokes
      `,
      [passwordHash, email, roleTitle, existingRows[0].id]
    );

    return serializeUser(rows[0]);
  }

  return serializeUser(existingRows[0]);
}

module.exports = {
  ensureBootstrapUser,
  normalizeEmail,
  serializeUser,
};
