const { randomUUID } = require('node:crypto');
const { pool, withTransaction } = require('../db');

const defaultCategories = [{ key: 'amateur', name: 'Любители' }, { key: 'advanced', name: 'Продвинутые' }];
const invalid = message => Object.assign(new Error(message), { statusCode: 422 });
const missing = () => Object.assign(new Error('Мероприятие не найдено'), { statusCode: 404 });

function legacyConfig() {
  return require('./competition-registration').getCompetitionPublicConfig();
}

async function ensureDefaultEvent(executor = pool) {
  const config = legacyConfig();
  await executor.query('INSERT INTO competition_events(event_key, legacy) VALUES($1, TRUE) ON CONFLICT DO NOTHING', [config.event_key]);
  return config.event_key;
}

function publicConfig(row) {
  const base = legacyConfig();
  return {
    ...base,
    ...(row.legacy ? {} : { messenger_urls: { whatsapp: '', telegram: '' }, chat_urls: {} }),
    categories: defaultCategories,
    terms_text: '',
    ...row.settings,
    event_key: row.event_key,
    legacy: row.legacy,
    public_path: row.event_key === base.event_key ? '/competition' : `/competition?event=${encodeURIComponent(row.event_key)}`,
  };
}

async function getCompetitionConfig(eventKey, executor = pool) {
  const key = !eventKey || eventKey === legacyConfig().event_key ? await ensureDefaultEvent(executor) : eventKey;
  const { rows } = await executor.query('SELECT * FROM competition_events WHERE event_key=$1', [key]);
  if (!rows[0]) throw missing();
  return publicConfig(rows[0]);
}

async function listCompetitionEvents() {
  await ensureDefaultEvent();
  const { rows } = await pool.query(`SELECT e.*,
    COUNT(r.id) FILTER (WHERE r.status='registered')::INT AS registrations_count,
    COUNT(r.id) FILTER (WHERE r.status='registered' AND r.payment_status='paid')::INT AS confirmed_count
    FROM competition_events e LEFT JOIN competition_registrations r USING(event_key)
    GROUP BY e.event_key ORDER BY e.created_at DESC, e.event_key`);
  return rows.map(row => ({ ...publicConfig(row), registrations_count: row.registrations_count, confirmed_count: row.confirmed_count }));
}

function text(value, label, max) {
  const result = String(value || '').trim();
  if (!result || result.length > max) throw invalid(`Укажите ${label} (до ${max} символов)`);
  return result;
}

function normalizeEvent(input, existing = null) {
  const date = String(input.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw invalid('Укажите корректную дату мероприятия');
  const fee = Number(input.fee_rubles);
  if (!Number.isInteger(fee) || fee < 1 || fee > 1000000) throw invalid('Укажите взнос в рублях от 1 до 1 000 000');
  if (!Array.isArray(input.categories) || input.categories.length < 1 || input.categories.length > 30) throw invalid('Добавьте от 1 до 30 категорий');
  const categories = input.categories.map(item => ({ key: item.key || randomUUID(), name: text(item.name, 'название категории', 80) }));
  if (categories.some(item => typeof item.key !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.key))) throw invalid('Некорректная категория');
  if (new Set(categories.map(item => item.key)).size !== categories.length || new Set(categories.map(item => item.name.toLowerCase())).size !== categories.length) throw invalid('Категории не должны повторяться');
  if (typeof input.registration_enabled !== 'boolean') throw invalid('Укажите состояние регистрации');
  const terms = existing?.legacy ? existing.terms_text : text(input.terms_text, 'условия участия', 12000);
  const revision = new Date().toISOString();
  return {
    name: text(input.name, 'название мероприятия', 160), date,
    location: text(input.location, 'место проведения', 300), fee_rubles: fee,
    registration_enabled: input.registration_enabled,
    payment_enabled: existing?.payment_enabled ?? true,
    categories, terms_text: terms,
    terms_version: existing && existing.terms_text === terms ? existing.terms_version : revision,
    privacy_version: existing?.privacy_version || '2026-09-16',
  };
}

async function createCompetitionEvent(input) {
  const settings = normalizeEvent(input);
  const { rows } = await pool.query('INSERT INTO competition_events(event_key, settings) VALUES($1,$2) RETURNING *', [`event-${randomUUID()}`, settings]);
  return publicConfig(rows[0]);
}

async function updateCompetitionEvent(eventKey, input) {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventKey]);
    const existing = await getCompetitionConfig(eventKey, client);
    const settings = normalizeEvent(input, existing);
    const used = await client.query('SELECT DISTINCT category FROM competition_registrations WHERE event_key=$1', [eventKey]);
    if (used.rows.some(row => !settings.categories.some(category => category.key === row.category))) throw invalid('Нельзя удалить категорию, в которой уже есть заявки');
    if (existing.legacy && JSON.stringify(settings.categories) !== JSON.stringify(defaultCategories)) throw invalid('Категории действующего соревнования связаны с опубликованными условиями');
    const { rows } = await client.query('UPDATE competition_events SET settings=settings || $2::JSONB, updated_at=NOW() WHERE event_key=$1 RETURNING *', [eventKey, settings]);
    return publicConfig(rows[0]);
  });
}

module.exports = { getCompetitionConfig, listCompetitionEvents, createCompetitionEvent, updateCompetitionEvent };
