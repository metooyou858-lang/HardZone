const logger = require('./logger');

const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org/bot';

function getClientMiniAppUrl() {
  const baseUrl = process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'https://hardzone.space';
  return `${String(baseUrl).replace(/\/+$/, '')}/telegram/client`;
}

function configureClientMenuButton() {
  return telegramClientRequest('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Открыть HardZone',
      web_app: { url: getClientMiniAppUrl() },
    },
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

function sendClientMessage(chatId, text, replyMarkup = null) {
  return telegramClientRequest('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

function buildClientMiniAppKeyboard() {
  return {
    inline_keyboard: [[
      {
        text: 'Открыть HardZone',
        web_app: { url: getClientMiniAppUrl() },
      },
    ]],
  };
}

async function handleClientMessage(message) {
  const chatId = message.chat?.id;
  if (!chatId) {
    return;
  }

  await sendClientMessage(
    chatId,
    [
      '<b>HardZone</b>',
      '',
      'Откройте личный кабинет, чтобы посмотреть абонемент, свои записи и записаться на тренировку.',
    ].join('\n'),
    buildClientMiniAppKeyboard()
  );
}

async function handleTelegramClientUpdate(update) {
  if (update.message) {
    await handleClientMessage(update.message);
    return;
  }

  if (update.callback_query?.id) {
    await telegramClientRequest('answerCallbackQuery', { callback_query_id: update.callback_query.id }).catch((error) => {
      logger.warn('telegram_client', {
        action: 'answer_callback_failed',
        message: error.message,
      });
    });
  }
}

module.exports = {
  configureClientMenuButton,
  handleTelegramClientUpdate,
  telegramClientRequest,
};
