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

test('staff without clients cannot read clients by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['clients'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const list = await request('/api/clients', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(list.response.status, 403);

  const byBarcode = await request('/api/clients/barcode/ci-barcode', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(byBarcode.response.status, 403);

  const byId = await request('/api/clients/1', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(byId.response.status, 403);
});

test('staff without client sub-permissions cannot create, edit, or import clients by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['clients_create', 'clients_update', 'clients_import'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const create = await request('/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ first_name: 'CI', last_name: 'Client' }),
  });
  assert.equal(create.response.status, 403);

  const update = await request('/api/clients/1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ comment: 'blocked' }),
  });
  assert.equal(update.response.status, 403);

  const importClients = await request('/api/clients/import', {
    method: 'POST',
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(importClients.response.status, 403);
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

test('staff without schedule edit permissions cannot create training slots by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['schedule_edit_groups', 'schedule_edit_personal'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const groupSlot = await request('/api/schedule/slots', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ slot_type: 'group', date: '2026-06-04', start_time: '10:00' }),
  });
  assert.equal(groupSlot.response.status, 403);

  const personalSlot = await request('/api/schedule/slots', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ slot_type: 'personal', date: '2026-06-04', start_time: '10:00' }),
  });
  assert.equal(personalSlot.response.status, 403);
});

test('staff without schedule_gym cannot change open gym state by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['schedule_gym'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const updateHours = await request('/api/schedule/gym-hours', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ days: [] }),
  });
  assert.equal(updateHours.response.status, 403);

  const checkIn = await request('/api/schedule/open-gym/check-in', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ client_id: 1 }),
  });
  assert.equal(checkIn.response.status, 403);

  const deleteVisit = await request('/api/schedule/open-gym/visits/1', {
    method: 'DELETE',
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(deleteVisit.response.status, 403);
});

test('staff without sales_create cannot create or edit sales orders by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['sales_create'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const createOrder = await request('/api/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ comment: null }),
  });
  assert.equal(createOrder.response.status, 403);

  const addItem = await request('/api/orders/00000000-0000-0000-0000-000000000000/items', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ quantity: 1 }),
  });
  assert.equal(addItem.response.status, 403);

  const patchOrder = await request('/api/orders/00000000-0000-0000-0000-000000000000', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ discount_percent: 5 }),
  });
  assert.equal(patchOrder.response.status, 403);

  const patchItem = await request('/api/orders/00000000-0000-0000-0000-000000000000/items/ci-item', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ quantity: 2 }),
  });
  assert.equal(patchItem.response.status, 403);

  const deleteItem = await request('/api/orders/00000000-0000-0000-0000-000000000000/items/ci-item', {
    method: 'DELETE',
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(deleteItem.response.status, 403);

  const legacyCreate = await request('/api/sales', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ product_id: 1, quantity: 1, payment_type: 'cash' }),
  });
  assert.equal(legacyCreate.response.status, 403);
});

test('staff without sales_pay cannot confirm or initiate payments by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['sales_pay'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const confirm = await request('/api/orders/00000000-0000-0000-0000-000000000000/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ payment_type: 'cash' }),
  });
  assert.equal(confirm.response.status, 403);

  const initiate = await request('/api/orders/00000000-0000-0000-0000-000000000000/initiate-payment', {
    method: 'POST',
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(initiate.response.status, 403);

  const sendToAqsi = await request('/api/orders/00000000-0000-0000-0000-000000000000/send-to-aqsi', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ client_id: null }),
  });
  assert.equal(sendToAqsi.response.status, 403);

  const syncSlip = await request('/api/orders/00000000-0000-0000-0000-000000000000/sync-slip', {
    method: 'POST',
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(syncSlip.response.status, 403);

  const legacyConfirm = await request('/api/sales/1/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ aqsi_receipt_id: 'ci' }),
  });
  assert.equal(legacyConfirm.response.status, 403);
});

test('staff without sales_refund cannot refund orders by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['sales_refund'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const result = await request('/api/orders/00000000-0000-0000-0000-000000000000/refund', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({}),
  });

  assert.equal(result.response.status, 403);
});

test('staff without sales_aqsi_recovery cannot use recovery endpoints by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['sales_aqsi_recovery'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const sync = await request('/api/orders/00000000-0000-0000-0000-000000000000/sync-aqsi-v4', {
    method: 'POST',
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(sync.response.status, 403);

  const recover = await request('/api/orders/recover-terminal-blocker', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ operation_id: 'ci-operation' }),
  });
  assert.equal(recover.response.status, 403);

  const syncLegacy = await request('/api/orders/00000000-0000-0000-0000-000000000000/sync-aqsi', {
    method: 'POST',
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(syncLegacy.response.status, 403);

  const forceClear = await request('/api/orders/force-clear-blocker', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hardzone-session': createSessionToken(sessionUser) },
    body: JSON.stringify({ operation_id: 'ci-operation' }),
  });
  assert.equal(forceClear.response.status, 403);
});

test('staff without sales_cancel cannot cancel legacy sales by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['sales_cancel'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const result = await request('/api/sales/1/cancel', {
    method: 'POST',
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });

  assert.equal(result.response.status, 403);
});
