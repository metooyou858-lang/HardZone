const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildScheduleText,
  buildSlotKeyboard,
  buildSlotText,
} = require('../src/services/telegram-client-bot');

test('client bot uses the shared schedule presentation', () => {
  const text = buildScheduleText([{ id: 1 }], 0);
  assert.match(text, /<b>📅 Расписание<\/b>/);
  assert.doesNotMatch(text, /\d{2}\.\d{2}\.\d{4}/);
});

test('client bot uses shared slot date and navigation style', () => {
  const text = buildSlotText({
    training_type_name: 'CrossFit',
    date: '2026-07-13',
    start_time: '09:00:00',
    capacity: 20,
    booked_count: 8,
    trainer_name: 'Анна',
  });
  const keyboard = buildSlotKeyboard({ id: 42 }, 0);

  assert.match(text, /📅 13 июля · 09:00/);
  assert.equal(keyboard.inline_keyboard.at(-1)[0].text, '← К расписанию');
});
