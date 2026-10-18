process.env.NODE_ENV = 'test';
const assert = require('node:assert/strict');
const { test, beforeEach, afterEach, after } = require('node:test');
const aqsi = require('../src/services/aqsi');
let operation;
let list;
let slip;
let send;
let sends;
let fixtureSequence;
let activeSlipId;
let activeReceiptOperationId;
aqsi.getOperation = (...args) => operation(...args);
aqsi.listAqsiReceipts = (...args) => list(...args);
aqsi.getAqsiSlip = (...args) => slip(...args);
aqsi.sendV4ReceiptRequest = (...args) => send(...args);
const { pool } = require('../src/db');
const { syncAqsiV4 } = require('../src/services/aqsi-v4-flow');
const { findReceiptForOrder } = require('../src/services/aqsi-receipt-recovery');
const { runV4SlipSyncPass } = require('../src/services/order-sync');

beforeEach(() => {
  sends = 0;
  fixtureSequence = 0;
  activeSlipId = null;
  activeReceiptOperationId = null;
  operation = async () => ({ status: 'Canceled' });
  list = async () => ({ rows: [], pages: 0, count: 0 });
  slip = async () => ({ id: activeSlipId, content: { type: 'purchase', responseCode: '000', amount: 557000 } });
  send = async () => { sends += 1; return { operationId: `recovery-new-${fixtureSequence}` }; };
});
afterEach(async () => {
  await pool.query("DELETE FROM orders WHERE comment = 'ci-receipt-recovery'");
});
after(async () => {
  await pool.end();
});
async function createOrder() {
  fixtureSequence += 1;
  activeSlipId = `recovery-slip-${fixtureSequence}`;
  activeReceiptOperationId = `recovery-old-${fixtureSequence}`;
  const { rows: [o] } = await pool.query(
    `INSERT INTO orders (status,total_amount,items_count,aqsi_slip_id,aqsi_receipt_operation_id,aqsi_receipt_status,comment)
     VALUES ('open',5570,1,$1,$2,'error','ci-receipt-recovery') RETURNING *`,
    [activeSlipId, activeReceiptOperationId]
  );
  await pool.query("INSERT INTO order_items (order_id,kind,name,sale_price,quantity) VALUES ($1,'service','CI service',5570,1)", [o.id]);
  return o;
}
function receipt(slipId = activeSlipId, amount = 557000) {
  return { id: `receipt-found-${fixtureSequence}`, isNonFiscal: false, info: { sum: amount, docInfo: {
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
    assert.equal(payload.payments[0].slip.id, o.aqsi_slip_id);
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
  assert.equal(attempt.previous_operation_id, o.aqsi_receipt_operation_id);
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

test('Error and Timeout retry fiscalization using the existing paid slip', async () => {
  for (const status of ['Error', 'Timeout']) {
    const o = await createOrder();
    operation = async () => ({ status });
    assert.equal((await syncAqsiV4(o.id)).status, 'receipt_pending');
  }
  assert.equal(sends, 2);
});

test('every documented status recovers a fiscal result without resending', async () => {
  for (const status of ['Pending', 'Processing', 'Finishing', 'Completed', 'Canceled', 'Timeout', 'Error']) {
    const o = await createOrder();
    operation = async () => ({ status, result: receipt() });
    assert.equal((await syncAqsiV4(o.id)).status, 'confirmed');
  }
  assert.equal(sends, 0);
});

test('every documented status can recover an existing receipt from the journal', async () => {
  for (const status of ['Pending', 'Processing', 'Finishing', 'Completed', 'Canceled', 'Timeout', 'Error']) {
    const o = await createOrder();
    operation = async () => ({ status });
    list = async () => ({ rows: [receipt()], pages: 1, count: 1 });
    assert.equal((await syncAqsiV4(o.id)).status, 'confirmed');
  }
  assert.equal(sends, 0);
});

test('active operations and unknown statuses do not create duplicate receipts', async () => {
  for (const status of ['Pending', 'Processing', 'Finishing', 'Unknown']) {
    const o = await createOrder();
    operation = async () => ({ status });
    assert.equal((await syncAqsiV4(o.id)).status, status === 'Unknown' ? 'receipt_error' : 'receipt_pending');
  }
  assert.equal(sends, 0);
});

test('paid slip confirms the sale even when fiscalization remains in error', async () => {
  const o = await createOrder();
  operation = async () => ({ status: 'Unknown', message: 'Fiscal storage unavailable' });
  const result = await syncAqsiV4(o.id);
  assert.equal(result.status, 'receipt_error');
  const { rows: [saved] } = await pool.query(
    'SELECT status, payment_type, aqsi_receipt_status FROM orders WHERE id=$1',
    [o.id]
  );
  assert.equal(saved.status, 'confirmed');
  assert.equal(saved.payment_type, 'card');
  assert.equal(saved.aqsi_receipt_status, 'error');
});

test('background V4 pass confirms paid money without retrying an errored receipt', async () => {
  const o = await createOrder();
  const processed = await runV4SlipSyncPass(10);
  assert.equal(processed, 1);
  assert.equal(sends, 0);
  const { rows: [saved] } = await pool.query('SELECT status, aqsi_receipt_status FROM orders WHERE id=$1', [o.id]);
  assert.equal(saved.status, 'confirmed');
  assert.equal(saved.aqsi_receipt_status, 'error');
});

test('incomplete fiscal data in a failed operation prevents duplicate issuance', async () => {
  const o = await createOrder();
  operation = async () => ({ status: 'Error', result: { info: { docInfo: { docNumber: 123 } } } });
  await assert.rejects(syncAqsiV4(o.id), /фискальные данные/);
  assert.equal(sends, 0);
});

test('missing slip and declined payment cannot trigger recovery', async () => {
  const o = await createOrder();
  slip = async () => ({ id: activeSlipId, content: { type: 'purchase', responseCode: '051', amount: 557000 } });
  await assert.rejects(syncAqsiV4(o.id), /не подтвердил оплату/);
  await pool.query('UPDATE orders SET aqsi_slip_id=NULL WHERE id=$1', [o.id]);
  await assert.rejects(syncAqsiV4(o.id), /подтверждённая оплата/);
  assert.equal(sends, 0);
});

test('interrupted sending record survives process restart and blocks a duplicate', async () => {
  const o = await createOrder();
  await pool.query("INSERT INTO aqsi_receipt_recovery_attempts (order_id,previous_operation_id,status) VALUES ($1,$2,'sending')", [o.id, o.aqsi_receipt_operation_id]);
  await assert.rejects(syncAqsiV4(o.id), /уже выполнялась/);
  assert.equal(sends, 0);
});

test('existing receipt is found on the second page by payments slip, without another send', async () => {
  const o = await createOrder();
  list = async ({ page }) => ({ rows: [receipt(page === 1 ? 'someone-else' : activeSlipId)], pages: 2, count: 2 });
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
  slip = async () => ({ id: activeSlipId, content: { type: 'purchase', responseCode: '000', amount: 11000 } });
  await assert.rejects(syncAqsiV4(o.id), /не совпадает|не подтвердил оплату/);
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
  list = async () => ({ rows: [receipt(activeSlipId, 1)], pages: 1, count: 1 });
  await assert.rejects(findReceiptForOrder(o), /несовпадающими реквизитами/);
});
