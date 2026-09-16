const { createHash, timingSafeEqual } = require('node:crypto');

const DEFAULT_BASE_URL = 'https://securepay.tinkoff.ru/v2';
const VALID_TAXATIONS = new Set(['osn', 'usn_income', 'usn_income_outcome', 'esn', 'patent']);
const VALID_TAXES = new Set(['none', 'vat0', 'vat5', 'vat7', 'vat10', 'vat22', 'vat105', 'vat107', 'vat110', 'vat122']);

function configurationError(message) {
  return Object.assign(new Error(message), { statusCode: 503 });
}

function getTbankCompetitionConfig() {
  const enabled = String(process.env.COMPETITION_PAYMENT_ENABLED || 'false').toLowerCase() === 'true';
  const terminalKey = String(process.env.TBANK_TERMINAL_KEY || '').trim();
  const password = String(process.env.TBANK_TERMINAL_PASSWORD || '').trim();
  const taxation = String(process.env.TBANK_TAXATION || 'usn_income').trim();
  const tax = String(process.env.TBANK_VAT || 'none').trim();
  const publicBaseUrl = String(
    process.env.COMPETITION_PUBLIC_BASE_URL
      || process.env.FRONTEND_BASE_URL
      || process.env.APP_BASE_URL
      || ''
  ).trim().replace(/\/$/, '');

  return {
    enabled,
    terminalKey,
    password,
    taxation,
    tax,
    publicBaseUrl,
    baseUrl: String(process.env.TBANK_ACQUIRING_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, ''),
  };
}

function assertTbankCompetitionConfigured(config = getTbankCompetitionConfig()) {
  if (!config.enabled) throw configurationError('Онлайн-оплата пока не включена');
  if (!config.terminalKey || !config.password) throw configurationError('Не настроен терминал Т-Банка');
  if (!VALID_TAXATIONS.has(config.taxation)) throw configurationError('Не настроена система налогообложения для чека');
  if (!VALID_TAXES.has(config.tax)) throw configurationError('Не настроена ставка НДС для чека');
  if (!/^https:\/\//i.test(config.publicBaseUrl)) throw configurationError('Не настроен публичный адрес страницы оплаты');
  return config;
}

function buildTbankToken(payload, password) {
  const excludedKeys = new Set(['Token', 'DATA', 'Data', 'Receipt']);
  const values = Object.entries({ ...payload, Password: password })
    .filter(([key, value]) => !excludedKeys.has(key) && value !== null && value !== undefined && typeof value !== 'object')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, value]) => String(value))
    .join('');

  return createHash('sha256').update(values, 'utf8').digest('hex');
}

function verifyTbankToken(payload, password) {
  const received = String(payload?.Token || '').toLowerCase();
  const expected = buildTbankToken(payload || {}, password);
  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function callTbank(method, payload, config = assertTbankCompetitionConfigured()) {
  const body = {
    ...payload,
    Token: buildTbankToken(payload, config.password),
  };
  const response = await fetch(`${config.baseUrl}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw Object.assign(new Error('Т-Банк вернул некорректный ответ'), { providerCode: 'INVALID_RESPONSE' });
  }

  if (!response.ok || data.Success !== true) {
    const message = String(data.Message || data.Details || 'Т-Банк не выполнил запрос');
    throw Object.assign(new Error(message), {
      providerCode: String(data.ErrorCode || response.status || 'TBANK_ERROR'),
    });
  }

  return data;
}

function buildCompetitionInitPayload({ registration, orderId, amountKopecks }, config) {
  const resultUrl = `${config.publicBaseUrl}/competition/payment?registration=${encodeURIComponent(registration.public_token)}`;
  const receiptPhone = `+${String(registration.male_phone || '').replace(/\D/g, '')}`;
  return {
    TerminalKey: config.terminalKey,
    Amount: amountKopecks,
    OrderId: orderId,
    Description: `Взнос за участие команды «${registration.team_name}»`.slice(0, 140),
    PayType: 'O',
    ...(registration.payment_deadline ? { RedirectDueDate: new Date(registration.payment_deadline).toISOString().replace('.000Z', '+00:00').replace(/\.\d{3}Z$/, '+00:00') } : {}),
    Language: 'ru',
    NotificationURL: `${config.publicBaseUrl}/api/public/competition/payments/tbank/notification`,
    SuccessURL: resultUrl,
    FailURL: `${resultUrl}&result=fail`,
    DATA: {
      registration: String(registration.id),
    },
    Receipt: {
      Phone: receiptPhone,
      ...(registration.team_email ? { Email: registration.team_email } : {}),
      Taxation: config.taxation,
      Items: [
        {
          Name: registration.event_name ? `Организационный взнос: ${registration.event_name}`.slice(0,128) : 'Организационный взнос за участие в HardZone Challenge Team',
          Price: amountKopecks,
          Quantity: 1,
          Amount: amountKopecks,
          Tax: config.tax,
          PaymentMethod: 'full_payment',
          PaymentObject: 'service',
        },
      ],
    },
  };
}

async function initCompetitionPayment({ registration, orderId, amountKopecks }) {
  const config = assertTbankCompetitionConfigured();
  const payload = buildCompetitionInitPayload({ registration, orderId, amountKopecks }, config);
  const response = await callTbank('Init', payload, config);
  if (!response.PaymentId || !response.PaymentURL) {
    throw Object.assign(new Error('Т-Банк не вернул ссылку на оплату'), { providerCode: 'MISSING_PAYMENT_URL' });
  }
  return response;
}

async function getCompetitionPaymentState(paymentId) {
  const config = assertTbankCompetitionConfigured();
  return callTbank('GetState', {
    TerminalKey: config.terminalKey,
    PaymentId: String(paymentId),
  }, config);
}

function normalizeCompetitionPaymentStatus(providerStatus) {
  const status = String(providerStatus || '').toUpperCase();
  if (status === 'CONFIRMED') return 'paid';
  if (status === 'REFUNDED' || status === 'PARTIAL_REFUNDED') return 'refunded';
  if (['REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'REVERSED', 'AUTH_FAIL'].includes(status)) return 'failed';
  if (status) return 'processing';
  return 'pending';
}

module.exports = {
  assertTbankCompetitionConfigured,
  buildCompetitionInitPayload,
  buildTbankToken,
  getCompetitionPaymentState,
  getTbankCompetitionConfig,
  initCompetitionPayment,
  normalizeCompetitionPaymentStatus,
  verifyTbankToken,
};
