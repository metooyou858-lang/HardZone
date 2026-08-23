const logger = require('./logger');
const { query } = require('../db');
const telegramRoute = require('../routes/telegram');
const { getClubContacts } = require('./club-settings');
const fs = require('node:fs');
const path = require('node:path');
const {
  TELEGRAM_UI_BUTTONS,
  buildScheduleHeading,
  formatTelegramDate,
  formatTelegramTime,
} = require('./telegram-ui');

const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org/bot';
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const PROJECT_UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads');

const MENU_BUTTONS = {
  schedule: '📅 Расписание',
  account: '👤 Личный кабинет',
  subscriptions: '💳 Абонементы',
  trainers: '🏋️ Тренеры',
  contacts: '📍 Контакты',
};

const CONTACT_LINK_FIELDS = [
  ['🗺️ Яндекс Карты', 'yandex_maps_url'],
  ['🌍 Google Maps', 'google_maps_url'],
  ['📍 2ГИС', 'two_gis_url'],
  ['VK ВКонтакте', 'vk_url'],
  ['📷 Instagram', 'instagram_url'],
  ['✈️ Telegram', 'telegram_url'],
  ['🟢 WhatsApp', 'whatsapp_url'],
  ['🔵 MAX', 'max_url'],
];

const WEEKDAY_LABELS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function getClientMiniAppUrl() {
  const explicitUrl = String(process.env.TELEGRAM_CLIENT_MINIAPP_URL || '').trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const baseUrl = process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'https://hardzone.space';
  return `${String(baseUrl).replace(/\/+$/, '')}/telegram/client`;
}

function getPublicBaseUrl() {
  return String(process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'https://hardzone.space').replace(/\/+$/, '');
}

function getPublicPhotoUrl(value) {
  const photoUrl = compact(value, '');
  if (!photoUrl) {
    return null;
  }

  try {
    const url = new URL(photoUrl);
    return ['http:', 'https:'].includes(url.protocol) ? photoUrl : null;
  } catch {
    return photoUrl.startsWith('/') ? `${getPublicBaseUrl()}${photoUrl}` : null;
  }
}

function safeDecodePathname(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function configureClientMenuButton() {
  await telegramClientRequest('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть главное меню' },
    ],
  });

  return telegramClientRequest('setChatMenuButton', {
    menu_button: { type: 'commands' },
  });
}

async function telegramClientRequest(method, payload, options = {}) {
  const token = process.env.TELEGRAM_CLIENT_BOT_TOKEN;
  if (!token) {
    return null;
  }

  const timeoutMs = options.timeoutMs || 30000;
  const response = await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram client ${method} failed: ${response.status} ${text.slice(0, 300)}`);
  }

  const body = await response.json();
  if (body && body.ok === false) {
    throw new Error(`Telegram client ${method} failed: ${body.description || 'unknown error'}`);
  }

  return body;
}

async function telegramClientMultipartRequest(method, formData, options = {}) {
  const token = process.env.TELEGRAM_CLIENT_BOT_TOKEN;
  if (!token) {
    return null;
  }

  const timeoutMs = options.timeoutMs || 30000;
  const response = await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
    method: 'POST',
    body: formData,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram client ${method} failed: ${response.status} ${text.slice(0, 300)}`);
  }

  const body = await response.json();
  if (body && body.ok === false) {
    throw new Error(`Telegram client ${method} failed: ${body.description || 'unknown error'}`);
  }

  return body;
}

function getUploadPhotoPath(value) {
  const photoUrl = compact(value, '');
  if (!photoUrl) {
    return null;
  }

  let pathname = photoUrl;
  try {
    pathname = safeDecodePathname(new URL(photoUrl).pathname);
  } catch {
    pathname = safeDecodePathname(photoUrl);
  }

  if (!pathname.startsWith('/uploads/trainers/')) {
    return null;
  }

  const relativePath = pathname.replace(/^\/uploads\//, '').split('/').filter(Boolean);
  const candidates = [
    [UPLOADS_DIR, path.resolve(UPLOADS_DIR, 'trainers')],
    [PROJECT_UPLOADS_DIR, path.resolve(PROJECT_UPLOADS_DIR, 'trainers')],
  ];

  for (const [uploadsDir, trainersDir] of candidates) {
    const filePath = path.resolve(uploadsDir, ...relativePath);
    if (
      filePath.startsWith(trainersDir + path.sep) &&
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile()
    ) {
      return filePath;
    }
  }

  return null;
}

function getImageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function sendClientMessage(chatId, text, replyMarkup = null) {
  return telegramClientRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function sendClientPhoto(chatId, photo, caption, replyMarkup = null) {
  if (photo?.localPath) {
    const buffer = await fs.promises.readFile(photo.localPath);
    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('photo', new Blob([buffer], { type: getImageMimeType(photo.localPath) }), path.basename(photo.localPath));
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
    if (replyMarkup) {
      formData.append('reply_markup', JSON.stringify(replyMarkup));
    }

    return telegramClientMultipartRequest('sendPhoto', formData);
  }

  return telegramClientRequest('sendPhoto', {
    chat_id: chatId,
    photo: photo.url,
    caption,
    parse_mode: 'HTML',
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function editClientMessage(chatId, messageId, text, replyMarkup = null) {
  return telegramClientRequest('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function editClientMessageReplyMarkup(chatId, messageId, replyMarkup = null) {
  return telegramClientRequest('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function answerCallback(callbackQueryId, text = null, showAlert = false) {
  return telegramClientRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: showAlert } : {}),
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function compact(value, fallback = 'Не указано') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function isButtonUrl(value) {
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) || /^tg:\/\//i.test(text);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

function toDateKey(dateValue) {
  if (dateValue instanceof Date) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(dateValue || '').slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDateKeyByOffset(offset = 0) {
  return toDateKey(addDays(new Date(), Number(offset || 0)));
}

function getCurrentWeekScheduleOffsets() {
  const today = new Date();
  const day = today.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const mondayOffset = -daysFromMonday;
  const sundayOffset = mondayOffset + 6;
  const offsets = [];

  for (let offset = Math.max(0, mondayOffset); offset <= sundayOffset; offset += 1) {
    offsets.push(offset);
  }

  return offsets.length ? offsets : [0];
}

function formatScheduleDayButton(offset, activeOffset) {
  const date = addDays(new Date(), Number(offset || 0));
  const dayLabel = WEEKDAY_LABELS[date.getDay()] || '';
  const prefix = Number(offset || 0) === Number(activeOffset || 0) ? '● ' : '';
  return `${prefix}${dayLabel}`;
}

function normalizeScheduleOffset(offset = 0) {
  const parsed = Number.parseInt(String(offset || '0'), 10) || 0;
  const offsets = getCurrentWeekScheduleOffsets();
  return offsets.includes(parsed) ? parsed : offsets[0] || 0;
}

function formatDateLabel(dateKey) {
  return formatTelegramDate(dateKey);
}

function formatTime(timeValue) {
  return formatTelegramTime(timeValue);
}

function getClientName(payload, telegramUser = null) {
  const client = payload?.client;
  const firstName = compact(client?.first_name || telegramUser?.first_name, 'друг');
  return firstName;
}

function buildMainReplyKeyboard() {
  return {
    keyboard: [
      [{ text: MENU_BUTTONS.schedule }, { text: MENU_BUTTONS.account }],
      [{ text: MENU_BUTTONS.subscriptions }, { text: MENU_BUTTONS.trainers }],
      [{ text: MENU_BUTTONS.contacts }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function buildClientMiniAppKeyboard(text = TELEGRAM_UI_BUTTONS.openAccount) {
  return {
    inline_keyboard: [[
      {
        text,
        web_app: { url: getClientMiniAppUrl() },
      },
    ]],
  };
}

function buildClientPhoneKeyboard() {
  return {
    keyboard: [
      [{ text: TELEGRAM_UI_BUTTONS.sharePhone, request_contact: true }],
      [{ text: TELEGRAM_UI_BUTTONS.openAccount, web_app: { url: getClientMiniAppUrl() } }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function buildMainMenuText(payload, telegramUser = null) {
  const name = escapeHtml(getClientName(payload, telegramUser));
  return [
    `👋 Привет, ${name}!`,
    '',
    'HardZone — кроссфит-зал для функционального тренинга, силы, выносливости и живого спортивного комьюнити.',
    '',
    'Здесь можно посмотреть расписание, записаться на тренировку, проверить абонемент и открыть личный кабинет.',
    '',
    'Выберите действие ниже:',
  ].join('\n');
}

function buildNotLinkedText() {
  return [
    '<b>HardZone</b>',
    '',
    'Telegram пока не привязан к клиенту HardZone.',
    'Откройте личный кабинет и подтвердите номер телефона, чтобы пользоваться записью и расписанием в чате.',
  ].join('\n');
}

function getSlotsForDay(payload, dayOffset = 0) {
  dayOffset = normalizeScheduleOffset(dayOffset);
  const dateKey = getDateKeyByOffset(dayOffset);
  return (payload?.available_slots || [])
    .filter((slot) => toDateKey(slot.date) === dateKey)
    .sort((left, right) => String(left.start_time).localeCompare(String(right.start_time)));
}

function findSlot(payload, slotId) {
  return (payload?.available_slots || []).find((slot) => String(slot.id) === String(slotId)) || null;
}

function buildScheduleKeyboard(slots, dayOffset) {
  dayOffset = normalizeScheduleOffset(dayOffset);
  const rows = slots.map((slot) => [{
    text: `${formatTime(slot.start_time)} ${compact(slot.training_type_name, 'Тренировка')}`,
    callback_data: `slot:${slot.id}:${dayOffset}`,
  }]);

  const dayButtons = getCurrentWeekScheduleOffsets().map((offset) => ({
    text: formatScheduleDayButton(offset, dayOffset),
    callback_data: `schedule:${offset}`,
  }));

  for (let index = 0; index < dayButtons.length; index += 2) {
    rows.push(dayButtons.slice(index, index + 2));
  }

  return { inline_keyboard: rows };
}

function buildScheduleText(slots, dayOffset = 0, title = 'Расписание') {
  dayOffset = normalizeScheduleOffset(dayOffset);
  const dateKey = getDateKeyByOffset(dayOffset);
  const heading = title === 'Расписание'
    ? buildScheduleHeading(dateKey, escapeHtml)
    : `<b>${escapeHtml(title)}</b>\n${escapeHtml(formatDateLabel(dateKey))}`;
  const lines = [heading, ''];

  if (slots.length === 0) {
    lines.push('На этот день доступных групповых тренировок для записи нет.');
    return lines.join('\n');
  }

  lines.push('Выберите тренировку:');
  return lines.join('\n');
}

function buildSlotKeyboard(slot, dayOffset = 0) {
  const rows = [[{ text: 'Записаться', callback_data: `book:${slot.id}` }]];
  rows.push([{ text: TELEGRAM_UI_BUTTONS.backToSchedule, callback_data: `schedule:${dayOffset}` }]);
  return { inline_keyboard: rows };
}

function buildSlotText(slot) {
  const title = compact(slot.training_type_name, 'Тренировка');
  const dateLabel = formatDateLabel(toDateKey(slot.date));
  const freePlaces = Number(slot.free_places ?? Math.max(0, Number(slot.capacity || 0) - Number(slot.booked_count || 0)));
  const lines = [
    `<b>${escapeHtml(title)}</b>`,
    `📅 ${escapeHtml(dateLabel)} · ${escapeHtml(formatTime(slot.start_time))}`,
    '',
    `Тренер: ${escapeHtml(compact(slot.trainer_name))}`,
    `Свободно: ${freePlaces} из ${Number(slot.capacity || 0)} мест`,
  ];

  if (slot.is_booked) {
    lines.push('', '✅ Вы уже записаны на эту тренировку.');
  }

  const description = compact(slot.training_type_description, '');
  const audience = compact(slot.training_type_audience, '');
  const location = compact(slot.training_type_location, '');
  const note = compact(slot.training_type_booking_note, '');

  if (description || audience || location || note) {
    lines.push('');
  }

  if (description) lines.push(escapeHtml(description));
  if (audience) lines.push(`Для кого: ${escapeHtml(audience)}`);
  if (location) lines.push(`Локация: ${escapeHtml(location)}`);
  if (note) lines.push(escapeHtml(note));

  return lines.join('\n');
}

function buildBookingResultText(slot = null, result = null) {
  const isUnpaid = result?.coverage_status === 'unpaid';
  const paymentLine = isUnpaid
    ? 'Абонемент не найден: запись создана к оплате. Оплатите тренировку на ресепшене перед занятием.'
    : 'Списание с абонемента произойдет только при отметке посещения в клубе.';

  if (!slot) {
    return [
      '✅ Вы записаны на тренировку.',
      '',
      paymentLine,
    ].join('\n');
  }

  return [
    `✅ Вы записаны на ${escapeHtml(compact(slot.training_type_name, 'тренировку'))}.`,
    `${escapeHtml(formatDateLabel(toDateKey(slot.date)))}, ${escapeHtml(formatTime(slot.start_time))}`,
    '',
    paymentLine,
  ].join('\n');
}

function mapBookingStatus(status) {
  const messages = {
    not_linked: 'Telegram не привязан к клиенту HardZone.',
    slot_not_found: 'Занятие не найдено или отменено.',
    slot_started: 'Запись закрыта после начала занятия.',
    booking_closed: 'Запись закрыта.',
    no_subscription: 'Абонемент не найден. Запись будет создана к оплате.',
    no_places: 'Нет свободных мест.',
    already_booked: 'Вы уже записаны на это занятие.',
  };
  return messages[status] || 'Не удалось записаться.';
}

function buildTrainersKeyboard(payload) {
  const rows = (payload?.trainers || []).map((trainer) => [{
    text: `${compact(trainer.first_name, '')} ${compact(trainer.last_name, '')}`.trim(),
    callback_data: `trainer:${trainer.id}`,
  }]);

  return { inline_keyboard: rows };
}

function buildTrainersText(payload) {
  if (!payload?.trainers?.length) {
    return '<b>Тренеры HardZone</b>\n\nПока список тренеров не заполнен в CRM.';
  }

  return '<b>Тренеры HardZone</b>\n\nВыберите тренера:';
}

function buildTrainerText(trainer) {
  const name = `${compact(trainer.first_name, '')} ${compact(trainer.last_name, '')}`.trim();
  const lines = [`<b>${escapeHtml(name || 'Тренер')}</b>`];

  if (trainer.position) lines.push(escapeHtml(trainer.position));
  if (trainer.bio) lines.push('', escapeHtml(trainer.bio));

  const specialties = Array.isArray(trainer.specialties) ? trainer.specialties.filter(Boolean) : [];
  if (specialties.length) {
    lines.push('', `Специализация: ${escapeHtml(specialties.join(', '))}`);
  }

  if (!trainer.bio) {
    lines.push('', 'Описание тренера пока не заполнено в CRM.');
  }

  return lines.join('\n');
}

function buildTrainerPhotoCaption(trainer) {
  const name = `${compact(trainer.first_name, '')} ${compact(trainer.last_name, '')}`.trim();
  const lines = [`<b>${escapeHtml(name || 'Тренер')}</b>`];

  if (trainer.position) {
    lines.push(escapeHtml(trainer.position));
  }

  const specialties = Array.isArray(trainer.specialties) ? trainer.specialties.filter(Boolean) : [];
  if (specialties.length) {
    lines.push('', `Специализация: ${escapeHtml(specialties.join(', '))}`);
  }

  if (trainer.bio) {
    const shortBio = String(trainer.bio).trim().slice(0, 520);
    lines.push('', escapeHtml(shortBio));
    if (String(trainer.bio).trim().length > shortBio.length) {
      lines.push('...');
    }
  }

  return lines.join('\n');
}

function buildTrainerKeyboard() {
  return { inline_keyboard: [[{ text: 'Назад к тренерам', callback_data: 'trainers' }]] };
}

async function getSubscriptionProducts() {
  const { rows } = await query(
    `
      SELECT
        p.name,
        p.sale_price,
        pt.name AS product_type_name,
        c.name AS category_name,
        psp.subscription_type,
        psp.visits_total,
        psp.validity_days,
        psp.allow_free_visit,
        psp.allow_group_training,
        psp.allow_personal_training
      FROM products p
      JOIN product_subscription_params psp ON psp.product_id = p.id
      LEFT JOIN product_types pt ON pt.id = p.product_type_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_archived = false
        AND p.sale_price IS NOT NULL
        AND p.sale_price > 0
        AND (pt.id IS NULL OR pt.has_sale_price = true)
      ORDER BY
        CASE psp.subscription_type
          WHEN 'unlimited' THEN 0
          WHEN 'period' THEN 1
          WHEN 'visits' THEN 2
          WHEN 'single' THEN 3
          ELSE 4
        END,
        psp.visits_total DESC NULLS LAST,
        p.sale_price DESC,
        p.name
      LIMIT 30
    `
  );

  return rows;
}

function buildSubscriptionLine(item) {
  const title = getSubscriptionDisplayName(item);
  const period = shouldShowSubscriptionPeriod(item)
    ? ` / ${Number(item.validity_days)} дней`
    : '';

  return `• ${escapeHtml(title)} — ${formatMoney(item.sale_price)} ₽${period}`;
}

function isOpenGymSubscription(item) {
  const name = String(item.name || '').trim().toLowerCase();
  return item.allow_free_visit === true || name.includes('свобод') || name.includes('open gym');
}

function isChildSubscription(item) {
  const name = String(item.name || '').trim().toLowerCase();
  return name.includes('дет');
}

function isUnlimitedSubscription(item) {
  const name = String(item.name || '').trim().toLowerCase();
  return item.subscription_type === 'unlimited' || name.includes('безлимит');
}

function isPersonalTrainingProduct(item) {
  const haystack = [
    item.name,
    item.category_name,
    item.product_type_name,
  ].map((value) => String(value || '').trim().toLowerCase()).join(' ');

  return item.allow_personal_training === true
    || haystack.includes('персон')
    || haystack.includes('сплит');
}

function shouldShowSubscriptionPeriod(item) {
  return item.subscription_type !== 'single'
    && item.validity_days;
}

function pluralTraining(count) {
  const value = Math.abs(Number(count || 0));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'тренировок';
  if (last === 1) return 'тренировка';
  if (last >= 2 && last <= 4) return 'тренировки';
  return 'тренировок';
}

function getMembershipSuffix(item) {
  const name = String(item.name || '').trim().toLowerCase();

  if (name.includes('не членов') || name.includes('не член')) {
    return ' не для членов клуба';
  }

  if (name.includes('для членов') || name.includes('для клуба')) {
    return ' для членов клуба';
  }

  return '';
}

function getSingleVisitDisplayName(item) {
  const name = String(item.name || '').trim();
  const lowerName = name.toLowerCase();
  const membershipSuffix = getMembershipSuffix(item);

  if (isOpenGymSubscription(item)) {
    return 'Свободное посещение зала';
  }

  if (lowerName.includes('группов')) {
    return 'Групповое занятие';
  }

  if (lowerName.includes('ниндз')) {
    return `Ниндзя${membershipSuffix}`;
  }

  if (lowerName.includes('растяж')) {
    return `Растяжка${membershipSuffix}`;
  }

  if (lowerName.includes('тяж') && lowerName.includes('атлет')) {
    return `Тяжелая атлетика${membershipSuffix}`;
  }

  return compact(name, 'Разовое посещение')
    .replace(/^разовое\s+посещение\s+/i, '')
    .replace(/^разовая\s+тренировка\s+/i, '')
    .replace(/\s+разовое\s+посещение$/i, '')
    .trim() || 'Разовое посещение';
}

function getPersonalTrainingDisplayName(item) {
  const name = String(item.name || '').trim();
  const lowerName = name.toLowerCase();

  if (lowerName.includes('трисплит')) {
    return 'ТриСплит';
  }

  if (lowerName.includes('сплит')) {
    return 'Сплит тренировка';
  }

  if (item.visits_total && item.subscription_type !== 'single') {
    const visits = Number(item.visits_total);
    return `${visits} персональных ${pluralTraining(visits)}`;
  }

  return 'Персональная тренировка';
}

function getSubscriptionDisplayName(item) {
  if (isPersonalTrainingProduct(item)) {
    return getPersonalTrainingDisplayName(item);
  }

  if (item.subscription_type === 'single') {
    return getSingleVisitDisplayName(item);
  }

  if (item.subscription_type === 'visits' && item.visits_total) {
    const visits = Number(item.visits_total);
    const childLabel = isChildSubscription(item) ? 'детских ' : '';
    return `${visits} ${childLabel}${pluralTraining(visits)}`;
  }

  if (isUnlimitedSubscription(item)) {
    return 'Безлимит';
  }

  if (isOpenGymSubscription(item)) {
    return 'Свободное посещение';
  }

  return compact(item.name, 'Абонемент');
}

async function buildSubscriptionsText(payload) {
  const products = await getSubscriptionProducts();
  const activeSubscription = (payload?.subscriptions || []).find((item) => item.status === 'active');
  const personalTrainings = products.filter(isPersonalTrainingProduct);
  const subscriptions = products.filter((item) => item.subscription_type !== 'single' && !isPersonalTrainingProduct(item));
  const singleVisits = products.filter((item) => item.subscription_type === 'single' && !isPersonalTrainingProduct(item));
  const lines = ['<b>Абонементы HardZone</b>'];

  if (activeSubscription) {
    lines.push(
      '',
      '<b>Ваш абонемент</b>',
      escapeHtml(getSubscriptionDisplayName({
        name: activeSubscription.product_name,
        subscription_type: activeSubscription.type,
        visits_total: activeSubscription.visits_total,
      })),
      activeSubscription.visits_left === null || activeSubscription.visits_left === undefined
        ? 'Остаток: безлимит'
        : `Осталось: ${Number(activeSubscription.visits_left)}`
    );
  }

  lines.push('', '<b>Абонементы клуба</b>');
  if (subscriptions.length) {
    lines.push(...subscriptions.map(buildSubscriptionLine));
  } else {
    lines.push('Цены пока не заполнены в CRM.');
  }

  if (personalTrainings.length) {
    lines.push('', '<b>Персональные тренировки</b>', ...personalTrainings.map(buildSubscriptionLine));
  }

  if (singleVisits.length) {
    lines.push('', '<b>Разовые посещения</b>', ...singleVisits.map(buildSubscriptionLine));
  }

  return lines.join('\n');
}

async function buildContactsText(contacts = null) {
  contacts = contacts || await getClubContacts();
  const title = compact(contacts?.title, 'HardZone');
  const lines = [`<b>Контакты ${escapeHtml(title)}</b>`];

  const contactLines = [
    contacts?.address ? `📍 ${escapeHtml(contacts.address)}` : null,
    contacts?.phone ? `☎️ ${escapeHtml(contacts.phone)}` : null,
    contacts?.email ? `✉️ ${escapeHtml(contacts.email)}` : null,
    contacts?.schedule_note ? `\n<b>Режим работы</b>\n${escapeHtml(contacts.schedule_note)}` : null,
    contacts?.extra_note ? `\n${escapeHtml(contacts.extra_note)}` : null,
  ].filter(Boolean);
  const hasContactLinks = CONTACT_LINK_FIELDS.some(([, field]) => isButtonUrl(contacts?.[field]));

  if (!contactLines.length) {
    lines.push('', hasContactLinks ? 'Выберите нужную площадку ниже.' : 'Контакты пока не заполнены в CRM.');
    return lines.join('\n');
  }

  lines.push('', ...contactLines);
  return lines.join('\n');
}

function buildContactsKeyboard(contacts = null) {
  contacts = contacts || {};
  const buttons = CONTACT_LINK_FIELDS
    .map(([label, field]) => {
      const url = String(contacts[field] || '').trim();
      return isButtonUrl(url) ? { text: label, url } : null;
    })
    .filter(Boolean);

  if (!buttons.length) {
    return null;
  }

  return { inline_keyboard: buttons.map((button) => [button]) };
}

async function loadClientPayload(telegramId) {
  if (!telegramId) return null;
  return telegramRoute.findClientByTelegramId(telegramId);
}

async function sendMainMenu(chatId, telegramUser = null) {
  const payload = await loadClientPayload(telegramUser?.id);
  if (!payload) {
    await sendClientMessage(chatId, buildNotLinkedText(), buildClientPhoneKeyboard());
    return;
  }

  if (payload.profile_required) {
    await sendClientMessage(
      chatId,
      'Профиль нужно заполнить: имя, фамилия, email, телефон и дата рождения.',
      buildClientMiniAppKeyboard('Заполнить профиль')
    );
    return;
  }

  await sendClientMessage(chatId, buildMainMenuText(payload, telegramUser), buildMainReplyKeyboard());
}

async function sendSchedule(chatId, telegramId, dayOffset = 0, title = 'Расписание') {
  const payload = await loadClientPayload(telegramId);
  if (!payload) {
    await sendClientMessage(chatId, buildNotLinkedText(), buildClientPhoneKeyboard());
    return;
  }

  dayOffset = normalizeScheduleOffset(dayOffset);
  const slots = getSlotsForDay(payload, dayOffset);
  await sendClientMessage(chatId, buildScheduleText(slots, dayOffset, title), buildScheduleKeyboard(slots, dayOffset));
}

async function handleClientMessage(message) {
  const chatId = message.chat?.id;
  const telegramUser = message.from;
  const text = String(message.text || '').trim();
  if (!chatId) {
    return;
  }

  if (message.contact) {
    const contact = message.contact;
    if (!telegramUser?.id || Number(contact.user_id) !== Number(telegramUser.id)) {
      await sendClientMessage(chatId, 'Отправьте свой номер через кнопку "Поделиться телефоном".', buildClientPhoneKeyboard());
      return;
    }

    const result = await telegramRoute.createAndLinkClientByVerifiedContact(telegramUser, contact.phone_number);
    if (result.status === 'invalid_phone') {
      await sendClientMessage(chatId, 'Не удалось распознать номер телефона. Попробуйте ещё раз.', buildClientPhoneKeyboard());
      return;
    }

    if (result.status === 'duplicate') {
      await sendClientMessage(
        chatId,
        'В CRM найдено несколько клиентов с таким номером. Обратитесь к администратору HardZone.'
      );
      return;
    }

    if (result.status === 'already_linked') {
      await sendClientMessage(
        chatId,
        'Этот клиент уже привязан к другому Telegram. Для смены привязки обратитесь к администратору HardZone.'
      );
      return;
    }

    await sendClientMessage(
      chatId,
      'Телефон получен. Откройте личный кабинет и заполните персональные данные.',
      buildClientMiniAppKeyboard()
    );
    return;
  }

  if (!text || text === '/start' || text === '/menu') {
    await sendMainMenu(chatId, telegramUser);
    return;
  }

  if (text === MENU_BUTTONS.schedule) {
    await sendSchedule(chatId, telegramUser?.id, 0, 'Расписание');
    return;
  }

  if (text === MENU_BUTTONS.account) {
    await sendClientMessage(
      chatId,
      'Откройте личный кабинет, чтобы посмотреть свои записи, абонемент, историю посещений и профиль.',
      buildClientMiniAppKeyboard()
    );
    return;
  }

  const payload = await loadClientPayload(telegramUser?.id);
  if (!payload) {
    await sendClientMessage(chatId, buildNotLinkedText(), buildClientPhoneKeyboard());
    return;
  }

  if (text === MENU_BUTTONS.subscriptions) {
    await sendClientMessage(chatId, await buildSubscriptionsText(payload));
    return;
  }

  if (text === MENU_BUTTONS.trainers) {
    await sendClientMessage(chatId, buildTrainersText(payload), buildTrainersKeyboard(payload));
    return;
  }

  if (text === MENU_BUTTONS.contacts) {
    const contacts = await getClubContacts();
    await sendClientMessage(chatId, await buildContactsText(contacts), buildContactsKeyboard(contacts));
    return;
  }

  await sendMainMenu(chatId, telegramUser);
}

async function handleClientCallback(callbackQuery) {
  const callbackId = callbackQuery.id;
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  const telegramId = callbackQuery.from?.id;
  const data = String(callbackQuery.data || '');

  if (!chatId || !messageId) {
    await answerCallback(callbackId);
    return;
  }

  const payload = await loadClientPayload(telegramId);
  if (!payload) {
    await answerCallback(callbackId, 'Telegram не привязан к клиенту HardZone', true);
    await editClientMessage(chatId, messageId, buildNotLinkedText(), buildClientMiniAppKeyboard('Привязать аккаунт'));
    return;
  }

  if (data.startsWith('schedule:')) {
    const dayOffset = normalizeScheduleOffset(data.split(':')[1] || '0');
    const slots = getSlotsForDay(payload, dayOffset);
    await answerCallback(callbackId);
    await editClientMessage(chatId, messageId, buildScheduleText(slots, dayOffset), buildScheduleKeyboard(slots, dayOffset));
    return;
  }

  if (data.startsWith('slot:')) {
    const [, slotId, dayOffsetRaw] = data.split(':');
    const slot = findSlot(payload, slotId);
    const dayOffset = normalizeScheduleOffset(dayOffsetRaw || '0');
    await answerCallback(callbackId);

    if (!slot) {
      await editClientMessage(chatId, messageId, 'Занятие не найдено или уже недоступно.', {
        inline_keyboard: [[{ text: TELEGRAM_UI_BUTTONS.backToSchedule, callback_data: `schedule:${dayOffset}` }]],
      });
      return;
    }

    await editClientMessage(chatId, messageId, buildSlotText(slot), buildSlotKeyboard(slot, dayOffset));
    return;
  }

  if (data.startsWith('book:')) {
    const slotId = data.split(':')[1];
    const slot = findSlot(payload, slotId);
    const result = await telegramRoute.bookClientSlot(telegramId, slotId);
    if (result.status !== 'booked') {
      await answerCallback(callbackId, mapBookingStatus(result.status), true);
      return;
    }

    await answerCallback(callbackId, 'Вы записаны');
    await editClientMessage(chatId, messageId, buildBookingResultText(slot, result), buildClientMiniAppKeyboard('Открыть личный кабинет'));
    return;
  }

  if (data === 'trainers') {
    await answerCallback(callbackId);
    if (callbackQuery.message?.photo?.length) {
      await editClientMessageReplyMarkup(chatId, messageId).catch((error) => {
        logger.warn('telegram_client', {
          action: 'remove_trainer_photo_keyboard_failed',
          message: error.message,
        });
      });
      await sendClientMessage(chatId, buildTrainersText(payload), buildTrainersKeyboard(payload));
    } else {
      await editClientMessage(chatId, messageId, buildTrainersText(payload), buildTrainersKeyboard(payload));
    }
    return;
  }

  if (data.startsWith('trainer:')) {
    const trainerId = data.split(':')[1];
    const trainer = (payload.trainers || []).find((item) => String(item.id) === String(trainerId));
    await answerCallback(callbackId);

    if (!trainer) {
      await editClientMessage(chatId, messageId, 'Тренер не найден.', buildTrainerKeyboard());
      return;
    }

    const localPath = getUploadPhotoPath(trainer.photo_url);
    const photo = localPath
      ? { localPath }
      : getPublicPhotoUrl(trainer.photo_url)
        ? { url: getPublicPhotoUrl(trainer.photo_url) }
        : null;
    if (photo) {
      try {
        await sendClientPhoto(chatId, photo, buildTrainerPhotoCaption(trainer), buildTrainerKeyboard());
        return;
      } catch (error) {
        logger.warn('telegram_client', {
          action: 'send_trainer_photo_failed',
          trainer_id: trainer.id,
          photo_url: trainer.photo_url,
          message: error.message,
        });
      }
    }

    await editClientMessage(chatId, messageId, buildTrainerText(trainer), buildTrainerKeyboard());
    return;
  }

  await answerCallback(callbackId);
}

async function handleTelegramClientUpdate(update) {
  if (update.message) {
    await handleClientMessage(update.message);
    return;
  }

  if (update.callback_query?.id) {
    await handleClientCallback(update.callback_query).catch(async (error) => {
      logger.error('telegram_client', {
        action: 'handle_callback_failed',
        message: error.message,
        stack: error.stack,
      });
      await answerCallback(update.callback_query.id, 'Не удалось выполнить действие', true).catch((answerError) => {
        logger.warn('telegram_client', {
          action: 'answer_callback_failed',
          message: answerError.message,
        });
      });
    });
  }
}

module.exports = {
  buildScheduleKeyboard,
  buildScheduleText,
  buildSlotKeyboard,
  buildSlotText,
  configureClientMenuButton,
  handleTelegramClientUpdate,
  telegramClientRequest,
};
