const { resolveModules, hasModuleAccess } = require('../authz');
const { pool } = require('../db');
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

function formatTime(value) {
  return String(value || '').slice(0, 5);
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

function getMiniAppUrl() {
  const baseUrl = process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'https://hardzone.space';
  return `${String(baseUrl).replace(/\/+$/, '')}/telegram/trainer`;
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

function answerCallback(callbackQueryId, text = null) {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
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

async function getTodaySlots(staff) {
  requireStaffModule(staff, 'schedule');
  const date = getClubDate();

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
          WHERE b.slot_id = s.id AND b.status = 'confirmed'
        ) AS confirmed_count,
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

  return { date, slots: rows };
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

async function searchClients(staff, search, limit = 5) {
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

  return rows;
}

async function createBooking(staff, slotId, clientId, subscriptionId = null) {
  requireStaffModule(staff, 'schedule_clients');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await createTrainingBooking(client, {
      slotId,
      clientId,
      subscriptionId: subscriptionId || null,
      bookedBy: `telegram:${staff.username || staff.id}`,
      allowUnpaid: false,
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
    text: `Привет, ${escapeHtml(staff.name)}.\n\nВыбери действие:`,
    keyboard: buildKeyboard([
      [{ text: 'Открыть HardZone', web_app: { url: getMiniAppUrl() } }],
      [{ text: 'Сегодня', callback_data: 'today' }],
    ]),
  };
}

function renderToday(date, slots) {
  if (slots.length === 0) {
    return {
      text: `На ${escapeHtml(date)} занятий нет.`,
      keyboard: buildKeyboard([[{ text: 'Обновить', callback_data: 'today' }]]),
    };
  }

  return {
    text: `Занятия на ${escapeHtml(date)}:`,
    keyboard: buildKeyboard(
      slots.map((slot) => [{
        text: `${formatTime(slot.start_time)} ${slot.training_type_name || 'Занятие'} (${slot.confirmed_count}/${slot.capacity})`,
        callback_data: `slot:${slot.id}`,
      }])
    ),
  };
}

function renderSlot(data) {
  const slot = data.slot;
  const lines = [
    `<b>${escapeHtml(slot.training_type_name || 'Занятие')}</b>`,
    `${escapeHtml(slot.date)} ${formatTime(slot.start_time)}`,
    slot.trainer_name ? `Тренер: ${escapeHtml(slot.trainer_name)}` : null,
    `Записано: ${data.bookings.length}/${slot.capacity}`,
    '',
    'Чтобы найти и записать клиента:',
    `<code>/find ${slot.id} фамилия или телефон</code>`,
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

  rows.push([{ text: 'Назад', callback_data: 'today' }]);

  return {
    text: lines.join('\n'),
    keyboard: buildKeyboard(rows),
  };
}

function renderClientSearch(slotId, clients) {
  if (clients.length === 0) {
    return {
      text: 'Клиенты не найдены.',
      keyboard: buildKeyboard([[{ text: 'К занятию', callback_data: `slot:${slotId}` }]]),
    };
  }

  return {
    text: 'Выбери клиента для записи:',
    keyboard: buildKeyboard([
      ...clients.map((client) => {
        const sub = client.subscription_id || 0;
        const visits = client.visits_left === null || client.visits_left === undefined ? '' : `, ${client.visits_left} виз.`;
        return [{
          text: `${client.last_name} ${client.first_name}${visits}`,
          callback_data: `book:${slotId}:${client.id}:${sub}`,
        }];
      }),
      [{ text: 'К занятию', callback_data: `slot:${slotId}` }],
    ]),
  };
}

async function renderSlotForStaff(staff, slotId) {
  const data = await getSlotBookings(staff, slotId);
  if (!data) {
    return {
      text: 'Занятие не найдено.',
      keyboard: buildKeyboard([[{ text: 'Сегодня', callback_data: 'today' }]]),
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

  if (data === 'today') {
    const today = await getTodaySlots(staff);
    const view = renderToday(today.date, today.slots);
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
    await createBooking(staff, slotId, clientId, subscriptionId > 0 ? subscriptionId : null);
    const view = await renderSlotForStaff(staff, slotId);
    await editMessage(chatId, messageId, view.text, view.keyboard);
    await answerCallback(callbackQuery.id, 'Клиент записан');
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
  handleTelegramUpdate,
  findStaffByTelegramId,
  getTodaySlots,
  telegramRequest,
};
