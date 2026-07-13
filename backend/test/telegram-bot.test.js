const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatDate,
  formatTime,
  parseFindReplySlotId,
  renderClientSearch,
  renderToday,
  renderSlot,
} = require('../src/services/telegram-bot');

test('telegram dates and times use compact human-readable format', () => {
  assert.equal(formatDate('2026-07-13'), '13.07.2026');
  assert.equal(formatDate('2026-07-12T16:00:00.000Z'), '13.07.2026');
  assert.equal(formatTime('09:00:00'), '09:00');
  assert.equal(formatTime('2026-07-13T08:30:00.000Z'), '18:30');
});

test('today counter includes all clients returned by the schedule query', () => {
  const view = renderToday('2026-07-13', [{
    id: 42,
    start_time: '18:00:00',
    training_type_name: 'CrossFit',
    booked_clients_count: 3,
    capacity: 20,
  }]);

  assert.equal(view.keyboard.inline_keyboard[0][0].text, '18:00 CrossFit (3/20)');
});

test('slot view never exposes a raw database date', () => {
  const view = renderSlot({
    slot: {
      id: 42,
      date: new Date('2026-07-13T00:00:00.000Z'),
      start_time: '18:00:00',
      capacity: 20,
      training_type_name: 'CrossFit',
    },
    bookings: [],
  });

  assert.match(view.text, /13\.07\.2026, 18:00/);
  assert.equal(view.text.includes('GMT'), false);
});

test('client search hides incompatible subscriptions and offers unpaid booking', () => {
  const view = renderClientSearch(42, [{
    id: 7,
    first_name: 'Иван',
    last_name: 'Иванов',
    subscription_id: 11,
    subscription_type: 'open_gym',
    visits_left: 4,
    is_eligible: false,
  }]);

  assert.equal(view.keyboard.inline_keyboard.some((row) => row[0].callback_data === 'book:42:7:11'), false);
  assert.equal(view.keyboard.inline_keyboard[0][0].callback_data, 'bookunpaid:42:7');
});

test('slot view offers button-driven client search', () => {
  const view = renderSlot({
    slot: {
      id: 42,
      date: '2026-07-13',
      start_time: '18:00:00',
      capacity: 20,
      training_type_name: 'CrossFit',
    },
    bookings: [],
  });

  assert.equal(view.text.includes('/find'), false);
  assert.deepEqual(view.keyboard.inline_keyboard.at(-2), [{
    text: 'Добавить клиента',
    callback_data: 'find:42',
  }]);
});

test('client search reply keeps the selected slot without server-side state', () => {
  const slotId = parseFindReplySlotId({
    text: 'Иванов',
    reply_to_message: { text: 'Занятие №42. Введи фамилию, имя или телефон клиента.' },
  });

  assert.equal(slotId, 42);
  assert.equal(parseFindReplySlotId({ text: 'Иванов' }), null);
});
