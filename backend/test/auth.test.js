process.env.HARDZONE_SESSION_SECRET = process.env.HARDZONE_SESSION_SECRET || 'test-session-secret';
process.env.BACKEND_API_TOKEN = process.env.BACKEND_API_TOKEN || 'test-api-token';
process.env.NODE_ENV = 'test';

const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

const app = require('../src/app');
const { pool, query } = require('../src/db');
const { hashPassword } = require('../src/utils/passwords');

let server;
let baseUrl;

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function createSessionToken(user, exp = Date.now() + 60 * 60 * 1000) {
  const encodedPayload = encodeJson({ exp, user });
  const signature = createHmac('sha256', process.env.HARDZONE_SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return { response, body };
}

async function cleanupUsers() {
  await query("DELETE FROM users WHERE username LIKE 'ci-auth-%'");
}

async function createUser(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const username = overrides.username || `ci-auth-${suffix}@example.test`;
  const password = overrides.password || 'Password123!';
  const passwordHash = overrides.password_hash === undefined
    ? await hashPassword(password)
    : overrides.password_hash;

  const { rows } = await query(
    `
      INSERT INTO users (
        name,
        role,
        role_title,
        username,
        email,
        password_hash,
        is_active,
        module_grants,
        module_revokes,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id, name, role, username, email, is_active, module_grants, module_revokes
    `,
    [
      overrides.name || 'CI Auth User',
      overrides.role || 'admin',
      overrides.role_title || 'CI Admin',
      username,
      overrides.email || username,
      passwordHash,
      overrides.is_active !== undefined ? overrides.is_active : true,
      overrides.module_grants || [],
      overrides.module_revokes || [],
    ]
  );

  return { ...rows[0], password };
}

before(async () => {
  await cleanupUsers();

  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await cleanupUsers();

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await pool.end();
});

test('login returns the serialized active user for valid credentials', async () => {
  const user = await createUser();

  const { response, body } = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.username, password: user.password }),
  });

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.user.username, user.username);
  assert.equal(body.data.user.password_hash, undefined);
});

test('login rejects wrong passwords and inactive users', async () => {
  const activeUser = await createUser();
  const inactiveUser = await createUser({ is_active: false });

  const wrongPassword = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: activeUser.username, password: 'wrong-password' }),
  });

  assert.equal(wrongPassword.response.status, 401);

  const inactive = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: inactiveUser.username, password: inactiveUser.password }),
  });

  assert.equal(inactive.response.status, 403);
});

test('session-protected endpoints reject missing, expired, and tampered sessions', async () => {
  const user = await createUser();
  const validPayload = {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    role: user.role,
  };

  const missing = await request('/api/auth/me');
  assert.equal(missing.response.status, 401);

  const expired = await request('/api/auth/me', {
    headers: {
      'x-hardzone-session': createSessionToken(validPayload, Date.now() - 1000),
    },
  });
  assert.equal(expired.response.status, 401);

  const token = createSessionToken(validPayload);
  const tampered = await request('/api/auth/me', {
    headers: {
      'x-hardzone-session': token.replace(/\.[^.]+$/, '.tampered'),
    },
  });
  assert.equal(tampered.response.status, 401);
});

test('valid sessions are rechecked against the database user state', async () => {
  const user = await createUser();
  const sessionUser = {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    role: user.role,
  };

  const active = await request('/api/auth/me', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(active.response.status, 200);
  assert.equal(active.body.data.user.username, user.username);

  await query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);

  const inactive = await request('/api/auth/me', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(inactive.response.status, 403);
});

test('module revokes prevent access to protected modules', async () => {
  const blockedUser = await createUser({
    module_revokes: ['warehouse', 'services', 'sales', 'schedule'],
  });

  const sessionUser = {
    id: Number(blockedUser.id),
    name: blockedUser.name,
    username: blockedUser.username,
    role: blockedUser.role,
  };

  const result = await request('/api/products', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });

  assert.equal(result.response.status, 403);
});

test('staff without users_manage cannot open system diagnostics', async () => {
  const staffUser = await createUser({
    module_revokes: ['users_manage'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const result = await request('/api/system/status', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });

  assert.equal(result.response.status, 403);
  assert.equal(result.body.success, false);
});

test('staff without schedule_cancel cannot cancel a training slot by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['schedule_cancel'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const result = await request('/api/schedule/slots/1/cancel', {
    method: 'POST',
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });

  assert.equal(result.response.status, 403);
  assert.equal(result.body.success, false);
});
