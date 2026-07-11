const assert = require('node:assert/strict');
const { test } = require('node:test');

const { clubDateTimeToDate } = require('../src/utils/club-time');

test('club schedule time is interpreted in Asia/Vladivostok', () => {
  const result = clubDateTimeToDate('2026-07-11', '18:30:00');
  assert.equal(result.toISOString(), '2026-07-11T08:30:00.000Z');
});

test('club schedule conversion does not depend on the server local timezone', () => {
  const result = clubDateTimeToDate('2026-01-15', '07:00');
  assert.equal(result.toISOString(), '2026-01-14T21:00:00.000Z');
});

test('invalid club schedule values produce an invalid date', () => {
  assert.equal(Number.isNaN(clubDateTimeToDate('bad', 'time').getTime()), true);
});
