const { resolveModules, hasModuleAccess } = require('../authz');
const { pool } = require('../db');
const {
  assertSubscriptionAccess,
  getSlotAccessContext,
} = require('./subscription-access');
const {
  expireActiveSubscriptions,
} = require('./subscription-validity');
const {
  createTrainingBooking,
  markTrainingBookingArrived,
  unmarkTrainingBookingArrived,
} = require('./booking-attendance');
const { addClientSearchConditions } = require('./client-search');
const { normalizePhone } = require('../utils/phones');

const CLUB_TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Vladivostok';
const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org/bot';
const MENU_BUTTONS = {
  schedule: '📅 Расписание',
  account: '👤 Личный кабинет',
};
const WEEKDAY_LABELS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function getClubDate(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDateKeyDays(dateKey, days) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0), 12));
  return date.toISOString().slice(0, 10);
}

function getCurrentWeekScheduleOffsets(dateKey = getClubDate()) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  const daysUntilSunday = weekday === 0 ? 0 : 7 - weekday;
  return Array.from({ length: daysUntilSunday + 1 }, (_, offset) => offset);
}

function normalizeScheduleOffset(offset = 0) {
  const parsed = Number.parseInt(String(offset || '0'), 10) || 0;
  const offsets = getCurrentWeekScheduleOffsets();
  return offsets.includes(parsed) ? parsed : 0;
}

function getWeekdayLabel(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return WEEKDAY_LABELS[weekday] || '';
}

function getScheduleOffset(dateValue) {
  const target = String(dateValue instanceof Date ? getClubDate(dateValue) : dateValue || '').slice(0, 10);
  const today = getClubDate();
  const targetMs = Date.parse(`${target}T12:00:00.000Z`);
  const todayMs = Date.parse(`${today}T12:00:00.000Z`);
  const offset = Math.round((targetMs - todayMs) / 86400000);
  return getCurrentWeekScheduleOffsets().includes(offset) ? offset : 0;
}

function formatTime(value) {
  const raw = String(value || '').trim();
  const timeOnlyMatch = raw.match(/^(\d{2}):(\d{2})/);
  if (timeOnlyMatch) {
    return `${timeOnlyMatch[1]}:${timeOnlyMatch[2]}`;
  }

  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: CLUB_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDate(value) {
  const raw = String(value || '').trim();
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[3]}.${dateOnlyMatch[2]}.${dateOnlyMatch[1]}`;
  }

  const date = value instanceof Date ? value : new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: CLUB_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildKeyboard(rows) {
  return { inline_keyboard: rows };
}

function buildMainReplyKeyboard() {
  return {
    keyboard: [[
      { text: MENU_BUTTONS.schedule },
      { text: MENU_BUTTONS.account },
    ]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function buildMiniAppKeyboard() {
  return buildKeyboard([[
    { text: 'Открыть личный кабинет', web_app: { url: getMiniAppUrl() } },
  ]]);
}

function getMiniAppUrl() {
  const baseUrl = process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'https://hardzone.space';
  return `${String(baseUrl).replace(/\/+$/, '')}/telegram/trainer`;
}

async function configureMenuButton() {
  await telegramRequest('setMyCommands', {
    commands: [{ command: 'start', description: 'Открыть главное меню' }],
  });

  return telegramRequest('setChatMenuButton', {
    menu_button: { type: 'commands' },
  });
}

async function telegramRequest(method, payload, options = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
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
    throw new Error(`Telegram ${method} failed: ${response.status} ${text.slice(0, 300)}`);
  }

  const body = await response.json();
  if (body && body.ok === false) {
    throw new Error(`Telegram ${method} failed: ${body.description || 'unknown error'}`);
  }

  return body;
}

function sendMessage(chatId, text, replyMarkup = null) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function sendReplyPrompt(chatId, text) {
  return telegramRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { force_reply: true, selective: true },
  });
}

function buildContactKeyboard() {
  return {
    keyboard: [[{ text: 'Поделиться телефоном', request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function editMessage(chatId, messageId, text, replyMarkup = null) {
  return telegramRequest('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  }).catch((error) => {
    if (error.message.includes('message is not modified')) {
      return null;
    }
    throw error;
  });
}

function answerCallback(callbackQueryId, text = null, options = {}) {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
    ...(options.showAlert ? { show_alert: true } : {}),
  });
}

async function findStaffByTelegramId(telegramId) {
  const { rows } = await pool.query(
    `
      SELECT id, name, role, username, is_active, module_grants, module_revokes
      FROM users
      WHERE telegram_id = $1
      LIMIT 1
    `,
    [String(telegramId)]
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    return null;
  }

  return {
    id: Number(user.id),
    name: user.name,
    role: user.role,
    username: user.username,
    modules: resolveModules(user.role, user.module_grants, user.module_revokes),
  };
}

async function linkStaffByPhone(telegramId, phone) {
  const phoneNormalized = normalizePhone(phone);

  if (!phoneNormalized) {
    return { status: 'invalid_phone' };
  }

  const { rows } = await pool.query(
    `
      SELECT id, name, role, username, is_active, module_grants, module_revokes
      FROM users
      WHERE phone_normalized = $1
        AND is_active = true
      ORDER BY id
    `,
    [phoneNormalized]
  );

  if (rows.length === 0) {
    return { status: 'not_found', phone_normalized: phoneNormalized };
  }

  if (rows.length > 1) {
    return { status: 'duplicate', phone_normalized: phoneNormalized };
  }

  const user = rows[0];
  await pool.query(
    `
      UPDATE users
      SET telegram_id = $1,
          phone = COALESCE(NULLIF(phone, ''), $2),
          phone_normalized = $3,
          updated_at = NOW()
      WHERE id = $4
    `,
    [String(telegramId), phone, phoneNormalized, user.id]
  );

  return {
    status: 'linked',
    staff: {
      id: Number(user.id),
      name: user.name,
      role: user.role,
      username: user.username,
      modules: resolveModules(user.role, user.module_grants, user.module_revokes),
    },
  };
}

function requireStaffModule(staff, permission) {
  if (!hasModuleAccess(staff, permission)) {
    const error = new Error('Недостаточно прав');
    error.statusCode = 403;
    throw error;
  }
}

async function getScheduleDaySlots(staff, dayOffset = 0) {
  requireStaffModule(staff, 'schedule');
  const offset = normalizeScheduleOffset(dayOffset);
  const date = addDateKeyDays(getClubDate(), offset);

  const { rows } = await pool.query(
    `
      SELECT
        s.id,
        s.slot_type,
        s.date,
        s.start_time,
        s.duration_minutes,
        s.capacity,
        s.booked_count,
        tt.name AS training_type_name,
        tr.first_name || ' ' || tr.last_name AS trainer_name,
        (
          SELECT COUNT(*)::INT
          FROM bookings b
          WHERE b.slot_id = s.id
            AND b.status IN ('confirmed', 'attended')
        ) AS booked_clients_count,
        (
          SELECT COUNT(*)::INT
          FROM bookings b
          WHERE b.slot_id = s.id AND b.status = 'attended'
        ) AS attended_count
      FROM schedule_slots s
      LEFT JOIN training_types tt ON tt.id = s.training_type_id
      LEFT JOIN trainers tr ON tr.id = s.trainer_id
      WHERE s.date = $1::date
        AND s.status != 'cancelled'
      ORDER BY s.start_time, s.id
    `,
    [date]
  );

  return { date, offset, slots: rows };
}

function getTodaySlots(staff) {
  return getScheduleDaySlots(staff, 0);
}

async function getSlotBookings(staff, slotId) {
  requireStaffModule(staff, 'schedule');

  const { rows: slotRows } = await pool.query(
    `
      SELECT
        s.id,
        s.date,
        s.start_time,
        s.duration_minutes,
        s.capacity,
        s.booked_count,
        tt.name AS training_type_name,
        tr.first_name || ' ' || tr.last_name AS trainer_name
      FROM schedule_slots s
      LEFT JOIN training_types tt ON tt.id = s.training_type_id
      LEFT JOIN trainers tr ON tr.id = s.trainer_id
      WHERE s.id = $1
      LIMIT 1
    `,
    [slotId]
  );

  if (!slotRows[0]) {
    return null;
  }

  const { rows: bookings } = await pool.query(
    `
      SELECT
        b.id,
        b.status,
        b.subscription_id,
        c.id AS client_id,
        c.first_name || ' ' || c.last_name AS client_name,
        c.phone AS client_phone,
        cs.type AS subscription_type,
        cs.status AS subscription_status,
        cs.visits_left,
        cs.expires_at
      FROM bookings b
      JOIN clients c ON c.id = b.client_id
      LEFT JOIN client_subscriptions cs ON cs.id = b.subscription_id
      WHERE b.slot_id = $1
        AND b.status IN ('confirmed', 'attended')
      ORDER BY b.created_at, b.id
    `,
    [slotId]
  );

  return { slot: slotRows[0], bookings };
}

async function searchClients(staff, search, limit = 5, slotId = null) {
  requireStaffModule(staff, 'clients');
  const tokens = String(search || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.join('').length < 2) {
    return [];
  }

  await expireActiveSubscriptions(pool);

  const params = [];
  const conditions = [];
  addClientSearchConditions({ search, params, conditions, includeEmail: false });

  if (conditions.length === 0) {
    return [];
  }

  params.push(limit);

  const { rows } = await pool.query(
    `
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.phone,
        cs.id AS subscription_id,
        cs.type AS subscription_type,
        cs.status AS subscription_status,
        cs.visits_left,
        cs.expires_at
      FROM clients c
      LEFT JOIN client_subscriptions cs
        ON cs.client_id = c.id
        AND cs.status IN ('active', 'frozen')
      WHERE ${conditions.join(' AND ')}
      ORDER BY c.last_name, c.first_name
      LIMIT $${params.length}
    `,
    params
  );

  if (!slotId) {
    return rows;
  }

  const context = await getSlotAccessContext(pool, slotId);
  const checkedRows = [];

  for (const row of rows) {
    if (!row.subscription_id) {
      checkedRows.push({ ...row, is_eligible: false });
      continue;
    }

    try {
      await assertSubscriptionAccess(pool, {
        subscriptionId: row.subscription_id,
        clientId: row.id,
        context,
      });
      checkedRows.push({ ...row, is_eligible: true });
    } catch (error) {
      if (![404, 409].includes(error.statusCode)) {
        throw error;
      }
      checkedRows.push({ ...row, is_eligible: false });
    }
  }

  return checkedRows;
}

async function createBooking(staff, slotId, clientId, subscriptionId = null, allowUnpaid = false) {
  requireStaffModule(staff, 'schedule_clients');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await createTrainingBooking(client, {
      slotId,
      clientId,
      subscriptionId: subscriptionId || null,
      bookedBy: `telegram:${staff.username || staff.id}`,
      allowUnpaid,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markBookingAsAttended(staff, bookingId) {
  requireStaffModule(staff, 'schedule_attendance');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const booking = await markTrainingBookingArrived(client, {
      bookingId,
      createdBy: `telegram:${staff.username || staff.id}`,
    });
    await client.query('COMMIT');
    return booking.slot_id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function markBookingAsUnattended(staff, bookingId) {
  requireStaffModule(staff, 'schedule_attendance');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const booking = await unmarkTrainingBookingArrived(client, bookingId);
    await client.query('COMMIT');
    return booking.slot_id;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function renderMainMenu(staff) {
  return {
    text: [
      `👋 Привет, ${escapeHtml(staff.name)}!`,
      '',
      'Это бот сотрудников HardZone.',
      'Здесь можно работать с расписанием и записями клиентов или открыть личный кабинет.',
      '',
      'Выберите нужный раздел на клавиатуре ниже.',
    ].join('\n'),
    keyboard: buildMainReplyKeyboard(),
  };
}

function renderScheduleDay(date, slots, dayOffset = 0) {
  const rows = slots.map((slot) => [{
    text: `${formatTime(slot.start_time)} ${slot.training_type_name || 'Занятие'} (${slot.booked_clients_count}/${slot.capacity})`,
    callback_data: `slot:${slot.id}`,
  }]);
  const dayButtons = getCurrentWeekScheduleOffsets().map((offset) => ({
    text: `${Number(offset) === Number(dayOffset) ? '● ' : ''}${getWeekdayLabel(addDateKeyDays(getClubDate(), offset))}`,
    callback_data: `schedule:${offset}`,
  }));
  for (let index = 0; index < dayButtons.length; index += 2) {
    rows.push(dayButtons.slice(index, index + 2));
  }

  return {
    text: slots.length
      ? `<b>Расписание: ${escapeHtml(getWeekdayLabel(date))}, ${escapeHtml(formatDate(date))}</b>\n\nВыберите занятие:`
      : `<b>Расписание: ${escapeHtml(getWeekdayLabel(date))}, ${escapeHtml(formatDate(date))}</b>\n\nНа этот день занятий нет.`,
    keyboard: buildKeyboard(rows),
  };
}

function renderToday(date, slots) {
  return renderScheduleDay(date, slots, 0);
}

function renderSlot(data) {
  const slot = data.slot;
  const scheduleOffset = getScheduleOffset(slot.date);
  const lines = [
    `<b>${escapeHtml(slot.training_type_name || 'Занятие')}</b>`,
    `${escapeHtml(formatDate(slot.date))}, ${formatTime(slot.start_time)}`,
    slot.trainer_name ? `Тренер: ${escapeHtml(slot.trainer_name)}` : null,
    `Записано: ${data.bookings.length}/${slot.capacity}`,
    '',
    'Чтобы записать клиента, нажми кнопку ниже.',
  ].filter(Boolean);

  const rows = data.bookings.map((booking) => {
    const icon = booking.status === 'attended' ? '✓' : '•';
    const action = booking.status === 'attended'
      ? { text: 'Снять', callback_data: `unatt:${booking.id}` }
      : { text: 'Отметить', callback_data: `att:${booking.id}` };

    return [
      { text: `${icon} ${booking.client_name}`, callback_data: `noop:${booking.id}` },
      action,
    ];
  });

  rows.push([{ text: 'Добавить клиента', callback_data: `find:${slot.id}` }]);
  rows.push([{ text: 'Назад к расписанию', callback_data: `schedule:${scheduleOffset}` }]);

  return {
    text: lines.join('\n'),
    keyboard: buildKeyboard(rows),
  };
}

function parseFindReplySlotId(message) {
  const prompt = String(message.reply_to_message?.text || '');
  const match = prompt.match(/Занятие №(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function renderClientSearch(slotId, clients) {
  if (clients.length === 0) {
    return {
      text: 'Клиенты не найдены.',
      keyboard: buildKeyboard([[{ text: 'К занятию', callback_data: `slot:${slotId}` }]]),
    };
  }

  return {
    text: 'Выбери подходящий абонемент или запиши клиента к оплате:',
    keyboard: buildKeyboard([
      ...clients.filter((client) => client.is_eligible !== false).map((client) => {
        const sub = client.subscription_id || 0;
        const visits = client.visits_left === null || client.visits_left === undefined ? '' : `, ${client.visits_left} виз.`;
        return [{
          text: `${client.last_name} ${client.first_name} · ${client.subscription_type || 'абонемент'}${visits}`,
          callback_data: `book:${slotId}:${client.id}:${sub}`,
        }];
      }),
      ...Array.from(new Map(clients.map((client) => [String(client.id), client])).values()).map((client) => [{
        text: `К оплате · ${client.last_name} ${client.first_name}`,
        callback_data: `bookunpaid:${slotId}:${client.id}`,
      }]),
      [{ text: 'К занятию', callback_data: `slot:${slotId}` }],
    ]),
  };
}

async function renderSlotForStaff(staff, slotId) {
  const data = await getSlotBookings(staff, slotId);
  if (!data) {
    return {
      text: 'Занятие не найдено.',
      keyboard: buildKeyboard([[{ text: 'К расписанию', callback_data: 'schedule:0' }]]),
    };
  }
  return renderSlot(data);
}

async function sendPhoneLinkRequest(chatId) {
  return sendMessage(
    chatId,
    'Для входа в бот HardZone нажмите кнопку ниже и поделитесь телефоном.\n\nЕсли этот номер есть в CRM у активного сотрудника, бот привяжет аккаунт автоматически.',
    buildContactKeyboard()
  );
}

async function handleContactMessage(message) {
  const chatId = message.chat?.id;
  const telegramId = message.from?.id;
  const contact = message.contact;

  if (!chatId || !telegramId || !contact?.phone_number) {
    return;
  }

  if (Number(contact.user_id) !== Number(telegramId)) {
    await sendMessage(chatId, 'Нужно поделиться своим телефоном через кнопку, а не переслать чужой контакт.', buildContactKeyboard());
    return;
  }

  const result = await linkStaffByPhone(telegramId, contact.phone_number);

  if (result.status === 'linked') {
    const menu = renderMainMenu(result.staff);
    await sendMessage(chatId, `Телефон подтвержден. ${menu.text}`, menu.keyboard);
    return;
  }

  if (result.status === 'duplicate') {
    await sendMessage(chatId, 'В CRM найдено несколько активных сотрудников с таким телефоном. Автоматическая привязка остановлена, обратитесь к администратору.');
    return;
  }

  await sendMessage(chatId, 'Телефон не найден среди активных сотрудников CRM. Проверьте номер в карточке сотрудника или обратитесь к администратору.', buildContactKeyboard());
}

async function handleMessage(message) {
  const chatId = message.chat?.id;
  const telegramId = message.from?.id;
  if (!chatId || !telegramId) {
    return;
  }

  if (message.contact) {
    await handleContactMessage(message);
    return;
  }

  const staff = await findStaffByTelegramId(telegramId);
  if (!staff) {
    await sendPhoneLinkRequest(chatId);
    return;
  }

  const text = String(message.text || '').trim();
  const replySlotId = parseFindReplySlotId(message);

  if (Number.isInteger(replySlotId)) {
    const clients = await searchClients(staff, text, 5, replySlotId);
    const view = renderClientSearch(replySlotId, clients);
    await sendMessage(chatId, view.text, view.keyboard);
    return;
  }

  if (text.startsWith('/find')) {
    const [, slotIdRaw, ...searchParts] = text.split(/\s+/);
    const slotId = Number.parseInt(slotIdRaw, 10);
    const search = searchParts.join(' ');

    if (!Number.isInteger(slotId) || !search) {
      await sendMessage(chatId, 'Формат поиска: <code>/find ID_занятия фамилия или телефон</code>');
      return;
    }

    const clients = await searchClients(staff, search);
    const view = renderClientSearch(slotId, clients);
    await sendMessage(chatId, view.text, view.keyboard);
    return;
  }

  if (text === MENU_BUTTONS.schedule) {
    const schedule = await getScheduleDaySlots(staff, 0);
    const view = renderScheduleDay(schedule.date, schedule.slots, schedule.offset);
    await sendMessage(chatId, view.text, view.keyboard);
    return;
  }

  if (text === MENU_BUTTONS.account) {
    await sendMessage(
      chatId,
      'Откройте личный кабинет сотрудника для работы в приложении HardZone.',
      buildMiniAppKeyboard()
    );
    return;
  }

  const menu = renderMainMenu(staff);
  await sendMessage(chatId, menu.text, menu.keyboard);
}

async function handleCallback(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  const telegramId = callbackQuery.from?.id;
  const data = String(callbackQuery.data || '');

  if (!chatId || !messageId || !telegramId) {
    return;
  }

  const staff = await findStaffByTelegramId(telegramId);
  if (!staff) {
    await answerCallback(callbackQuery.id, 'Telegram не привязан');
    await sendPhoneLinkRequest(chatId);
    return;
  }

  if (data === 'today' || data.startsWith('schedule:')) {
    const offset = data === 'today' ? 0 : normalizeScheduleOffset(data.split(':')[1]);
    const schedule = await getScheduleDaySlots(staff, offset);
    const view = renderScheduleDay(schedule.date, schedule.slots, schedule.offset);
    await editMessage(chatId, messageId, view.text, view.keyboard);
    await answerCallback(callbackQuery.id);
    return;
  }

  if (data.startsWith('slot:')) {
    const slotId = Number.parseInt(data.split(':')[1], 10);
    const view = await renderSlotForStaff(staff, slotId);
    await editMessage(chatId, messageId, view.text, view.keyboard);
    await answerCallback(callbackQuery.id);
    return;
  }

  if (data.startsWith('find:')) {
    const slotId = Number.parseInt(data.split(':')[1], 10);
    await answerCallback(callbackQuery.id);
    await sendReplyPrompt(
      chatId,
      `Занятие №${slotId}. Введи фамилию, имя или телефон клиента.`
    );
    return;
  }

  if (data.startsWith('att:')) {
    const bookingId = Number.parseInt(data.split(':')[1], 10);
    const slotId = await markBookingAsAttended(staff, bookingId);
    const view = await renderSlotForStaff(staff, slotId);
    await editMessage(chatId, messageId, view.text, view.keyboard);
    await answerCallback(callbackQuery.id, 'Посещение отмечено');
    return;
  }

  if (data.startsWith('book:')) {
    const [, slotIdRaw, clientIdRaw, subscriptionIdRaw] = data.split(':');
    const slotId = Number.parseInt(slotIdRaw, 10);
    const clientId = Number.parseInt(clientIdRaw, 10);
    const subscriptionId = Number.parseInt(subscriptionIdRaw, 10);
    try {
      await createBooking(staff, slotId, clientId, subscriptionId > 0 ? subscriptionId : null);
      const view = await renderSlotForStaff(staff, slotId);
      await editMessage(chatId, messageId, view.text, view.keyboard);
      await answerCallback(callbackQuery.id, 'Клиент записан');
    } catch (error) {
      await answerCallback(callbackQuery.id, String(error.message || 'Не удалось записать клиента').slice(0, 200), { showAlert: true });
    }
    return;
  }

  if (data.startsWith('bookunpaid:')) {
    const [, slotIdRaw, clientIdRaw] = data.split(':');
    const slotId = Number.parseInt(slotIdRaw, 10);
    const clientId = Number.parseInt(clientIdRaw, 10);
    try {
      await createBooking(staff, slotId, clientId, null, true);
      const view = await renderSlotForStaff(staff, slotId);
      await editMessage(chatId, messageId, view.text, view.keyboard);
      await answerCallback(callbackQuery.id, 'Клиент записан к оплате');
    } catch (error) {
      await answerCallback(callbackQuery.id, String(error.message || 'Не удалось записать клиента').slice(0, 200), { showAlert: true });
    }
    return;
  }

  if (data.startsWith('unatt:')) {
    const bookingId = Number.parseInt(data.split(':')[1], 10);
    const slotId = await markBookingAsUnattended(staff, bookingId);
    const view = await renderSlotForStaff(staff, slotId);
    await editMessage(chatId, messageId, view.text, view.keyboard);
    await answerCallback(callbackQuery.id, 'Посещение снято');
    return;
  }

  await answerCallback(callbackQuery.id);
}

async function handleTelegramUpdate(update) {
  if (update.message) {
    await handleMessage(update.message);
    return;
  }

  if (update.callback_query) {
    await handleCallback(update.callback_query);
  }
}

module.exports = {
  configureMenuButton,
  handleTelegramUpdate,
  findStaffByTelegramId,
  formatDate,
  formatTime,
  getCurrentWeekScheduleOffsets,
  getTodaySlots,
  parseFindReplySlotId,
  renderClientSearch,
  renderMainMenu,
  renderScheduleDay,
  renderToday,
  renderSlot,
  telegramRequest,
};
