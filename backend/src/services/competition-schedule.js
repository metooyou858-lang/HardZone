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

function dependencyId(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw invalid('Некорректный опорный блок');
  return value;
}

function validateDependencies(config) {
  const complexes = config.categories.flatMap(category => category.complexes);
  const byId = new Map(complexes.map(complex => [complex.id, complex]));
  for (const complex of complexes) {
    if (!complex.depends_on_complex_id) continue;
    if (!byId.has(complex.depends_on_complex_id)) throw invalid(`«${complex.name}»: опорный блок не найден. Сначала снимите зависимость`);
    if (complex.depends_on_complex_id === complex.id) throw invalid(`«${complex.name}»: блок не может зависеть сам от себя`);
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(complex) {
    if (visited.has(complex.id)) return;
    if (visiting.has(complex.id)) throw invalid('Зависимости времени образуют замкнутую цепочку');
    visiting.add(complex.id);
    if (complex.depends_on_complex_id) visit(byId.get(complex.depends_on_complex_id));
    visiting.delete(complex.id);
    visited.add(complex.id);
  }
  for (const complex of complexes) visit(complex);
}

function resolveDependentTimes(config, registrations) {
  const resolved = structuredClone(config);
  const complexes = resolved.categories.flatMap(category => category.complexes.map(complex => ({ complex, category })));
  const byId = new Map(complexes.map(item => [item.complex.id, item]));
  const resolvedIds = new Set();
  function resolve(item) {
    if (resolvedIds.has(item.complex.id)) return;
    const parent = item.complex.depends_on_complex_id ? byId.get(item.complex.depends_on_complex_id) : null;
    if (parent) {
      resolve(parent);
      const parentCount = parent.category.planned_count ?? registrations.filter(row => row.category === parent.category.category_key && row.status === 'registered' && row.payment_status === 'paid').length;
      const parentHeats = Math.ceil(parentCount / parent.complex.lanes);
      const parentStart = minutes(parent.complex.start_time);
      const parentEnd = parentStart + parentHeats * parent.complex.duration_minutes + Math.max(0, parentHeats - 1) * parent.complex.gap_minutes + parent.complex.break_after_minutes;
      const nextStart = parentEnd + item.complex.start_after_minutes;
      if (nextStart >= 1440) throw invalid(`«${item.complex.name}» после опорного блока выходит за пределы дня`);
      const delta = nextStart - minutes(item.complex.start_time);
      item.complex.start_time = clock(nextStart);
      if (item.complex.briefing_before_minutes != null) {
        const briefing = nextStart - item.complex.briefing_before_minutes;
        if (briefing < 0) throw invalid(`«${item.complex.name}»: брифинг выходит за пределы дня`);
        item.complex.briefing_time = clock(briefing);
      } else if (item.complex.briefing_time) {
        const briefing = minutes(item.complex.briefing_time) + delta;
        if (briefing < 0 || briefing >= 1440) throw invalid(`«${item.complex.name}»: время брифинга после смещения выходит за пределы дня`);
        item.complex.briefing_time = clock(briefing);
      }
    }
    resolvedIds.add(item.complex.id);
  }
  for (const item of complexes) resolve(item);
  return resolved;
}

function normalizeSchedule(input, competition) {
  if (!Array.isArray(input?.categories) || input.categories.length > 30) throw invalid('Некорректный список категорий');
  const keys = new Set();
  const ids = new Set();
  if (input.activities !== undefined && (!Array.isArray(input.activities) || input.activities.length > 100)) throw invalid('Допускается до 100 пунктов расписания');
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
          start_time: complex.start_time ? time(complex.start_time, `${label}, начало`) : complex.depends_on_complex_id ? '00:00' : time(complex.start_time, `${label}, начало`),
          briefing_time: complex.briefing_time ? time(complex.briefing_time, `${label}, брифинг`) : null,
          venue: text(complex.venue, 'Место проведения', 120),
          lanes: integer(complex.lanes, `${label}, дорожки`, 1, 100),
          duration_minutes: integer(complex.duration_minutes, `${label}, время захода`, 1, 240),
          gap_minutes: integer(complex.gap_minutes, `${label}, перерыв между заходами`, 0, 240),
          break_after_minutes: integer(complex.break_after_minutes, `${label}, перерыв после комплекса`, 0, 240),
          depends_on_complex_id: dependencyId(complex.depends_on_complex_id),
          start_after_minutes: complex.depends_on_complex_id ? integer(complex.start_after_minutes ?? 0, `${label}, интервал после опорного блока`, 0, 1440) : 0,
          briefing_before_minutes: complex.depends_on_complex_id && complex.briefing_before_minutes !== null && complex.briefing_before_minutes !== undefined
            ? integer(complex.briefing_before_minutes, `${label}, брифинг до первого захода`, 1, 1440)
            : null,
          redistribute_by_overall: index > 0 && complex.redistribute_by_overall !== false,
        };
      }),
    };
  }), activities: (input.activities || []).map(activity => {
    if (!['break', 'awards'].includes(activity?.kind)) throw invalid('Некорректный тип пункта расписания');
    if (typeof activity.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(activity.id) || ids.has(activity.id)) throw invalid('Некорректный или повторяющийся пункт расписания');
    ids.add(activity.id);
    return { id:activity.id, kind:activity.kind, name:text(activity.name, 'Название', 120), venue:text(activity.venue, 'Место проведения', 120), start_time:time(activity.start_time, 'Начало'), duration_minutes:integer(activity.duration_minutes, 'Длительность', 1, 240) };
  }) };
}

function buildSchedule(config, competition, registrations) {
  validateDependencies(config);
  config = resolveDependentTimes(config, registrations);
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
          const team = complex.redistribute_by_overall === false || index === 0 ? teams[offset + laneIndex] : null;
          return { lane: laneIndex + 1, registration_id: team?.id || null, team_name: team?.team_name || null };
        });
        offset += places;
        return { number: heatIndex + 1, start_time: clock(heatStart), end_time: clock(heatStart + complex.duration_minutes), slots };
      });
      blocks.push({ ...complex, category_key: category.category_key, category_name: categoryName, complex_number: index + 1,
        redistribute_by_overall: index > 0 && complex.redistribute_by_overall !== false,
        planned_count: count, confirmed_count: teams.length, assignment: index > 0 && complex.redistribute_by_overall !== false ? 'results' : 'registration',
        end_time: clock(end), available_after: clock(occupiedTo), heats, occupied_from: occupiedFrom, occupied_to: occupiedTo });
    }
  }
  for (const activity of config.activities || []) {
    const start = minutes(activity.start_time), end = start + activity.duration_minutes;
    if (end > 1440) errors.push(`${activity.name}: расписание выходит за пределы дня мероприятия`);
    blocks.push({...activity, category_key:'', category_name:'', briefing_time:null, end_time:clock(end), available_after:clock(end), occupied_from:start, occupied_to:end, heats:[]});
  }
  const venueConflicts = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.venue.toLocaleLowerCase('ru') === b.venue.toLocaleLowerCase('ru') && a.occupied_from < b.occupied_to && b.occupied_from < a.occupied_to) {
        venueConflicts.push(`Площадка «${a.venue}»: пересекаются «${[a.category_name,a.name].filter(Boolean).join(' · ')}» (${clock(a.occupied_from)}–${clock(a.occupied_to)}) и «${[b.category_name,b.name].filter(Boolean).join(' · ')}» (${clock(b.occupied_from)}–${clock(b.occupied_to)})`);
      }
    }
  }
  blocks.sort((a, b) => a.occupied_from - b.occupied_from || a.category_name.localeCompare(b.category_name, 'ru'));
  return {
    event_name: competition.name, event_date: competition.date,
    blocks, errors: [...errors,...venueConflicts], venue_conflicts: venueConflicts,
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
  const results = (await executor.query('SELECT state,revision FROM competition_results WHERE event_key=$1', [competition.event_key])).rows[0];
  const editableConfig = {...config,categories:config.categories.map(category=>({...category,complexes:category.complexes.map((complex,index)=>{
    const workout=results?.state.workouts[complex.id];
    const savedBriefingLead = complex.depends_on_complex_id && complex.briefing_time ? minutes(complex.start_time) - minutes(complex.briefing_time) : null;
    return {...complex,depends_on_complex_id:complex.depends_on_complex_id || null,start_after_minutes:complex.depends_on_complex_id ? Number(complex.start_after_minutes || 0) : 0,briefing_before_minutes:complex.depends_on_complex_id ? complex.briefing_before_minutes ?? (savedBriefingLead > 0 ? savedBriefingLead : null) : null,redistribute_by_overall:index > 0 && complex.redistribute_by_overall !== false,scoring:{components:workout?.components || [{name:'Результат',kind:'time'}],is_final:Boolean(workout?.is_final)},scoring_locked:Object.values(workout?.entries || {}).some(values=>values.some(value=>value!==null)) || workout?.status==='confirmed'};
  })}))};
  return { competition, config:editableConfig, results_revision:results?.revision || 0, revision:row?.revision || 0,
    confirmed_counts: Object.fromEntries(competition.categories.map(item => [item.key, registrations.filter(r => r.category === item.key).length])),
    preview:buildSchedule(config, competition, registrations), source_hash:sourceHash,
    grid:row?.generated_grid || null, grid_stale:Boolean(row?.generated_grid && row.generated_grid.source_hash !== sourceHash) };
}

async function saveSchedule(eventKey, input) {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventKey]);
    const current = await readSchedule(eventKey, client);
    if (input.revision !== current.revision) throw conflict('Настройки изменились в другой вкладке. Обновите расписание перед сохранением');
    if (input.source_hash && input.source_hash !== current.source_hash) throw conflict('Состав команд изменился. Обновите данные и проверьте смещения заново');
    let config = normalizeSchedule(input.config, current.competition);
    const registrations = (await client.query("SELECT id,team_name,category,created_at,status,payment_status FROM competition_registrations WHERE event_key=$1 AND status='registered' AND payment_status='paid'", [eventKey])).rows;
    validateDependencies(config);
    config = resolveDependentTimes(config, registrations);
    const preview = buildSchedule(config,current.competition,registrations);
    if (preview.venue_conflicts.length) throw invalid(preview.venue_conflicts.join('\n'));
    if (input.results_revision !== undefined && input.results_revision !== current.results_revision) throw conflict('Настройки результатов изменились. Обновите расписание');
    await require('./competition-results').saveScheduleScoring(eventKey,current,input.config,client);
    await require('./competition-results').guardScheduleChanges(eventKey,current,config,client);
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
    if (!current.preview.blocks.length && !current.grid) throw invalid('Сначала добавьте хотя бы один комплекс');
    if (current.preview.errors.length) throw invalid(current.preview.errors.join('\n'));
    await require('./competition-results').latchFinal(eventKey,current,client);
    const grid = await require('./competition-results').gridWithResults(eventKey,{ ...current.preview, source_hash:current.source_hash, generated_at:new Date().toISOString() },client);
    await client.query('UPDATE competition_schedules SET generated_grid=$2,revision=revision+1,updated_at=NOW() WHERE event_key=$1', [eventKey, grid]);
    return readSchedule(eventKey, client);
  });
}

function planActivity(current, activity) {
  const config = normalizeSchedule({...current.config, activities:[...(current.config.activities || []).filter(item => item.id !== activity.id),activity]}, current.competition);
  for (const category of config.categories) for (const complex of category.complexes) {
    const original=current.config.categories.flatMap(item=>item.complexes).find(item=>item.id===complex.id);
    if (original?.scoring) complex.scoring=original.scoring;
  }
  const inserted = config.activities.find(item => item.id === activity.id);
  const original = current.preview.blocks.filter(item => item.id !== activity.id);
  const start = minutes(inserted.start_time), end = start + inserted.duration_minutes;
  const related = (a,b) => a.venue.trim().toLocaleLowerCase('ru') === b.venue.trim().toLocaleLowerCase('ru') || Boolean(a.category_key && a.category_key === b.category_key);
  const moved = [];
  const shifts = [];
  // Preserve the existing order; delay only conflicts introduced by this insertion.
  for (const block of original) {
    let next = block.occupied_from;
    if (related(block, inserted) && next < end && block.occupied_to > start) next = end;
    for (const prior of moved) {
      if (prior.delta > 0 && related(prior.block, block) && next < prior.end) next = prior.end;
    }
    const delta = next - block.occupied_from;
    moved.push({block, delta, end:block.occupied_to + delta});
    if (!delta) continue;
    if (block.occupied_to + delta > 1440) throw invalid(`«${block.name}» после сдвига выходит за пределы дня. Измените время или длительность`);
    const target = config.activities.find(item => item.id === block.id) || config.categories.flatMap(item => item.complexes).find(item => item.id === block.id);
    target.start_time = clock(minutes(target.start_time) + delta);
    if (target.briefing_time) target.briefing_time = clock(minutes(target.briefing_time) + delta);
    shifts.push({id:block.id, name:[block.category_name,block.name].filter(Boolean).join(' · '), before:block.start_time, after:target.start_time, briefing_before:block.briefing_time, briefing_after:target.briefing_time || null, minutes:delta});
  }
  // Counts suffice for timing; participant assignments remain untouched until grid generation.
  const registrations = Object.entries(current.confirmed_counts).flatMap(([category,count]) => Array.from({length:count},(_,i) => ({id:String(i+1),category,status:'registered',payment_status:'paid',created_at:'2000-01-01'})));
  const preview = buildSchedule(config,current.competition,registrations);
  return {config, shifts, errors:preview.errors, end_before:current.preview.end_time, end_after:preview.end_time, source_hash:current.source_hash};
}

async function previewActivity(eventKey, input) {
  const current = await readSchedule(eventKey);
  if (input.revision !== current.revision) throw conflict('Настройки изменились. Обновите данные перед добавлением');
  return planActivity(current,input.activity);
}

module.exports = { normalizeSchedule, buildSchedule, readSchedule, saveSchedule, generateSchedule, planActivity, previewActivity };
