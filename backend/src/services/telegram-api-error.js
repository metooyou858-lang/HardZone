class TelegramApiError extends Error {
  constructor(message, { status = null, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'TelegramApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

async function createTelegramApiError(response, label, method) {
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Telegram or an upstream proxy may return a non-JSON error page.
  }

  const retryAfterSeconds = Number(body?.parameters?.retry_after);
  const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
    ? Math.min(retryAfterSeconds * 1000, 5 * 60 * 1000)
    : null;
  const description = body?.description || text.slice(0, 300) || 'unknown error';

  return new TelegramApiError(
    `${label} ${method} failed: ${response.status} ${description}`,
    { status: response.status, retryAfterMs }
  );
}

function getTelegramRetryDelayMs(error, fallbackMs = 5000) {
  const retryAfterMs = Number(error?.retryAfterMs);
  return Number.isFinite(retryAfterMs) && retryAfterMs > 0
    ? Math.min(retryAfterMs, 5 * 60 * 1000)
    : fallbackMs;
}

module.exports = { TelegramApiError, createTelegramApiError, getTelegramRetryDelayMs };
