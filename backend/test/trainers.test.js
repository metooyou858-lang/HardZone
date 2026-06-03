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

async function cleanup() {
  await query("DELETE FROM trainers WHERE email LIKE 'ci-trainer-%'");
  await query("DELETE FROM users WHERE username LIKE 'ci-trainer-%'");
}

async function createUser(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const username = overrides.username || `ci-trainer-${suffix}@example.test`;
  const passwordHash = await hashPassword(overrides.password || 'Password123!');

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
      RETURNING id, name, role, username, email
    `,
    [
      overrides.name || 'CI Trainer Staff',
      overrides.role || 'admin',
      overrides.role_title || 'CI Staff',
      username,
      overrides.email || username,
      passwordHash,
      overrides.is_active !== undefined ? overrides.is_active : true,
      overrides.module_grants || [],
      overrides.module_revokes || [],
    ]
  );

  return rows[0];
}

function sessionHeaders(user) {
  return {
    'content-type': 'application/json',
    'x-hardzone-session': createSessionToken({
      id: Number(user.id),
      name: user.name,
      username: user.username,
      role: user.role,
    }),
  };
}

before(async () => {
  await cleanup();

  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await cleanup();

  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await pool.end();
});

test('trainer cards can be linked to and unlinked from staff users without changing access modules', async () => {
  const manager = await createUser({ name: 'CI Services Manager' });
  const staff = await createUser({ name: 'CI Linked Trainer' });

  const created = await request('/api/trainers', {
    method: 'POST',
    headers: sessionHeaders(manager),
    body: JSON.stringify({
      first_name: 'Linked',
      last_name: 'Trainer',
      email: `ci-trainer-${staff.id}@example.test`,
      user_id: Number(staff.id),
    }),
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.user_id, String(staff.id));

  const listed = await request('/api/trainers', {
    headers: sessionHeaders(manager),
  });

  assert.equal(listed.response.status, 200);
  const trainer = listed.body.data.find((item) => item.id === created.body.data.id);
  assert.equal(trainer.linked_user.id, Number(staff.id));
  assert.equal(trainer.linked_user.name, 'CI Linked Trainer');

  const staffUsers = await request('/api/trainers/staff-users', {
    headers: sessionHeaders(manager),
  });
  assert.equal(staffUsers.response.status, 200);
  assert.equal(
    staffUsers.body.data.find((item) => item.id === String(staff.id)).trainer_id,
    created.body.data.id
  );

  const unlinked = await request(`/api/trainers/${created.body.data.id}`, {
    method: 'PATCH',
    headers: sessionHeaders(manager),
    body: JSON.stringify({ user_id: null }),
  });

  assert.equal(unlinked.response.status, 200);
  assert.equal(unlinked.body.data.user_id, null);
});

test('one staff user cannot be linked to two active trainer cards', async () => {
  const manager = await createUser({ name: 'CI Duplicate Manager' });
  const staff = await createUser({ name: 'CI Duplicate Trainer' });

  const first = await request('/api/trainers', {
    method: 'POST',
    headers: sessionHeaders(manager),
    body: JSON.stringify({
      first_name: 'First',
      last_name: 'Trainer',
      email: `ci-trainer-first-${staff.id}@example.test`,
      user_id: Number(staff.id),
    }),
  });
  assert.equal(first.response.status, 201);

  const second = await request('/api/trainers', {
    method: 'POST',
    headers: sessionHeaders(manager),
    body: JSON.stringify({
      first_name: 'Second',
      last_name: 'Trainer',
      email: `ci-trainer-second-${staff.id}@example.test`,
      user_id: Number(staff.id),
    }),
  });

  assert.equal(second.response.status, 409);
});

test('staff without services cannot link trainer cards by direct request', async () => {
  const staffWithoutServices = await createUser({
    name: 'CI Schedule Only',
    module_revokes: ['services'],
  });
  const linkedUser = await createUser({ name: 'CI Forbidden Link Target' });

  const result = await request('/api/trainers/1', {
    method: 'PATCH',
    headers: sessionHeaders(staffWithoutServices),
    body: JSON.stringify({ user_id: Number(linkedUser.id) }),
  });

  assert.equal(result.response.status, 403);
  assert.equal(result.body.success, false);
});
