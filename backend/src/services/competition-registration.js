const { randomUUID } = require('node:crypto');

const { pool, withTransaction } = require('../db');
const { normalizePhone } = require('../utils/phones');

const CATEGORIES = new Set(['amateur', 'advanced']);
const STATUSES = new Set(['registered', 'cancelled']);

function validationError(message) {
  return Object.assign(new Error(message), { statusCode: 422 });
}

function normalizedRequiredText(value, label, maxLength) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) throw validationError(`Укажите ${label}`);
  if (normalized.length > maxLength) throw validationError(`${label} слишком длинное`);
  return normalized;
}

function normalizedRussianPhone(value, label) {
  const display = String(value || '').trim();
  const normalized = normalizePhone(display);
  if (!normalized || !/^7\d{10}$/.test(normalized)) {
    throw validationError(`Укажите корректный телефон ${label}`);
  }
  return { display, normalized };
}

function normalizeCompetitionRegistration(input) {
  const category = String(input?.category || '').trim();
  if (!CATEGORIES.has(category)) throw validationError('Выберите категорию команды');
  if (input?.terms_accepted !== true) {
    throw validationError('Подтвердите согласие с условиями проведения мероприятия');
  }
  if (input?.personal_data_accepted !== true) {
    throw validationError('Подтвердите согласие на обработку персональных данных');
  }

  const malePhone = normalizedRussianPhone(input?.male_phone, 'участника');
  const femalePhone = normalizedRussianPhone(input?.female_phone, 'участницы');
  if (malePhone.normalized === femalePhone.normalized) {
    throw validationError('У участников должны быть разные номера телефонов');
  }

  return {
    team_name: normalizedRequiredText(input?.team_name, 'название команды', 120),
    category,
    male_name: normalizedRequiredText(input?.male_name, 'имя и фамилию участника', 160),
    male_phone: malePhone.display,
    male_phone_normalized: malePhone.normalized,
    female_name: normalizedRequiredText(input?.female_name, 'имя и фамилию участницы', 160),
    female_phone: femalePhone.display,
    female_phone_normalized: femalePhone.normalized,
  };
}

function registrationsMatch(existing, submitted) {
  return existing.team_name === submitted.team_name
    && existing.category === submitted.category
    && existing.male_name === submitted.male_name
    && existing.male_phone_normalized === submitted.male_phone_normalized
    && existing.female_name === submitted.female_name
    && existing.female_phone_normalized === submitted.female_phone_normalized;
}

function getCompetitionPublicConfig() {
  const explicitlyEnabled = String(process.env.COMPETITION_REGISTRATION_ENABLED || 'true').toLowerCase() === 'true';
  const feeRubles = Number.parseInt(process.env.COMPETITION_FEE_RUBLES || '3500', 10);

  return {
    event_key: String(process.env.COMPETITION_EVENT_KEY || 'hardzone-club-competition-2026-10-10').trim(),
    name: String(process.env.COMPETITION_NAME || 'Командные соревнования HardZone').trim(),
    date: String(process.env.COMPETITION_DATE || '2026-10-10').trim() || null,
    location: String(process.env.COMPETITION_LOCATION || 'Клуб HardZone, г. Хабаровск, ул. Тихоокеанская, 47Г').trim(),
    fee_rubles: Number.isInteger(feeRubles) && feeRubles > 0 ? feeRubles : null,
    terms_version: String(process.env.COMPETITION_TERMS_VERSION || '2026-09-07').trim(),
    privacy_version: String(process.env.COMPETITION_PRIVACY_VERSION || '2026-09-07').trim(),
    registration_enabled: explicitlyEnabled,
    payment_enabled: String(process.env.COMPETITION_PAYMENT_ENABLED || 'false').toLowerCase() === 'true',
    chat_urls: {
      amateur: String(process.env.COMPETITION_AMATEUR_CHAT_URL || '').trim() || null,
      advanced: String(process.env.COMPETITION_ADVANCED_CHAT_URL || '').trim() || null,
    },
    organizer: {
      name: 'ИП Фаст А. С.',
      inn: '271702687700',
      ogrnip: '325270000031829',
      registration_address: 'Хабаровский край, г. Хабаровск, пер. Трубный, д. 17, кв. 193',
      phone: '+7 984 263-97-83',
      email: 'fast.alena1994@yandex.ru',
    },
  };
}

async function createCompetitionRegistration(input) {
  const config = getCompetitionPublicConfig();
  if (!config.registration_enabled) {
    throw Object.assign(new Error('Регистрация пока не открыта'), { statusCode: 503 });
  }

  const registration = normalizeCompetitionRegistration(input);

  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [config.event_key]);

    const duplicate = await client.query(
      `SELECT id, team_name, category,
              male_name, male_phone, male_phone_normalized,
              female_name, female_phone, female_phone_normalized,
              public_token, payment_status, paid_at, status, created_at
       FROM competition_registrations
       WHERE event_key = $1
         AND status = 'registered'
         AND (
           male_phone_normalized = ANY($2::TEXT[])
           OR female_phone_normalized = ANY($2::TEXT[])
         )
       LIMIT 1`,
      [config.event_key, [registration.male_phone_normalized, registration.female_phone_normalized]]
    );

    if (duplicate.rowCount > 0) {
      const existing = duplicate.rows[0];
      if (!registrationsMatch(existing, registration)) {
        throw Object.assign(new Error('Один из участников уже зарегистрирован в другой команде'), { statusCode: 409 });
      }

      const { rows } = await client.query(
        `UPDATE competition_registrations
         SET public_token = COALESCE(public_token, $2),
             terms_version = $3,
             terms_accepted_at = NOW(),
             privacy_version = $4,
             privacy_accepted_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, team_name, category, male_phone, public_token,
                   payment_status, paid_at, status, created_at`,
        [existing.id, randomUUID(), config.terms_version, config.privacy_version]
      );
      return rows[0];
    }

    const { rows } = await client.query(
      `INSERT INTO competition_registrations (
         event_key, team_name, category,
         male_name, male_phone, male_phone_normalized,
         female_name, female_phone, female_phone_normalized,
         terms_version, terms_accepted_at,
         privacy_version, privacy_accepted_at,
         public_token
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, NOW(), $12)
       RETURNING id, team_name, category, male_phone, public_token, payment_status, status, created_at`,
      [
        config.event_key,
        registration.team_name,
        registration.category,
        registration.male_name,
        registration.male_phone,
        registration.male_phone_normalized,
        registration.female_name,
        registration.female_phone,
        registration.female_phone_normalized,
        config.terms_version,
        config.privacy_version,
        randomUUID(),
      ]
    );

    return rows[0];
  });
}

async function listCompetitionRegistrations(executor = pool) {
  const config = getCompetitionPublicConfig();
  const { rows } = await executor.query(
    `SELECT
       id, team_name, category,
       male_name, male_phone,
       female_name, female_phone,
       terms_version, terms_accepted_at,
       privacy_version, privacy_accepted_at,
       payment_status, paid_at,
       status, created_at, updated_at
     FROM competition_registrations
     WHERE event_key = $1
     ORDER BY CASE status WHEN 'registered' THEN 0 ELSE 1 END, created_at DESC, id DESC`,
    [config.event_key]
  );
  return rows;
}

async function getCompetitionRegistrationByPublicToken(publicToken, executor = pool) {
  const config = getCompetitionPublicConfig();
  const { rows } = await executor.query(
    `SELECT id, event_key, team_name, category, male_phone, public_token,
            payment_status, paid_at, status, created_at, updated_at
     FROM competition_registrations
     WHERE event_key = $1 AND public_token = $2
     LIMIT 1`,
    [config.event_key, String(publicToken || '').trim()]
  );
  return rows[0] || null;
}

async function updateCompetitionRegistrationStatus(id, status) {
  if (!STATUSES.has(status)) throw validationError('Некорректный статус заявки');
  const config = getCompetitionPublicConfig();

  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [config.event_key]);
    const currentResult = await client.query(
      `SELECT id, male_phone_normalized, female_phone_normalized
       FROM competition_registrations
       WHERE id = $1 AND event_key = $2
       FOR UPDATE`,
      [id, config.event_key]
    );
    const current = currentResult.rows[0];
    if (!current) throw Object.assign(new Error('Заявка не найдена'), { statusCode: 404 });

    if (status === 'registered') {
      const duplicate = await client.query(
        `SELECT id
         FROM competition_registrations
         WHERE event_key = $1
           AND id <> $2
           AND status = 'registered'
           AND (
             male_phone_normalized = ANY($3::TEXT[])
             OR female_phone_normalized = ANY($3::TEXT[])
           )
         LIMIT 1`,
        [config.event_key, id, [current.male_phone_normalized, current.female_phone_normalized]]
      );
      if (duplicate.rowCount > 0) {
        throw Object.assign(new Error('Участник уже зарегистрирован в другой активной команде'), { statusCode: 409 });
      }
    }

    await client.query(
      `UPDATE competition_registrations
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [status, id]
    );
    return listCompetitionRegistrations(client);
  });
}

module.exports = {
  createCompetitionRegistration,
  getCompetitionRegistrationByPublicToken,
  getCompetitionPublicConfig,
  listCompetitionRegistrations,
  normalizeCompetitionRegistration,
  registrationsMatch,
  updateCompetitionRegistrationStatus,
};
