process.env.HARDZONE_SESSION_SECRET = process.env.HARDZONE_SESSION_SECRET || 'test-session-secret';
process.env.BACKEND_API_TOKEN = process.env.BACKEND_API_TOKEN || 'test-api-token';
process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  buildUserAccessPayload,
  getDefaultRoleTitle,
  hasModuleAccess,
} = require('../src/authz');
const authMiddleware = require('../src/middleware/auth');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function runRequireModule(user, ...permissions) {
  const req = { user };
  const res = createResponse();
  let nextCalled = false;

  authMiddleware.requireModule(...permissions)(req, res, () => {
    nextCalled = true;
  });

  return { res, nextCalled };
}

test('default role titles match the CRM access model', () => {
  assert.equal(getDefaultRoleTitle('owner'), 'Главный администратор');
  assert.equal(getDefaultRoleTitle('admin'), 'Администратор');
});

test('duty trainer module set revokes system and schedule cancellation permissions', () => {
  const dutyTrainerModules = ['sales', 'clients', 'schedule', 'schedule_clients', 'schedule_attendance'];
  const access = buildUserAccessPayload('admin', dutyTrainerModules);

  assert.deepEqual(access.modules, dutyTrainerModules);
  assert.equal(access.module_grants.length, 0);
  assert.equal(access.module_revokes.includes('users_manage'), true);
  assert.equal(access.module_revokes.includes('schedule_cancel'), true);
  assert.equal(access.module_revokes.includes('schedule_edit_groups'), true);
  assert.equal(access.module_revokes.includes('schedule_edit_personal'), true);
  assert.equal(access.module_revokes.includes('schedule_gym'), true);
});

test('staff without users_manage cannot pass system diagnostics guard', () => {
  const user = {
    role: 'admin',
    modules: ['sales', 'clients', 'schedule', 'schedule_clients', 'schedule_attendance'],
  };

  assert.equal(hasModuleAccess(user, 'users_manage'), false);

  const { res, nextCalled } = runRequireModule(user, 'users_manage');

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
});

test('staff without schedule_cancel cannot pass direct training cancellation guard', () => {
  const user = {
    role: 'admin',
    modules: ['sales', 'clients', 'schedule', 'schedule_clients', 'schedule_attendance'],
  };

  const { res, nextCalled } = runRequireModule(user, 'schedule_cancel');

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
});

test('staff with schedule_cancel can pass direct training cancellation guard', () => {
  const user = {
    role: 'admin',
    modules: ['schedule', 'schedule_cancel'],
  };

  const { res, nextCalled } = runRequireModule(user, 'schedule_cancel');

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});
