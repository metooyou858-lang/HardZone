const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeRewardRules } = require('../src/routes/marketing');

test('marketing rewards preserve recipient, type and numeric value', () => {
  assert.deepEqual(
    normalizeRewardRules([
      { recipient: 'referrer', reward_type: 'free_visit', value: '2' },
      { recipient: 'referred', reward_type: 'discount_percent', value: 15 },
    ]),
    [
      { recipient: 'referrer', reward_type: 'free_visit', value: 2 },
      { recipient: 'referred', reward_type: 'discount_percent', value: 15 },
    ]
  );
});

test('marketing rewards reject unsupported recipient and reward type', () => {
  assert.throws(
    () => normalizeRewardRules([{ recipient: 'someone', reward_type: 'free_visit', value: 1 }]),
    /получателя/
  );
  assert.throws(
    () => normalizeRewardRules([{ recipient: 'referrer', reward_type: 'cash', value: 1 }]),
    /тип награды/
  );
});

test('marketing rewards validate discount and free visit values', () => {
  assert.throws(
    () => normalizeRewardRules([{ recipient: 'referrer', reward_type: 'discount_percent', value: 101 }]),
    /100%/
  );
  assert.throws(
    () => normalizeRewardRules([{ recipient: 'referred', reward_type: 'free_visit', value: 1.5 }]),
    /целым числом/
  );
  assert.throws(
    () => normalizeRewardRules([{ recipient: 'referred', reward_type: 'free_visit', value: 0 }]),
    /размер награды/
  );
});

test('campaign may have no rewards', () => {
  assert.deepEqual(normalizeRewardRules([]), []);
});
