const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TELEGRAM_UI_BUTTONS,
  buildScheduleHeading,
  formatTelegramDate,
  formatTelegramTime,
} = require('../src/services/telegram-ui');

test('shared Telegram UI formats dates and times consistently', () => {
  assert.equal(formatTelegramDate('2026-07-13'), '13 июля');
  assert.equal(formatTelegramTime('09:00:00'), '09:00');
  assert.equal(buildScheduleHeading('2026-07-13'), '<b>📅 Расписание</b>\nПонедельник, 13 июля');
});

test('shared Telegram UI uses one navigation vocabulary', () => {
  assert.equal(TELEGRAM_UI_BUTTONS.backToSchedule, '← К расписанию');
  assert.equal(TELEGRAM_UI_BUTTONS.backToTraining, '← К занятию');
  assert.equal(TELEGRAM_UI_BUTTONS.openAccount, 'Открыть личный кабинет');
});
