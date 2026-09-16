const { createHash } = require('node:crypto');
const { pool, withTransaction } = require('../db');
const { getCompetitionConfig } = require('./competition-events');

const invalid = message => Object.assign(new Error(message), { statusCode: 422 });
const conflict = message => Object.assign(new Error(message), { statusCode: 409 });
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;

function integer(value, label, min, max) {
  const n = value === '' || value === null || typeof value === 'boolean' ? NaN : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label}: укажите целое число от ${min} до ${max}`);
  return n;
}

function time(value, label) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw invalid(`${label}: укажите время в формате ЧЧ:ММ`);
  return value;
}

function text(value, label, max) {
  const result = String(value || '').trim().replace(/\s+/g, ' ');
  if (!result || result.length > max) throw invalid(`${label}: заполните поле, не более ${max} символов`);
  return result;
}

function normalizeSchedule(input, competition) {
  if (!Array.isArray(input?.categories) || input.categories.length > 30) throw invalid('Некорректный список категорий');
  const keys = new Set();
  const ids = new Set();
  return { categories: input.categories.map(category => {
    if (!competition.categories.some(item => item.key === category?.category_key) || keys.has(category.category_key)) throw invalid('Категория отсутствует в мероприятии или повторяется');
    keys.add(category.category_key);
    if (!Array.isArray(category.complexes) || category.complexes.length > 20) throw invalid('В категории допускается до 20 комплексов');
    return {
      category_key: category.category_key,
      planned_count: category.planned_count === null || category.planned_count === '' || category.planned_count === undefined ? null : integer(category.planned_count, 'Плановое количество команд', 1, 1000),
      complexes: category.complexes.map((complex, index) => {
        const label = `Комплекс ${index + 1}`;
        if (typeof complex?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(complex.id) || ids.has(complex.id)) throw invalid('Некорректный или повторяющийся комплекс');
        ids.add(complex.id);
        return {
          id: complex.id,
          name: text(complex.name, 'Название комплекса', 120),
          start_time: time(complex.start_time, `${label}, начало`),
          briefing_time: complex.briefing_time ? time(complex.briefing_time, `${label}, брифинг`) : null,
          venue: text(complex.venue, 'Место проведения', 120),
          lanes: integer(complex.lanes, `${label}, дорожки`, 1, 100),
          duration_minutes: integer(complex.duration_minutes, `${label}, время захода`, 1, 240),
          gap_minutes: integer(complex.gap_minutes, `${label}, перерыв между заходами`, 0, 240),
          break_after_minutes: integer(complex.break_after_minutes, `${label}, перерыв после комплекса`, 0, 240),
        };
      }),
    };
  }) };
}

function buildSchedule(config, competition, registrations) {
  const errors = [];
  const blocks = [];
  for (const category of config.categories) {
    const categoryName = competition.categories.find(item => item.key === category.category_key)?.name || category.category_key;
    const teams = registrations.filter(row => row.category === category.category_key && row.status === 'registered' && row.payment_status === 'paid')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || (BigInt(a.id) < BigInt(b.id) ? 1 : -1));
    const count = category.planned_count ?? teams.length;
    if (category.complexes.length && count < teams.length) errors.push(`${categoryName}: запланировано ${count} мест, но уже оплачено ${teams.length} команд`);
    if (category.complexes.length && count === 0) errors.push(`${categoryName}: нет оплаченных команд. Укажите плановое количество для расчёта времени`);
    let previousEnd = null;
    for (const [index, complex] of category.complexes.entries()) {
      const start = minutes(complex.start_time);
      const occupiedFrom = complex.briefing_time ? minutes(complex.briefing_time) : start;
      const heatCount = Math.ceil(count / complex.lanes);
      const end = start + heatCount * complex.duration_minutes + Math.max(0, heatCount - 1) * complex.gap_minutes;
      const occupiedTo = end + complex.break_after_minutes;
      const label = `${categoryName} · ${complex.name}`;
      if (occupiedFrom > start) errors.push(`${label}: брифинг не может начинаться после первого захода`);
      if (occupiedTo > 1440) errors.push(`${label}: расписание выходит за пределы дня мероприятия`);
      if (previousEnd !== null && occupiedFrom < previousEnd) errors.push(`${label}: начало раньше завершения предыдущего комплекса и перерыва этой категории (${clock(previousEnd)})`);
      previousEnd = occupiedTo;
      let offset = 0;
      const heats = Array.from({ length: heatCount }, (_, heatIndex) => {
        // The incomplete heat goes first so the final heat has all lanes occupied.
        const places = heatIndex === 0 ? count % complex.lanes || complex.lanes : complex.lanes;
        const heatStart = start + heatIndex * (complex.duration_minutes + complex.gap_minutes);
        const slots = Array.from({ length: places }, (_, laneIndex) => {
          const team = index === 0 ? teams[offset + laneIndex] : null;
          return { lane: laneIndex + 1, registration_id: team?.id || null, team_name: team?.team_name || null };
        });
        offset += places;
        return { number: heatIndex + 1, start_time: clock(heatStart), end_time: clock(heatStart + complex.duration_minutes), slots };
      });
      blocks.push({ ...complex, category_key: category.category_key, category_name: categoryName, complex_number: index + 1,
        planned_count: count, confirmed_count: teams.length, assignment: index === 0 ? 'registration' : 'results',
        end_time: clock(end), available_after: clock(occupiedTo), heats, occupied_from: occupiedFrom, occupied_to: occupiedTo });
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.venue.toLocaleLowerCase('ru') === b.venue.toLocaleLowerCase('ru') && a.occupied_from < b.occupied_to && b.occupied_from < a.occupied_to) {
        errors.push(`Площадка «${a.venue}»: пересекаются «${a.category_name} · ${a.name}» и «${b.category_name} · ${b.name}»`);
      }
    }
  }
  blocks.sort((a, b) => a.occupied_from - b.occupied_from || a.category_name.localeCompare(b.category_name, 'ru'));
  return {
    event_name: competition.name, event_date: competition.date,
    blocks, errors,
    start_time: blocks.length ? clock(Math.min(...blocks.map(item => item.occupied_from))) : null,
    end_time: blocks.length ? clock(Math.max(...blocks.map(item => item.occupied_to))) : null,
  };
}

async function readSchedule(eventKey, executor = pool) {
  const competition = await getCompetitionConfig(eventKey, executor);
  const row = (await executor.query('SELECT * FROM competition_schedules WHERE event_key=$1', [competition.event_key])).rows[0];
  const registrations = (await executor.query(`SELECT id, team_name, category, created_at, status, payment_status
    FROM competition_registrations WHERE event_key=$1 AND status='registered' AND payment_status='paid' ORDER BY created_at DESC, id DESC`, [competition.event_key])).rows;
  const config = row?.config || { categories: [] };
  const sourceHash = createHash('sha256').update(JSON.stringify({ config, name:competition.name, date:competition.date, categories:competition.categories, registrations })).digest('hex');
  return { competition, config, revision:row?.revision || 0,
    confirmed_counts: Object.fromEntries(competition.categories.map(item => [item.key, registrations.filter(r => r.category === item.key).length])),
    preview:buildSchedule(config, competition, registrations), source_hash:sourceHash,
    grid:row?.generated_grid || null, grid_stale:Boolean(row?.generated_grid && row.generated_grid.source_hash !== sourceHash) };
}

async function saveSchedule(eventKey, input) {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventKey]);
    const current = await readSchedule(eventKey, client);
    if (input.revision !== current.revision) throw conflict('Настройки изменились в другой вкладке. Обновите расписание перед сохранением');
    const config = normalizeSchedule(input.config, current.competition);
    await client.query(`INSERT INTO competition_schedules(event_key,config,revision) VALUES($1,$2,1)
      ON CONFLICT(event_key) DO UPDATE SET config=EXCLUDED.config,revision=competition_schedules.revision+1,updated_at=NOW()`, [eventKey, config]);
    return readSchedule(eventKey, client);
  });
}

async function generateSchedule(eventKey, input) {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventKey]);
    const current = await readSchedule(eventKey, client);
    if (input.revision !== current.revision || input.source_hash !== current.source_hash) throw conflict('Состав команд или настройки изменились. Обновите расчёт перед формированием сетки');
    if (!current.preview.blocks.length) throw invalid('Сначала добавьте хотя бы один комплекс');
    if (current.preview.errors.length) throw invalid(current.preview.errors.join('\n'));
    const grid = { ...current.preview, source_hash:current.source_hash, generated_at:new Date().toISOString() };
    await client.query('UPDATE competition_schedules SET generated_grid=$2,revision=revision+1,updated_at=NOW() WHERE event_key=$1', [eventKey, grid]);
    return readSchedule(eventKey, client);
  });
}

module.exports = { normalizeSchedule, buildSchedule, readSchedule, saveSchedule, generateSchedule };
