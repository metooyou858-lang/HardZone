const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePhone } = require('../src/utils/phones');

test('normalizePhone produces one key for common Russian phone formats', () => {
  const formats = [
    '+7 (999) 111-22-33',
    '8 999 111 22 33',
    '9991112233',
    '79991112233',
  ];

  assert.deepEqual(formats.map(normalizePhone), Array(formats.length).fill('79991112233'));
});

test('normalizePhone returns null for missing or non-numeric phones', () => {
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('нет телефона'), null);
});
