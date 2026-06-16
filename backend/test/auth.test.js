process.env.HARDZONE_SESSION_SECRET = process.env.HARDZONE_SESSION_SECRET || 'test-session-secret';
process.env.BACKEND_API_TOKEN = process.env.BACKEND_API_TOKEN || 'test-api-token';
process.env.TELEGRAM_ENABLED = 'true';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test-telegram-secret';
process.env.TELEGRAM_BOT_TOKEN = '';
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

function createTelegramInitData(user, token = 'test-telegram-bot-token', authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: 'ci-query',
    user: JSON.stringify(user),
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return { response, body };
}

async function waitFor(predicate, { attempts = 20, delayMs = 25 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await predicate();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return null;
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
      telegram_id,
      phone,
      phone_normalized,
      module_grants,
      module_revokes,
      updated_at
    )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
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
      overrides.telegram_id || null,
      overrides.phone || null,
      overrides.phone_normalized || null,
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

test('staff without clients cannot use staff client search by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['clients'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const result = await request('/api/staff/client-search?q=ci', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });

  assert.equal(result.response.status, 403);
});

test('telegram webhook validates secret and accepts linked staff updates', async () => {
  const staffUser = await createUser({
    telegram_id: '123456789',
  });

  const wrongSecret = await request('/api/telegram/webhook/wrong-secret', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: { chat: { id: 1 }, from: { id: 123456789 }, text: '/start' } }),
  });

  assert.equal(wrongSecret.response.status, 404);

  const start = await request('/api/telegram/webhook/test-telegram-secret', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 1 },
        from: { id: 123456789 },
        text: '/start',
      },
    }),
  });

  assert.equal(start.response.status, 200);
  assert.equal(start.body.success, true);

  const { rows } = await query('SELECT id FROM users WHERE telegram_id = $1', ['123456789']);
  assert.equal(Number(rows[0].id), Number(staffUser.id));
});

test('telegram webhook links staff by own shared phone contact', async () => {
  const staffUser = await createUser({
    phone: '+7 (999) 111-22-33',
    phone_normalized: '79991112233',
  });

  const result = await request('/api/telegram/webhook/test-telegram-secret', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 2 },
        from: { id: 987654321 },
        contact: {
          user_id: 987654321,
          phone_number: '8 (999) 111-22-33',
        },
      },
    }),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.success, true);

  const linkedTelegramId = await waitFor(async () => {
    const { rows } = await query('SELECT telegram_id FROM users WHERE id = $1', [staffUser.id]);
    return rows[0].telegram_id;
  });

  assert.equal(linkedTelegramId, '987654321');
});

test('telegram webhook does not link staff by forwarded contact', async () => {
  const staffUser = await createUser({
    phone: '+7 (999) 444-55-66',
    phone_normalized: '79994445566',
  });

  const result = await request('/api/telegram/webhook/test-telegram-secret', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 3 },
        from: { id: 111111111 },
        contact: {
          user_id: 222222222,
          phone_number: '+7 999 444-55-66',
        },
      },
    }),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.success, true);

  const { rows } = await query('SELECT telegram_id FROM users WHERE id = $1', [staffUser.id]);
  assert.equal(rows[0].telegram_id, null);
});

test('telegram mini app login accepts signed init data for linked active staff', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-bot-token';

  try {
    const staffUser = await createUser({
      telegram_id: '555777999',
    });

    const valid = await request('/api/telegram/miniapp-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        init_data: createTelegramInitData({ id: 555777999, first_name: 'CI' }),
      }),
    });

    assert.equal(valid.response.status, 200);
    assert.equal(valid.body.success, true);
    assert.equal(valid.body.data.user.id, Number(staffUser.id));
    assert.equal(valid.body.data.user.username, staffUser.username);

    const tampered = await request('/api/telegram/miniapp-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        init_data: createTelegramInitData({ id: 555777999, first_name: 'CI' }).replace('CI', 'Bad'),
      }),
    });

    assert.equal(tampered.response.status, 401);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = previousToken;
  }
});

test('telegram mini app phone link signs in active staff by phone', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-bot-token';

  try {
    const staffUser = await createUser({
      phone: '+7 (999) 222-33-44',
      phone_normalized: '79992223344',
    });

    const result = await request('/api/telegram/miniapp-link-phone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        init_data: createTelegramInitData({ id: 444555666, first_name: 'CI' }),
        phone: '8 (999) 222-33-44',
      }),
    });

    assert.equal(result.response.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.user.id, Number(staffUser.id));
    assert.equal(result.body.data.user.username, staffUser.username);

    const { rows } = await query('SELECT telegram_id FROM users WHERE id = $1', [staffUser.id]);
    assert.equal(rows[0].telegram_id, '444555666');
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = previousToken;
  }
});

test('telegram mini app phone link rejects unknown and duplicate phones', async () => {
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = 'test-telegram-bot-token';

  try {
    const unknown = await request('/api/telegram/miniapp-link-phone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        init_data: createTelegramInitData({ id: 777888999, first_name: 'CI' }),
        phone: '+7 999 333-44-55',
      }),
    });

    assert.equal(unknown.response.status, 404);

    await createUser({
      phone: '+7 (999) 666-77-88',
      phone_normalized: '79996667788',
    });
    await createUser({
      phone: '+7 (999) 666-77-88',
      phone_normalized: '79996667788',
    });

    const duplicate = await request('/api/telegram/miniapp-link-phone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        init_data: createTelegramInitData({ id: 777888999, first_name: 'CI' }),
        phone: '+7 999 666-77-88',
      }),
    });

    assert.equal(duplicate.response.status, 409);
  } finally {
    process.env.TELEGRAM_BOT_TOKEN = previousToken;
  }
});

test('staff read API returns telegram-ready payloads for authorized staff', async () => {
  const staffUser = await createUser();

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const headers = { 'x-hardzone-session': createSessionToken(sessionUser) };

  const me = await request('/api/staff/me', { headers });
  assert.equal(me.response.status, 200);
  assert.equal(me.body.success, true);
  assert.equal(me.body.data.user.id, Number(staffUser.id));

  const today = await request('/api/staff/schedule/today?date=2026-06-04', { headers });
  assert.equal(today.response.status, 200);
  assert.equal(today.body.success, true);
  assert.equal(today.body.data.date, '2026-06-04');
  assert.equal(Array.isArray(today.body.data.slots), true);

  const clientSearch = await request('/api/staff/client-search?q=zz', { headers });
  assert.equal(clientSearch.response.status, 200);
  assert.equal(clientSearch.body.success, true);
  assert.equal(Array.isArray(clientSearch.body.data), true);

  const bookings = await request('/api/staff/bookings?slot_id=1', { headers });
  assert.equal(bookings.response.status, 404);
  assert.equal(bookings.body.success, false);
});

test('staff booking API creates bookings and toggles attendance for authorized staff', async () => {
  const staffUser = await createUser();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const { rows: clientRows } = await query(
    `
      INSERT INTO clients (first_name, last_name, barcode)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    ['CI', 'Telegram Client', `ci-tg-${suffix}`]
  );

  const { rows: subscriptionRows } = await query(
    `
      INSERT INTO client_subscriptions (client_id, type, visits_total, visits_left, started_at, expires_at)
      VALUES ($1, 'visits', 2, 2, '2026-06-01', '2026-12-31')
      RETURNING id
    `,
    [clientRows[0].id]
  );

  const { rows: slotRows } = await query(
    `
      INSERT INTO schedule_slots (date, start_time, capacity)
      VALUES ('2026-06-04', '10:00', 2)
      RETURNING id
    `
  );

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };
  const headers = {
    'content-type': 'application/json',
    'x-hardzone-session': createSessionToken(sessionUser),
  };

  const create = await request('/api/staff/bookings', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      slot_id: slotRows[0].id,
      client_id: clientRows[0].id,
      subscription_id: subscriptionRows[0].id,
    }),
  });

  assert.equal(create.response.status, 201);
  assert.equal(create.body.success, true);
  assert.equal(create.body.data.bookings.length, 1);
  assert.equal(create.body.data.bookings[0].status, 'confirmed');

  const bookingId = create.body.data.booking.id;
  const attend = await request(`/api/staff/bookings/${bookingId}/attend`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  assert.equal(attend.response.status, 200);
  assert.equal(attend.body.success, true);
  assert.equal(attend.body.data.bookings[0].status, 'attended');
  assert.equal(attend.body.data.bookings[0].coverage_status, 'covered');

  const afterAttend = await query('SELECT visits_left FROM client_subscriptions WHERE id = $1', [subscriptionRows[0].id]);
  assert.equal(afterAttend.rows[0].visits_left, 1);

  const unattend = await request(`/api/staff/bookings/${bookingId}/unattend`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });

  assert.equal(unattend.response.status, 200);
  assert.equal(unattend.body.success, true);
  assert.equal(unattend.body.data.bookings.length, 1);
  assert.equal(unattend.body.data.bookings[0].status, 'confirmed');
  assert.equal(unattend.body.data.bookings[0].coverage_status, 'pending');

  const afterUnattend = await query('SELECT visits_left FROM client_subscriptions WHERE id = $1', [subscriptionRows[0].id]);
  assert.equal(afterUnattend.rows[0].visits_left, 2);
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

test('staff without schedule cannot use staff schedule endpoints by direct request', async () => {
  const staffUser = await createUser({
    module_revokes: ['schedule'],
  });

  const sessionUser = {
    id: Number(staffUser.id),
    name: staffUser.name,
    username: staffUser.username,
    role: staffUser.role,
  };

  const today = await request('/api/staff/schedule/today', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(today.response.status, 403);

  const bookings = await request('/api/staff/bookings?slot_id=1', {
    headers: { 'x-hardzone-session': createSessionToken(sessionUser) },
  });
  assert.equal(bookings.response.status, 403);
});

test('staff without staff booking permissions cannot mutate staff bookings by direct request', async () => {
  const withoutClients = await createUser({
    module_revokes: ['schedule_clients'],
  });
  const withoutAttendance = await createUser({
    module_revokes: ['schedule_attendance'],
  });

  const createSession = (user) => createSessionToken({
    id: Number(user.id),
    name: user.name,
    username: user.username,
    role: user.role,
  });

  const create = await request('/api/staff/bookings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hardzone-session': createSession(withoutClients),
    },
    body: JSON.stringify({ slot_id: 1, client_id: 1 }),
  });
  assert.equal(create.response.status, 403);

  const attend = await request('/api/staff/bookings/1/attend', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hardzone-session': createSession(withoutAttendance),
    },
    body: JSON.stringify({}),
  });
  assert.equal(attend.response.status, 403);

  const unattend = await request('/api/staff/bookings/1/unattend', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hardzone-session': createSession(withoutAttendance),
    },
    body: JSON.stringify({}),
  });
  assert.equal(unattend.response.status, 403);
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
