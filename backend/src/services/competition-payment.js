const { randomBytes } = require('node:crypto');

const { pool, withTransaction } = require('../db');
const logger = require('./logger');
const {
  getCompetitionPaymentState,
  getTbankCompetitionConfig,
  initCompetitionPayment,
  normalizeCompetitionPaymentStatus,
  verifyTbankToken,
} = require('./tbank-competition');
const {
  getCompetitionPublicConfig,
  getCompetitionRegistrationByPublicToken,
} = require('./competition-registration');

function notFound(message) {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function paymentOrderId(registrationId) {
  const suffix = randomBytes(5).toString('hex');
  return `HZC-${registrationId}-${Date.now()}-${suffix}`;
}

async function refreshRegistrationPaymentStatus(registrationId, executor = pool) {
  const { rows } = await executor.query(
    `SELECT
       CASE
         WHEN BOOL_OR(status = 'CONFIRMED') THEN 'paid'
         WHEN BOOL_OR(status IN ('REFUNDED', 'PARTIAL_REFUNDED')) THEN 'refunded'
         WHEN BOOL_OR(status NOT IN ('REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'REVERSED', 'FAILED')) THEN 'processing'
         ELSE 'failed'
       END AS payment_status,
       MIN(confirmed_at) FILTER (WHERE confirmed_at IS NOT NULL) AS paid_at
     FROM competition_payments
     WHERE registration_id = $1`,
    [registrationId]
  );
  const paymentStatus = rows[0]?.payment_status || 'pending';
  const paidAt = rows[0]?.paid_at || null;

  await executor.query(
    `UPDATE competition_registrations
     SET payment_status = $1,
         paid_at = COALESCE($2, paid_at),
         updated_at = NOW()
     WHERE id = $3`,
    [paymentStatus, paidAt, registrationId]
  );
  return paymentStatus;
}

async function startCompetitionPayment(publicToken) {
  const competition = getCompetitionPublicConfig();
  if (!competition.payment_enabled || !competition.fee_rubles) {
    throw Object.assign(new Error('Онлайн-оплата пока не включена'), { statusCode: 503 });
  }

  let providerError = null;
  const result = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`competition-payment:${publicToken}`]);
    const registration = await getCompetitionRegistrationByPublicToken(publicToken, client);
    if (!registration) throw notFound('Заявка не найдена');
    if (registration.status !== 'registered') {
      throw Object.assign(new Error('Эта регистрация отменена'), { statusCode: 409 });
    }
    if (registration.payment_status === 'paid') {
      return { registration, already_paid: true, payment_url: null };
    }

    const activeResult = await client.query(
      `SELECT id, payment_url
       FROM competition_payments
       WHERE registration_id = $1
         AND payment_url IS NOT NULL
         AND status NOT IN ('REJECTED', 'CANCELED', 'DEADLINE_EXPIRED', 'REVERSED', 'REFUNDED', 'PARTIAL_REFUNDED', 'FAILED')
         AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [registration.id]
    );
    if (activeResult.rows[0]) {
      return { registration, already_paid: false, payment_url: activeResult.rows[0].payment_url };
    }

    const amountKopecks = competition.fee_rubles * 100;
    const orderId = paymentOrderId(registration.id);
    const paymentInsert = await client.query(
      `INSERT INTO competition_payments (registration_id, order_id, amount_kopecks, status)
       VALUES ($1, $2, $3, 'INITIATING')
       RETURNING id`,
      [registration.id, orderId, amountKopecks]
    );
    const paymentRowId = paymentInsert.rows[0].id;

    try {
      const providerPayment = await initCompetitionPayment({ registration, orderId, amountKopecks });
      await client.query(
        `UPDATE competition_payments
         SET payment_id = $1, payment_url = $2, status = $3, error_code = NULL, updated_at = NOW()
         WHERE id = $4`,
        [String(providerPayment.PaymentId), providerPayment.PaymentURL, String(providerPayment.Status || 'NEW'), paymentRowId]
      );
      await refreshRegistrationPaymentStatus(registration.id, client);
      return { registration, already_paid: false, payment_url: providerPayment.PaymentURL };
    } catch (error) {
      providerError = error;
      await client.query(
        `UPDATE competition_payments
         SET status = 'FAILED', error_code = $1, updated_at = NOW()
         WHERE id = $2`,
        [String(error.providerCode || 'TBANK_ERROR').slice(0, 120), paymentRowId]
      );
      await refreshRegistrationPaymentStatus(registration.id, client);
      return { registration, already_paid: false, payment_url: null };
    }
  });

  if (providerError) {
    logger.error('competition-payment-init', {
      registrationId: result.registration.id,
      providerCode: providerError.providerCode || 'TBANK_ERROR',
      message: providerError.message,
    });
    throw Object.assign(new Error('Заявка сохранена, но Т-Банк пока не открыл оплату. Попробуйте ещё раз.'), {
      statusCode: 502,
      publicToken: result.registration.public_token,
    });
  }
  return result;
}

async function findCompetitionPayment({ orderId, paymentId }, executor = pool) {
  const { rows } = await executor.query(
    `SELECT id, registration_id, order_id, payment_id, amount_kopecks, status
     FROM competition_payments
     WHERE ($1::TEXT IS NOT NULL AND order_id = $1)
        OR ($2::TEXT IS NOT NULL AND payment_id = $2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [orderId || null, paymentId || null]
  );
  return rows[0] || null;
}

async function syncCompetitionPayment(payment) {
  const state = await getCompetitionPaymentState(payment.payment_id);
  if (
    String(state.PaymentId || '') !== String(payment.payment_id)
    || String(state.OrderId || '') !== String(payment.order_id)
    || Number(state.Amount) !== Number(payment.amount_kopecks)
  ) {
    throw new Error('Т-Банк вернул несовпадающие данные платежа');
  }

  const providerStatus = String(state.Status || 'UNKNOWN').toUpperCase();
  const normalizedStatus = normalizeCompetitionPaymentStatus(providerStatus);
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE competition_payments
       SET status = $1,
           error_code = NULLIF($2, '0'),
           confirmed_at = CASE WHEN $1 = 'CONFIRMED' THEN COALESCE(confirmed_at, NOW()) ELSE confirmed_at END,
           updated_at = NOW()
       WHERE id = $3`,
      [providerStatus, String(state.ErrorCode || ''), payment.id]
    );
    await refreshRegistrationPaymentStatus(payment.registration_id, client);
  });
  return normalizedStatus;
}

async function handleTbankCompetitionNotification(payload) {
  const config = getTbankCompetitionConfig();
  if (!config.enabled || !config.terminalKey || !config.password) {
    throw Object.assign(new Error('Терминал Т-Банка не настроен'), { statusCode: 503 });
  }
  if (String(payload?.TerminalKey || '') !== config.terminalKey || !verifyTbankToken(payload, config.password)) {
    throw Object.assign(new Error('Некорректная подпись уведомления'), { statusCode: 403 });
  }

  const payment = await findCompetitionPayment({
    orderId: String(payload.OrderId || '').trim(),
    paymentId: String(payload.PaymentId || '').trim(),
  });
  if (!payment) return { known: false };

  if (!payment.payment_id && payload.PaymentId) {
    await pool.query(
      `UPDATE competition_payments SET payment_id = $1, updated_at = NOW() WHERE id = $2`,
      [String(payload.PaymentId), payment.id]
    );
    payment.payment_id = String(payload.PaymentId);
  }
  if (!payment.payment_id) throw new Error('В уведомлении отсутствует идентификатор платежа');

  const paymentStatus = await syncCompetitionPayment(payment);
  return { known: true, registrationId: payment.registration_id, paymentStatus };
}

async function getCompetitionPaymentSummary(publicToken, { sync = false } = {}) {
  let registration = await getCompetitionRegistrationByPublicToken(publicToken);
  if (!registration) throw notFound('Заявка не найдена');

  let payment = await findCompetitionPaymentForRegistration(registration.id);
  if (sync && payment?.payment_id && !['paid', 'refunded'].includes(registration.payment_status)) {
    try {
      await syncCompetitionPayment(payment);
    } catch (error) {
      logger.warn('competition-payment-sync', {
        registrationId: registration.id,
        providerCode: error.providerCode || null,
        message: error.message,
      });
    }
    registration = await getCompetitionRegistrationByPublicToken(publicToken);
    payment = await findCompetitionPaymentForRegistration(registration.id);
  }

  const competition = getCompetitionPublicConfig();
  return {
    team_name: registration.team_name,
    category: registration.category,
    registration_status: registration.status,
    payment_status: registration.payment_status,
    paid_at: registration.paid_at,
    payment_url: registration.payment_status === 'paid' ? null : payment?.payment_url || null,
    chat_url: registration.payment_status === 'paid' ? competition.chat_urls[registration.category] : null,
  };
}

async function findCompetitionPaymentForRegistration(registrationId) {
  const { rows } = await pool.query(
    `SELECT id, registration_id, order_id, payment_id, amount_kopecks, status, payment_url
     FROM competition_payments
     WHERE registration_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [registrationId]
  );
  return rows[0] || null;
}

module.exports = {
  getCompetitionPaymentSummary,
  handleTbankCompetitionNotification,
  refreshRegistrationPaymentStatus,
  startCompetitionPayment,
  syncCompetitionPayment,
};
