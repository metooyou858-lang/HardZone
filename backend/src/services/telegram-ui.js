const WEEKDAY_LABELS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

const TELEGRAM_UI_BUTTONS = Object.freeze({
  backToSchedule: '← К расписанию',
  backToTraining: '← К занятию',
  openAccount: 'Открыть личный кабинет',
  sharePhone: 'Поделиться телефоном',
});

function parseDateKey(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
}

function formatTelegramDate(value) {
  const date = parseDateKey(value);
  if (!date) return String(value || '');
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  }).format(date);
}

function formatTelegramTime(value) {
  const match = String(value || '').trim().match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : String(value || '');
}

function getTelegramWeekday(value) {
  const date = parseDateKey(value);
  return date ? WEEKDAY_LABELS[date.getUTCDay()] : '';
}

function buildScheduleHeading(dateKey, escapeHtml = String) {
  return `<b>📅 Расписание</b>\n${escapeHtml(getTelegramWeekday(dateKey))}, ${escapeHtml(formatTelegramDate(dateKey))}`;
}

module.exports = {
  TELEGRAM_UI_BUTTONS,
  WEEKDAY_LABELS,
  buildScheduleHeading,
  formatTelegramDate,
  formatTelegramTime,
  getTelegramWeekday,
};
