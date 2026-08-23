const assert = require('node:assert/strict');
const { test } = require('node:test');

const { createWebhooksRouter } = require('../src/routes/webhooks');

function createResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('AQSI webhook delegates payment confirmation to authoritative synchronization', async () => {
  const calls = [];
  const router = createWebhooksRouter({
    syncOrderWithAqsi: async (orderId, options) => {
      calls.push({ orderId, options });
      return { paid: false, reason: 'not_paid' };
    },
  });
  const layer = router.stack.find((item) => item.route?.path === '/aqsi');
  const handler = layer.route.stack[0].handle;
  const response = createResponse();

  await handler({ body: { orderId: 'ci-order', status: 'paid' } }, response);

  assert.deepEqual(calls, [{ orderId: 'ci-order', options: { markAttempt: true } }]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { ok: true });
});

test('AQSI webhook ignores payloads without an order id', async () => {
  let synchronized = false;
  const router = createWebhooksRouter({
    syncOrderWithAqsi: async () => {
      synchronized = true;
    },
  });
  const layer = router.stack.find((item) => item.route?.path === '/aqsi');
  const handler = layer.route.stack[0].handle;
  const response = createResponse();

  await handler({ body: { status: 'paid' } }, response);

  assert.equal(synchronized, false);
  assert.deepEqual(response.body, { ok: true });
});
