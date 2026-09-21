process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { test, beforeEach, after } = require('node:test');
const aqsi = require('../src/services/aqsi');
let operation;
let list;
let slip;
let send;
let sends;
aqsi.getOperation = (...args) => operation(...args);
aqsi.listAqsiReceipts = (...args) => list(...args);
aqsi.getAqsiSlip = (...args) => slip(...args);
aqsi.sendV4ReceiptRequest = (...args) => send(...args);
const { pool } = require('../src/db');
const { syncAqsiV4 } = require('../src/services/aqsi-v4-flow');
const { findReceiptForOrder } = require('../src/services/aqsi-receipt-recovery');

beforeEach(() => {
  sends = 0;
  operation = async () => ({ status: 'Canceled' });
  list = async () => ({ rows: [], pages: 0, count: 0 });
  slip = async () => ({ id: 'recovery-slip', content: { type: 'purchase', responseCode: '000', amount: 557000 } });
  send = async () => { sends += 1; return { operationId: 'recovery-new' }; };
});
after(async () => {
  await pool.query("DELETE FROM orders WHERE comment = 'ci-receipt-recovery'");
  await pool.end();
});
async function createOrder() {
  const { rows: [o] } = await pool.query(
    `INSERT INTO orders (status,total_amount,items_count,aqsi_slip_id,aqsi_receipt_operation_id,aqsi_receipt_status,comment)
     VALUES ('open',5570,1,'recovery-slip','recovery-old','error','ci-receipt-recovery') RETURNING *`
  );
  await pool.query("INSERT INTO order_items (order_id,kind,name,sale_price,quantity) VALUES ($1,'service','CI service',5570,1)", [o.id]);
  return o;
}
function receipt(slipId = 'recovery-slip', amount = 557000) {
  return { id: 'receipt-found', isNonFiscal: false, info: { sum: amount, docInfo: {
    docNumber: 12345, fiscalStorageNumber: 'fn', docFiscalAttributeInt: 123,
  } }, payments: [{ slip: { id: slipId } }] };
}

test('canceled receipt retries once using the paid slip; concurrent clicks preserve both operation IDs', async () => {
  const o = await createOrder();
  let release;
  const sending = new Promise((resolve) => { release = resolve; });
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  send = async (payload) => {
    sends += 1;
    assert.equal(payload.payments[0].amount, 557000);
    assert.equal(payload.payments[0].slip.id, 'recovery-slip');
    assert.equal(payload.positions[0].info.calculationSubjectId, 4);
    started();
    await sending;
    return { operationId: 'recovery-new' };
  };
  const first = syncAqsiV4(o.id);
  await ready;
  try { await assert.rejects(syncAqsiV4(o.id), /уже выполнялась/); } finally { release(); }
  assert.equal((await first).status, 'receipt_pending');
  assert.equal(sends, 1);
  const { rows: [saved] } = await pool.query('SELECT * FROM orders WHERE id=$1', [o.id]);
  assert.equal(saved.aqsi_receipt_operation_id, 'recovery-new');
  const { rows: [attempt] } = await pool.query('SELECT * FROM aqsi_receipt_recovery_attempts WHERE order_id=$1', [o.id]);
  assert.equal(attempt.previous_operation_id, 'recovery-old');
  assert.equal(attempt.operation_id, 'recovery-new');
  assert.equal(attempt.status, 'sent');
  operation = async () => ({ status: 'Completed', result: receipt() });
  assert.equal((await syncAqsiV4(o.id)).status, 'confirmed');
});

test('pending receipt is only checked and never resent', async () => {
  const o = await createOrder();
  operation = async () => ({ status: 'Pending' });
  assert.equal((await syncAqsiV4(o.id)).status, 'receipt_pending');
  assert.equal(sends, 0);
});

test('Error and Timeout do not trigger a new receipt', async () => {
  const o = await createOrder();
  for (const status of ['Error', 'Timeout']) {
    operation = async () => ({ status });
    assert.equal((await syncAqsiV4(o.id)).status, 'receipt_error');
  }
  assert.equal(sends, 0);
});

test('missing slip and declined payment cannot trigger recovery', async () => {
  const o = await createOrder();
  slip = async () => ({ id: 'recovery-slip', content: { type: 'purchase', responseCode: '051', amount: 557000 } });
  await assert.rejects(syncAqsiV4(o.id), /не подтвердил оплату/);
  await pool.query('UPDATE orders SET aqsi_slip_id=NULL WHERE id=$1', [o.id]);
  await assert.rejects(syncAqsiV4(o.id), /подтверждённая оплата/);
  assert.equal(sends, 0);
});

test('interrupted sending record survives process restart and blocks a duplicate', async () => {
  const o = await createOrder();
  await pool.query("INSERT INTO aqsi_receipt_recovery_attempts (order_id,previous_operation_id,status) VALUES ($1,'recovery-old','sending')", [o.id]);
  await assert.rejects(syncAqsiV4(o.id), /уже выполнялась/);
  assert.equal(sends, 0);
});

test('existing receipt is found on the second page by payments slip, without another send', async () => {
  const o = await createOrder();
  list = async ({ page }) => ({ rows: [receipt(page === 1 ? 'someone-else' : 'recovery-slip')], pages: 2, count: 2 });
  assert.equal((await syncAqsiV4(o.id)).status, 'confirmed');
  assert.equal(sends, 0);
  const { rows: [saved] } = await pool.query('SELECT fiscal_fd FROM orders WHERE id=$1', [o.id]);
  assert.equal(saved.fiscal_fd, '12345');
});

test('completed operation without fiscal data never adopts an unrelated first receipt', async () => {
  const o = await createOrder();
  operation = async () => ({ status: 'Completed', result: {} });
  list = async () => ({ rows: [receipt('someone-else')], pages: 1, count: 1 });
  assert.equal((await syncAqsiV4(o.id)).status, 'receipt_error');
  assert.equal(sends, 0);
});

test('unpaid or mismatched slip blocks receipt retry', async () => {
  const o = await createOrder();
  slip = async () => ({ id: 'recovery-slip', content: { type: 'purchase', responseCode: '000', amount: 11000 } });
  await assert.rejects(syncAqsiV4(o.id), /не подтвердил оплату/);
  assert.equal(sends, 0);
});

test('receipt-list error or unexpected response blocks retry', async () => {
  const o = await createOrder();
  list = async () => ({ items: [], pages: 1 });
  await assert.rejects(syncAqsiV4(o.id), /журнал чеков/);
  list = async () => { throw new Error('AQSI unavailable'); };
  await assert.rejects(syncAqsiV4(o.id), /unavailable/);
  assert.equal(sends, 0);
});

test('uncertain send is persisted and next recovery cannot send again', async () => {
  const o = await createOrder();
  send = async () => { sends += 1; throw new Error('connection reset'); };
  assert.equal((await syncAqsiV4(o.id)).status, 'receipt_error');
  await assert.rejects(syncAqsiV4(o.id), /уже выполнялась/);
  assert.equal(sends, 1);
  const { rows: [attempt] } = await pool.query('SELECT status FROM aqsi_receipt_recovery_attempts WHERE order_id=$1', [o.id]);
  assert.equal(attempt.status, 'uncertain');
  list = async () => ({ rows: [receipt()], pages: 1, count: 1 });
  assert.equal((await syncAqsiV4(o.id)).status, 'confirmed');
  assert.equal(sends, 1);
});

test('explicit busy rejection preserves history and allows a later manual retry', async () => {
  const o = await createOrder();
  send = async () => { sends += 1; throw Object.assign(new Error('{"reason":"OperationInProgress"}'), { isAqsiRejection: true }); };
  assert.match((await syncAqsiV4(o.id)).message, /Касса занята/);
  send = async () => { sends += 1; return { operationId: 'recovery-new' }; };
  assert.equal((await syncAqsiV4(o.id)).status, 'receipt_pending');
  const { rows } = await pool.query('SELECT status FROM aqsi_receipt_recovery_attempts WHERE order_id=$1 ORDER BY id', [o.id]);
  assert.deepEqual(rows.map((r) => r.status), ['rejected', 'sent']);
});

test('duplicate or wrong-amount receipts require reconciliation', async () => {
  const o = await createOrder();
  list = async () => ({ rows: [receipt(), receipt()], pages: 1, count: 2 });
  await assert.rejects(findReceiptForOrder(o), /несколько чеков/);
  list = async () => ({ rows: [receipt('recovery-slip', 1)], pages: 1, count: 1 });
  await assert.rejects(findReceiptForOrder(o), /несовпадающими реквизитами/);
});
