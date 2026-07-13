const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatDate,
  formatTime,
  parseFindReplySlotId,
  rememberClientSearchPrompt,
  renderClientSearch,
  renderCancelConfirmation,
  renderMainMenu,
  renderScheduleDay,
  renderToday,
  renderSlot,
} = require('../src/services/telegram-bot');

test('telegram dates and times use compact human-readable format', () => {
  assert.equal(formatDate('2026-07-13'), '13 июля');
  assert.equal(formatDate('2026-07-12T16:00:00.000Z'), '13 июля');
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

test('start menu uses a compact persistent reply keyboard', () => {
  const view = renderMainMenu({ name: 'Анна' });

  assert.match(view.text, /Привет, Анна/);
  assert.equal(view.keyboard.is_persistent, true);
  assert.deepEqual(view.keyboard.keyboard[0].map((button) => button.text), [
    '📅 Расписание',
    '👤 Личный кабинет',
  ]);
  assert.equal(JSON.stringify(view.keyboard).includes('web_app'), false);
});

test('schedule view includes navigation for the remaining week', () => {
  const view = renderScheduleDay('2026-07-13', [], 0);
  const callbacks = view.keyboard.inline_keyboard.flat().map((button) => button.callback_data);

  assert.equal(callbacks.includes('schedule:0'), true);
  assert.equal(callbacks.some((callback) => callback.startsWith('schedule:')), true);
  assert.match(view.text, /Расписание/);
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

  assert.match(view.text, /📅 13 июля · 18:00/);
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

test('confirmed booking can be cancelled only after confirmation', () => {
  const slot = renderSlot({
    slot: {
      id: 42,
      date: '2026-07-13',
      start_time: '18:00:00',
      capacity: 20,
      training_type_name: 'CrossFit',
    },
    bookings: [{ id: 17, client_name: 'Иван Иванов', status: 'confirmed' }],
  });
  const cancelButton = slot.keyboard.inline_keyboard[0].find((button) => button.callback_data.startsWith('cancelask:'));

  assert.equal(cancelButton.callback_data, 'cancelask:17:42');

  const confirmation = renderCancelConfirmation(17, 42);
  assert.equal(confirmation.keyboard.inline_keyboard[0][0].callback_data, 'cancel:17:42');
  assert.equal(confirmation.keyboard.inline_keyboard[0][1].callback_data, 'slot:42');
});

test('attended booking must be unmarked before cancellation', () => {
  const slot = renderSlot({
    slot: {
      id: 42,
      date: '2026-07-13',
      start_time: '18:00:00',
      capacity: 20,
      training_type_name: 'CrossFit',
    },
    bookings: [{ id: 17, client_name: 'Иван Иванов', status: 'attended' }],
  });

  assert.equal(JSON.stringify(slot.keyboard).includes('cancelask:'), false);
  assert.equal(JSON.stringify(slot.keyboard).includes('unatt:17'), true);
});

test('client search reply keeps the selected slot without exposing it in text', () => {
  rememberClientSearchPrompt(100, 500, 42);
  const slotId = parseFindReplySlotId({
    chat: { id: 100 },
    text: 'Иванов',
    reply_to_message: { message_id: 500, text: 'Введите фамилию, имя или телефон клиента.' },
  });

  assert.equal(slotId, 42);
  assert.equal(parseFindReplySlotId({ chat: { id: 100 }, text: 'Иванов' }), null);
});
