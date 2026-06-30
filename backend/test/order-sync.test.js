process.env.HARDZONE_SESSION_SECRET = process.env.HARDZONE_SESSION_SECRET || 'test-session-secret';
process.env.BACKEND_API_TOKEN = process.env.BACKEND_API_TOKEN || 'test-api-token';
process.env.NODE_ENV = 'test';

const { createHmac } = require('node:crypto');
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

const aqsi = require('../src/services/aqsi');

let mockGetAqsiOrder = null;
let mockSendOrderToAqsiV4 = null;
let mockPollOperation = null;

aqsi.getAqsiOrder = (...args) => mockGetAqsiOrder(...args);
aqsi.sendOrderToAqsiV4 = (...args) => mockSendOrderToAqsiV4(...args);
aqsi.pollOperation = (...args) => mockPollOperation(...args);

const app = require('../src/app');
const { pool, query } = require('../src/db');
const { syncOrderWithAqsi, runV4SlipSyncPass } = require('../src/services/order-sync');
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
  await query("DELETE FROM orders WHERE comment LIKE 'ci-aqsi-%'");
  await query("DELETE FROM users WHERE username LIKE 'ci-aqsi-%'");
}

async function createUser() {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const username = `ci-aqsi-${suffix}@example.test`;
  const password = 'Password123!';
  const passwordHash = await hashPassword(password);

  const { rows } = await query(
    `INSERT INTO users (name, role, role_title, username, email, password_hash, is_active, updated_at)
     VALUES ($1, 'admin', 'CI Admin', $2, $2, $3, true, NOW())
     RETURNING id, name, role, username`,
    ['CI AQSI User', username, passwordHash]
  );

  return rows[0];
}

async function createOpenOrder(overrides = {}) {
  const { rows } = await query(
    `INSERT INTO orders (
       status,
       payment_type,
       total_amount,
       items_count,
       aqsi_sent_at,
       aqsi_receipt_id,
       aqsi_receipt_operation_id,
       aqsi_receipt_status,
       aqsi_error,
       comment
     )
     VALUES (
       'open',
       $1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9
     )
     RETURNING *`,
    [
      overrides.payment_type ?? null,
      overrides.total_amount ?? 110,
      overrides.items_count ?? 0,
      overrides.aqsi_sent_at ?? null,
      overrides.aqsi_receipt_id ?? null,
      overrides.aqsi_receipt_operation_id ?? null,
      overrides.aqsi_receipt_status ?? null,
      overrides.aqsi_error ?? null,
      overrides.comment ?? `ci-aqsi-${Date.now()}`,
    ]
  );

  return rows[0];
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

test('cash AQSI sync unlocks an uncertain send when AQSI has no order trace', async () => {
  mockGetAqsiOrder = async () => {
    throw new Error('Order not found');
  };

  const order = await createOpenOrder({
    payment_type: 'cash',
    aqsi_sent_at: new Date(),
    aqsi_receipt_status: 'error',
    aqsi_error: 'network timeout',
  });

  const result = await syncOrderWithAqsi(order.id, { markAttempt: true });
  assert.equal(result.reason, 'aqsi_not_found_unlocked');

  const { rows } = await query(
    'SELECT aqsi_sent_at, aqsi_sync_attempted_at, aqsi_receipt_status, aqsi_error FROM orders WHERE id = $1',
    [order.id]
  );

  assert.equal(rows[0].aqsi_sent_at, null);
  assert.equal(rows[0].aqsi_sync_attempted_at, null);
  assert.equal(rows[0].aqsi_receipt_status, null);
  assert.match(rows[0].aqsi_error, /разблокирован/);
});

test('v4 background sync ignores pending receipt status without operation traces', async () => {
  await createOpenOrder({
    aqsi_receipt_status: 'pending',
  });

  const processed = await runV4SlipSyncPass(10);
  assert.equal(processed, 0);
});

test('cash send-to-aqsi stores AQSI receipt id from completed v4 receipt operation', async () => {
  const user = await createUser();
  const sessionUser = {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    role: user.role,
  };

  const order = await createOpenOrder({
    total_amount: 110,
    items_count: 1,
  });

  await query(
    `INSERT INTO order_items (order_id, kind, name, sale_price, quantity)
     VALUES ($1, 'product', 'CI Product', 110, 1)`,
    [order.id]
  );

  mockSendOrderToAqsiV4 = async () => ({ operationId: 'ci-cash-op' });
  mockPollOperation = async () => ({
    status: 'Completed',
    result: JSON.stringify({
      id: 'ci-cash-receipt',
      info: {
        dateTime: '2026-06-17T12:00:00.000+10:00',
        docInfo: {
          docNumber: 12345,
          fiscalStorageNumber: 'fn-ci',
          docFiscalAttributeInt: 67890,
          deviceRegNumber: 'kkt-ci',
        },
        hasMarkingCodeErrors: false,
      },
    }),
  });

  const result = await request(`/api/orders/${order.id}/send-to-aqsi`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hardzone-session': createSessionToken(sessionUser),
    },
    body: JSON.stringify({ payment_type: 'cash' }),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.success, true);

  const { rows } = await query(
    'SELECT status, payment_type, aqsi_receipt_id, aqsi_receipt_status, fiscal_fd, fiscal_fn, fiscal_fp FROM orders WHERE id = $1',
    [order.id]
  );

  assert.equal(rows[0].status, 'confirmed');
  assert.equal(rows[0].payment_type, 'cash');
  assert.equal(rows[0].aqsi_receipt_id, 'ci-cash-receipt');
  assert.equal(rows[0].aqsi_receipt_status, 'completed');
  assert.equal(rows[0].fiscal_fd, '12345');
  assert.equal(rows[0].fiscal_fn, 'fn-ci');
  assert.equal(rows[0].fiscal_fp, '67890');
});

test('cash AQSI rejection stays visible in paid history and can be retried', async () => {
  const user = await createUser();
  const sessionUser = {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    role: user.role,
  };

  const order = await createOpenOrder({
    total_amount: 120,
    items_count: 1,
  });

  await query(
    `INSERT INTO order_items (order_id, kind, name, sale_price, quantity)
     VALUES ($1, 'product', 'CI Product Rejection', 120, 1)`,
    [order.id]
  );

  const rejection = new Error('{"error":"Смена не открыта"}');
  rejection.isAqsiRejection = true;
  mockSendOrderToAqsiV4 = async () => {
    throw rejection;
  };

  const failed = await request(`/api/orders/${order.id}/send-to-aqsi`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hardzone-session': createSessionToken(sessionUser),
    },
    body: JSON.stringify({ payment_type: 'cash' }),
  });

  assert.equal(failed.response.status, 500);

  const { rows: failedRows } = await query(
    'SELECT aqsi_sent_at, aqsi_receipt_status, aqsi_error FROM orders WHERE id = $1',
    [order.id]
  );

  assert.equal(failedRows[0].aqsi_sent_at, null);
  assert.equal(failedRows[0].aqsi_receipt_status, 'error');
  assert.match(failedRows[0].aqsi_error, /Смена не открыта/);

  const history = await request('/api/orders?paid=true&limit=50', {
    headers: {
      'x-hardzone-session': createSessionToken(sessionUser),
    },
  });

  assert.equal(history.response.status, 200);
  assert.equal(history.body.success, true);
  assert.ok(history.body.data.some((item) => item.id === order.id));

  mockSendOrderToAqsiV4 = async () => ({ operationId: 'ci-cash-retry-op' });
  mockPollOperation = async () => ({
    status: 'Completed',
    result: JSON.stringify({
      id: 'ci-cash-retry-receipt',
      info: {
        dateTime: '2026-06-17T12:05:00.000+10:00',
        docInfo: {
          docNumber: 12346,
          fiscalStorageNumber: 'fn-ci-retry',
          docFiscalAttributeInt: 67891,
          deviceRegNumber: 'kkt-ci',
        },
        hasMarkingCodeErrors: false,
      },
    }),
  });

  const retried = await request(`/api/orders/${order.id}/send-to-aqsi`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hardzone-session': createSessionToken(sessionUser),
    },
    body: JSON.stringify({ payment_type: 'cash' }),
  });

  assert.equal(retried.response.status, 200);
  assert.equal(retried.body.success, true);

  const { rows: retriedRows } = await query(
    'SELECT status, payment_type, aqsi_receipt_id, aqsi_receipt_status, aqsi_error FROM orders WHERE id = $1',
    [order.id]
  );

  assert.equal(retriedRows[0].status, 'confirmed');
  assert.equal(retriedRows[0].payment_type, 'cash');
  assert.equal(retriedRows[0].aqsi_receipt_id, 'ci-cash-retry-receipt');
  assert.equal(retriedRows[0].aqsi_receipt_status, 'completed');
  assert.equal(retriedRows[0].aqsi_error, null);
});
