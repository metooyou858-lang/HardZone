const { randomUUID } = require('node:crypto');
const { pool, withTransaction } = require('../db');
const { readSchedule } = require('./competition-schedule');

const invalid = message => Object.assign(new Error(message), { statusCode: 422 });
const conflict = message => Object.assign(new Error(message), { statusCode: 409 });
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const clock = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;

function moveClock(value, delta, label) {
  if (!value) return value;
  const result = minutes(value) + delta;
  if (result < 0 || result >= 1440) throw invalid(`${label} после переноса выходит за пределы дня`);
  return clock(result);
}

function shiftHeat(heat, delta, label) {
  heat.start_time = moveClock(heat.start_time, delta, label);
  heat.end_time = moveClock(heat.end_time, delta, label);
}

function shiftBlock(block, delta) {
  const label = `«${[block.category_name, block.name].filter(Boolean).join(' · ')}»`;
  block.start_time = moveClock(block.start_time, delta, label);
  block.end_time = moveClock(block.end_time, delta, label);
  block.available_after = moveClock(block.available_after, delta, label);
  if (block.briefing_time) block.briefing_time = moveClock(block.briefing_time, delta, label);
  block.occupied_from += delta;
  block.occupied_to += delta;
  if (block.occupied_from < 0 || block.occupied_to > 1440) throw invalid(`${label} после переноса выходит за пределы дня`);
  for (const heat of block.heats || []) shiftHeat(heat, delta, label);
}

function refreshGridBounds(grid) {
  const points = grid.blocks.flatMap(block => [block.occupied_from, block.occupied_to]);
  grid.start_time = points.length ? clock(Math.min(...points)) : null;
  grid.end_time = points.length ? clock(Math.max(...points)) : null;
  return grid;
}

function validateGrid(grid, allowedOverlapIds = new Set()) {
  const errors = [];
  for (let i = 0; i < grid.blocks.length; i++) {
    const a = grid.blocks[i];
    for (let j = i + 1; j < grid.blocks.length; j++) {
      const b = grid.blocks[j];
      const sameVenue = a.venue.trim().toLocaleLowerCase('ru') === b.venue.trim().toLocaleLowerCase('ru');
      const sameCategory = Boolean(a.category_key && a.category_key === b.category_key);
      const overlap = a.occupied_from < b.occupied_to && b.occupied_from < a.occupied_to;
      if (allowedOverlapIds.has(a.id) && allowedOverlapIds.has(b.id)) continue;
      const sharedHeat = (a.heats || []).some(heat => heat.combined_heat_id && (b.heats || []).some(other => other.combined_heat_id === heat.combined_heat_id));
      if (sharedHeat) continue;
      if (overlap && (sameVenue || sameCategory)) {
        errors.push(`После изменения пересекаются «${[a.category_name, a.name].filter(Boolean).join(' · ')}» и «${[b.category_name, b.name].filter(Boolean).join(' · ')}»`);
      }
    }
  }
  return errors;
}

function requireCurrentGrid(current, input) {
  if (!current.grid) throw invalid('Сначала сформируйте сетку');
  if (current.grid_stale) throw invalid('Сетка устарела. Сначала пересформируйте её');
  if (input.revision !== current.revision || input.source_hash !== current.source_hash) throw conflict('Сетка изменилась. Обновите данные и повторите действие');
}

function planGridShift(gridInput, blockId, startTime) {
  if (typeof startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw invalid('Укажите новое время в формате ЧЧ:ММ');
  const grid = structuredClone(gridInput);
  const target = grid.blocks.find(block => block.id === blockId);
  if (!target) throw invalid('Пункт расписания не найден');
  const delta = minutes(startTime) - minutes(target.start_time);
  if (!delta) return { grid, shifts: [], errors: [] };
  const threshold = target.occupied_from;
  const shifts = [];
  for (const block of grid.blocks) {
    if (block.occupied_from < threshold) continue;
    const before = block.start_time;
    shiftBlock(block, delta);
    shifts.push({ id: block.id, name: [block.category_name, block.name].filter(Boolean).join(' · '), before, after: block.start_time, minutes: delta });
  }
  for (const heat of grid.combined_heats || []) {
    if (minutes(heat.start_time) >= threshold) shiftHeat(heat, delta, `Объединённый заход ${heat.number}`);
  }
  return { grid: refreshGridBounds(grid), shifts, errors: validateGrid(grid) };
}

function incompleteHeat(block) {
  const heats = (block.heats || []).filter(heat => heat.slots.length < block.lanes);
  if (heats.length !== 1) return null;
  return heats[0];
}

function planGridMerge(gridInput, blockIds) {
  const uniqueIds = [...new Set(Array.isArray(blockIds) ? blockIds.map(String) : [])];
  if (uniqueIds.length < 2) throw invalid('Выберите минимум две категории с неполными заходами');
  const grid = structuredClone(gridInput);
  if (grid.combined_heats?.length) throw invalid('Сначала отмените прежнее объединение или пересформируйте сетку');
  const blocks = uniqueIds.map(id => grid.blocks.find(block => block.id === id));
  if (blocks.some(block => !block || block.kind)) throw invalid('Для объединения выберите комплексы из сохранённой сетки');
  const [first] = blocks;
  if (blocks.some(block => block.venue.trim().toLocaleLowerCase('ru') !== first.venue.trim().toLocaleLowerCase('ru')
    || block.lanes !== first.lanes || block.duration_minutes !== first.duration_minutes || block.gap_minutes !== first.gap_minutes)) {
    throw invalid('Объединять можно комплексы с одной площадкой, количеством дорожек, длительностью и интервалом');
  }
  const partials = blocks.map(block => ({ block, heat: incompleteHeat(block) }));
  if (partials.some(item => !item.heat)) throw invalid('У каждой выбранной категории должен быть ровно один неполный заход');
  const originalHeatCount = partials.length;
  const teams = partials.flatMap(({ block, heat }) => heat.slots.map(slot => ({ ...slot, complex_id: block.id, complex_name: block.name, category_key: block.category_key, category_name: block.category_name })));
  const combinedCount = Math.ceil(teams.length / first.lanes);
  const anchor = Math.min(...partials.map(item => minutes(item.heat.start_time)));
  const savedHeats = originalHeatCount - combinedCount;
  const savedMinutes = Math.max(0, savedHeats * (first.duration_minutes + first.gap_minutes));
  const groupId = randomUUID();
  for (const { block, heat } of partials) block.heats = block.heats.filter(item => item !== heat);
  if (savedMinutes) {
    for (const block of grid.blocks) if (block.occupied_from > anchor) shiftBlock(block, -savedMinutes);
  }
  const combinedHeats = Array.from({ length: combinedCount }, (_, index) => {
    const start = anchor + index * (first.duration_minutes + first.gap_minutes);
    return {
      id: `${groupId}-${index + 1}`,
      group_id: groupId,
      number: index + 1,
      start_time: clock(start),
      end_time: clock(start + first.duration_minutes),
      venue: first.venue,
      lanes: first.lanes,
      slots: teams.slice(index * first.lanes, (index + 1) * first.lanes).map((team, lane) => ({ ...team, lane: lane + 1 })),
      block_ids: uniqueIds,
    };
  });
  for (const block of blocks) {
    for (const combined of combinedHeats) {
      const own = combined.slots.filter(slot => slot.complex_id === block.id).map(({ complex_id, complex_name, category_key, category_name, ...slot }) => slot);
      if (own.length) block.heats.push({ number: 0, start_time: combined.start_time, end_time: combined.end_time, slots: own, combined_heat_id: combined.id });
    }
    block.heats.sort((a, b) => minutes(a.start_time) - minutes(b.start_time));
    block.heats.forEach((heat, index) => { heat.number = index + 1; });
    const starts = block.heats.map(heat => minutes(heat.start_time));
    const ends = block.heats.map(heat => minutes(heat.end_time));
    block.start_time = clock(Math.min(...starts));
    block.end_time = clock(Math.max(...ends));
    block.occupied_from = block.briefing_time ? Math.min(minutes(block.briefing_time), Math.min(...starts)) : Math.min(...starts);
    block.occupied_to = Math.max(...ends) + block.break_after_minutes;
    block.available_after = clock(block.occupied_to);
  }
  grid.combined_heats = combinedHeats;
  grid.merge_summary = { block_ids: uniqueIds, original_heat_count: originalHeatCount, combined_heat_count: combinedCount, saved_minutes: savedMinutes };
  const errors = validateGrid(grid, new Set(uniqueIds));
  return { grid: refreshGridBounds(grid), errors, saved_minutes: savedMinutes, original_heat_count: originalHeatCount, combined_heat_count: combinedCount };
}

async function previewShift(eventKey, input) {
  const current = await readSchedule(eventKey);
  requireCurrentGrid(current, input);
  return planGridShift(current.grid, String(input.block_id || ''), input.start_time);
}

async function previewMerge(eventKey, input) {
  const current = await readSchedule(eventKey);
  requireCurrentGrid(current, input);
  return planGridMerge(current.grid, input.block_ids);
}

async function applyOperation(eventKey, input, planner) {
  return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [eventKey]);
    const current = await readSchedule(eventKey, client);
    requireCurrentGrid(current, input);
    const planned = planner(current.grid, input);
    if (planned.errors.length) throw invalid(planned.errors.join('\n'));
    planned.grid.operational_updated_at = new Date().toISOString();
    await client.query('UPDATE competition_schedules SET generated_grid=$2,revision=revision+1,updated_at=NOW() WHERE event_key=$1', [eventKey, planned.grid]);
    return readSchedule(eventKey, client);
  });
}

const applyShift = (eventKey, input) => applyOperation(eventKey, input, (grid, value) => planGridShift(grid, String(value.block_id || ''), value.start_time));
const applyMerge = (eventKey, input) => applyOperation(eventKey, input, (grid, value) => planGridMerge(grid, value.block_ids));

module.exports = { planGridShift, planGridMerge, previewShift, previewMerge, applyShift, applyMerge };
