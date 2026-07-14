const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  INTERNAL_ERROR_MESSAGE,
  getPublicErrorMessage,
} = require('../src/utils/http-response');

test('public 4xx errors preserve the current client-visible message', () => {
  const error = new Error('Недостаточно прав доступа');

  assert.equal(getPublicErrorMessage(error, 403), 'Недостаточно прав доступа');
});

test('public 5xx errors do not expose internal details', () => {
  const error = new Error('password=secret database failure');

  assert.equal(getPublicErrorMessage(error, 500), INTERNAL_ERROR_MESSAGE);
  assert.equal(getPublicErrorMessage(error, 503), INTERNAL_ERROR_MESSAGE);
});

test('public 4xx errors keep the existing fallback for missing messages', () => {
  assert.equal(getPublicErrorMessage(null, 400), 'Error');
});
