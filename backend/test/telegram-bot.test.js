const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseFindReplySlotId,
  renderToday,
  renderSlot,
} = require('../src/services/telegram-bot');

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
