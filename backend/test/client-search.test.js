const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  addClientSearchConditions,
  getClientSearchDigits,
  getClientSearchTokens,
  isTextSearchToken,
  normalizeSearchText,
} = require('../src/services/client-search');

test('client search normalizes whitespace and russian yo letter', () => {
  assert.equal(normalizeSearchText('  Алёна   Ёлкина  '), 'Алена Елкина');
  assert.deepEqual(getClientSearchTokens('  Алёна   Ёлкина  '), ['Алена', 'Елкина']);
});

test('client search detects normalized phone variants', () => {
  assert.deepEqual(getClientSearchDigits('+7 (914) 123-45-67'), ['79141234567']);
  assert.deepEqual(getClientSearchDigits('8 914 123 45 67'), ['89141234567', '79141234567']);
});

test('client search separates text tokens from numeric-only input', () => {
  assert.equal(isTextSearchToken('Иван'), true);
  assert.equal(isTextSearchToken('914'), false);

  const params = [];
  const conditions = [];
  addClientSearchConditions({ search: '914 123', params, conditions });

  assert.equal(conditions.length, 1);
  assert.match(conditions[0], /phone_normalized/);
  assert.deepEqual(params, ['%914123%']);
});

test('client search builds name conditions for both full-name orders', () => {
  const params = [];
  const conditions = [];
  addClientSearchConditions({ search: 'Иванов Иван', params, conditions });

  assert.equal(conditions.length, 2);
  assert.match(conditions.join('\n'), /last_name, c\.first_name/);
  assert.match(conditions.join('\n'), /first_name, c\.last_name/);
  assert.deepEqual(params, ['%Иванов%', '%Иван%']);
});
