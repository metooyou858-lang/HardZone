const { pool, withTransaction } = require('../db');
const { getCompetitionConfig } = require('./competition-events');
const { listCompetitionRegistrations } = require('./competition-registration');

const invalid = message => Object.assign(new Error(message), { statusCode: 422 });
const conflict = message => Object.assign(new Error(message), { statusCode: 409 });

function resultsStarted(state) {
  return Object.values(state?.workouts || {}).some(workout =>
    workout?.status === 'confirmed'
    || Object.values(workout?.entries || {}).some(values => values.some(value => value !== null))
  );
}

async function closeOnlineRegistration(eventKey) {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventKey]);
    const competition = await getCompetitionConfig(eventKey, client);
    if (!competition.online_registration_closed_at) {
      await client.query(
        `UPDATE competition_events
         SET settings = settings || '{"registration_enabled":false}'::JSONB,
             online_registration_closed_at = NOW(),
             updated_at = NOW()
         WHERE event_key = $1`,
        [competition.event_key]
      );
    }
    return getCompetitionConfig(competition.event_key, client);
  });
}

async function updateOnsiteStatus(eventKey, registrationId, onsiteStatus) {
  if (!['pending', 'arrived'].includes(onsiteStatus)) throw invalid('Некорректная отметка офлайн-регистрации');
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventKey]);
    const competition = await getCompetitionConfig(eventKey, client);
    if (!competition.online_registration_closed_at) throw conflict('Сначала завершите онлайн-регистрацию');
    if (competition.onsite_registration_closed_at) throw conflict('Офлайн-регистрация уже завершена');
    const updated = await client.query(
      `UPDATE competition_registrations
       SET onsite_status = $3, onsite_updated_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND event_key = $2 AND status = 'registered' AND payment_status = 'paid'
       RETURNING id`,
      [registrationId, competition.event_key, onsiteStatus]
    );
    if (!updated.rowCount) throw Object.assign(new Error('Оплаченная активная команда не найдена'), { statusCode: 404 });
    return listCompetitionRegistrations(client, competition.event_key);
  });
}

async function finishOnsiteRegistration(eventKey) {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventKey]);
    const competition = await getCompetitionConfig(eventKey, client);
    if (!competition.online_registration_closed_at) throw conflict('Сначала завершите онлайн-регистрацию');
    if (competition.onsite_registration_closed_at) return {
      competition,
      registrations: await listCompetitionRegistrations(client, competition.event_key),
    };
    const unpaid = await client.query(
      `SELECT COUNT(*)::INT AS count
       FROM competition_registrations
       WHERE event_key = $1 AND status = 'registered' AND payment_status <> 'paid'`,
      [competition.event_key]
    );
    if (unpaid.rows[0].count > 0) {
      throw conflict(`Нельзя завершить офлайн-регистрацию: ${unpaid.rows[0].count} активных заявок ещё не оплачены`);
    }
    await client.query(
      `UPDATE competition_registrations
       SET onsite_status = 'no_show', onsite_updated_at = NOW(), updated_at = NOW()
       WHERE event_key = $1 AND status = 'registered' AND payment_status = 'paid' AND onsite_status = 'pending'`,
      [competition.event_key]
    );
    await client.query(
      `UPDATE competition_events
       SET onsite_registration_closed_at = NOW(), updated_at = NOW()
       WHERE event_key = $1`,
      [competition.event_key]
    );
    return {
      competition: await getCompetitionConfig(competition.event_key, client),
      registrations: await listCompetitionRegistrations(client, competition.event_key),
    };
  });
}

async function reopenOnsiteRegistration(eventKey) {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventKey]);
    const competition = await getCompetitionConfig(eventKey, client);
    const result = await client.query('SELECT state FROM competition_results WHERE event_key = $1', [competition.event_key]);
    if (resultsStarted(result.rows[0]?.state)) throw conflict('Нельзя открыть офлайн-регистрацию после начала ввода результатов');
    await client.query(
      `UPDATE competition_registrations
       SET onsite_status = 'pending', onsite_updated_at = NOW(), updated_at = NOW()
       WHERE event_key = $1 AND status = 'registered' AND payment_status = 'paid' AND onsite_status = 'no_show'`,
      [competition.event_key]
    );
    await client.query(
      `UPDATE competition_events
       SET onsite_registration_closed_at = NULL, updated_at = NOW()
       WHERE event_key = $1`,
      [competition.event_key]
    );
    return {
      competition: await getCompetitionConfig(competition.event_key, client),
      registrations: await listCompetitionRegistrations(client, competition.event_key),
    };
  });
}

module.exports = {
  closeOnlineRegistration,
  finishOnsiteRegistration,
  reopenOnsiteRegistration,
  resultsStarted,
  updateOnsiteStatus,
};
