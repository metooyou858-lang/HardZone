const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  buildCompetitionInitPayload,
  buildTbankToken,
  normalizeCompetitionPaymentStatus,
  verifyTbankToken,
} = require('../src/services/tbank-competition');

test('competition payment payload carries order, callback and fiscal receipt', () => {
  const payload = buildCompetitionInitPayload({
    registration: {
      id: '42',
      team_name: 'Стальные нервы',
      public_token: 'public-token',
      male_phone: '+7 (999) 111-22-33',
    },
    orderId: 'HZC-42-1',
    amountKopecks: 350000,
  }, {
    terminalKey: 'terminal',
    publicBaseUrl: 'https://hardzone.space',
    taxation: 'usn_income',
    tax: 'none',
  });

  assert.equal(payload.Amount, 350000);
  assert.equal(payload.OrderId, 'HZC-42-1');
  assert.equal(payload.PayType, 'O');
  assert.equal(payload.NotificationURL, 'https://hardzone.space/api/public/competition/payments/tbank/notification');
  assert.equal(payload.SuccessURL, 'https://hardzone.space/competition/payment?registration=public-token');
  assert.equal(payload.Receipt.Phone, '+79991112233');
  assert.equal(payload.Receipt.Taxation, 'usn_income');
  assert.equal(payload.Receipt.Items[0].Amount, 350000);
  assert.equal(payload.Receipt.Items[0].PaymentObject, 'service');
  assert.equal(payload.Receipt.Items[0].Tax, 'none');
});

test('T-Bank token matches the provider notification example', () => {
  const payload = {
    TerminalKey: '1234567890DEMO',
    OrderId: '000000',
    Success: true,
    Status: 'AUTHORIZED',
    PaymentId: '0000000',
    ErrorCode: '0',
    Amount: '1111',
    CardId: '000000',
    Pan: '200000******0000',
    ExpDate: '1111',
    RebillId: '000000',
  };

  const token = buildTbankToken(payload, '11111111111');
  assert.equal(token, '1c0964277d0213349243065a0d5b838b8e90d2d25f740d0f2767836e710e80c8');
  assert.equal(verifyTbankToken({ ...payload, Token: token }, '11111111111'), true);
  assert.equal(verifyTbankToken({ ...payload, Token: `${token.slice(0, -1)}0` }, '11111111111'), false);
});

test('T-Bank token excludes nested receipt and data objects', () => {
  const base = { TerminalKey: 'demo', Amount: 350000, OrderId: 'HZC-1' };
  const withNestedData = { ...base, DATA: { registration: '1' }, Data: '{"registration":"1"}', Receipt: '{"Email":"team@example.ru"}' };
  assert.equal(buildTbankToken(base, 'secret'), buildTbankToken(withNestedData, 'secret'));
});

test('competition payment statuses are normalized', () => {
  assert.equal(normalizeCompetitionPaymentStatus('CONFIRMED'), 'paid');
  assert.equal(normalizeCompetitionPaymentStatus('AUTHORIZED'), 'processing');
  assert.equal(normalizeCompetitionPaymentStatus('REJECTED'), 'failed');
  assert.equal(normalizeCompetitionPaymentStatus('REFUNDED'), 'refunded');
});
