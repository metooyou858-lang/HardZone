const { pool, withTransaction } = require('../db');
const { readSchedule } = require('./competition-schedule');

const invalid = message => Object.assign(new Error(message), {statusCode:422});
const conflict = message => Object.assign(new Error(message), {statusCode:409});
const kinds = ['time','reps','weight','time_or_reps'];
const hasEntries = workout => Object.values(workout?.entries || {}).some(values => values.some(value => value !== null));
const blocksOf = schedule => (schedule.grid?.blocks || schedule.preview.blocks).filter(block => !block.kind);

function points(place) {
  return place <= 5 ? 105 - place * 5 : Math.max(0, 95 - place * 3);
}

function parseResult(value, kind) {
  if (value === '' || value === null || value === undefined) return null;
  if (kind === 'time_or_reps') {
    if (!value || typeof value!=='object' || !['time','reps'].includes(value.kind)) throw invalid('Выберите время или повторения для результата команды');
    const parsed=parseResult(value.value,value.kind);
    return parsed===null ? null : {kind:value.kind,value:parsed};
  }
  if (typeof value !== 'string') throw invalid('Результат должен быть строкой');
  if (kind === 'time') {
    if (!/^\d{1,3}:[0-5]\d$/.test(value)) throw invalid('Время: используйте ММ:СС, например 07:38');
    return Number(value.split(':')[0]) * 60 + Number(value.split(':')[1]);
  }
  const cleaned = value.replace(',', '.');
  if (!(kind === 'reps' ? /^\d+$/ : /^\d+(\.\d{1,2})?$/).test(cleaned)) throw invalid(kind === 'reps' ? 'Повторения: целое неотрицательное число' : 'Вес: неотрицательное число, до двух знаков после запятой');
  const result = Number(cleaned);
  if (!Number.isFinite(result) || result > 1000000) throw invalid('Слишком большой результат');
  return result;
}

function roster(block) {
  return (block?.heats || []).flatMap(heat => heat.slots.filter(slot => slot.registration_id).map(slot => ({id:String(slot.registration_id),name:slot.team_name,heat:heat.number,lane:slot.lane})));
}

function rankWorkout(workout, teams) {
  return (workout?.components || []).map((component,index) => {
    const scored = teams.map(team => ({...team,value:workout.entries?.[team.id]?.[index] ?? null})).filter(item => item.value !== null);
    const compare=(a,b)=> {
      if (component.kind!=='time_or_reps') return component.kind === 'time' ? a.value-b.value : b.value-a.value;
      if (a.value.kind!==b.value.kind) return a.value.kind==='time' ? -1 : 1;
      return a.value.kind==='time' ? a.value.value-b.value.value : b.value.value-a.value.value;
    };
    scored.sort(compare);
    let place = 0;
    return scored.map((item,i) => {
      if (i === 0 || compare(item,scored[i-1])!==0) place = i+1;
      return {...item,place,points:points(place)};
    });
  });
}

function standings(blocks,state,categoryKey,through=Infinity) {
  const category = blocks.filter(block => block.category_key === categoryKey).sort((a,b) => a.complex_number-b.complex_number);
  const teams = roster(category[0]);
  const rows = teams.map(team => ({...team,total:0,places:[],scores:[]}));
  for (const block of category.filter(block => block.complex_number <= through)) {
    const workout = state.workouts[block.id];
    if (workout?.status !== 'confirmed') continue;
    for (const [index,ranking] of rankWorkout(workout,teams).entries()) {
      for (const row of rows) {
        const score = ranking.find(item => item.id === row.id);
        if (!score) continue;
        row.total += score.points;
        row.places.push(score.place);
        row.scores.push({complex_id:block.id,complex_name:block.name,component:workout.components[index].name,kind:workout.components[index].kind,value:score.value,place:score.place,points:score.points});
      }
    }
  }
  const compare = (a,b) => {
    if (a.total !== b.total) return b.total-a.total;
    for (let place=1;place<=teams.length;place++) {
      const difference = b.places.filter(p=>p===place).length-a.places.filter(p=>p===place).length;
      if (difference) return difference;
    }
    return 0;
  };
  rows.sort(compare);
  let place=0;
  return rows.map((row,i) => {
    if (!i || compare(row,rows[i-1])) place=i+1;
    return {...row,place:row.scores.length ? place : null};
  });
}

function seedResults(grid,state) {
  const result = structuredClone(grid);
  const blocks = result.blocks.filter(block=>!block.kind);
  for (const block of blocks) {
    if (block.complex_number === 1) continue;
    const previous=blocks.filter(item=>item.category_key===block.category_key && item.complex_number<block.complex_number);
    const ready=previous.length && previous.every(item=>state.workouts[item.id]?.status==='confirmed');
    const ranked=ready ? standings(blocks,state,block.category_key,block.complex_number-1).slice().reverse() : [];
    const slots=block.heats.flatMap(heat=>heat.slots);
    if (ranked.length>slots.length) throw invalid('В следующем комплексе не хватает мест для команд');
    slots.forEach((slot,index) => {slot.registration_id=ranked[index]?.id || null;slot.team_name=ranked[index]?.name || null;});
    block.assignment=ready ? 'rating' : 'results';
  }
  return result;
}

function finalStartsAt(schedule,state) {
  if (!schedule.grid || !(schedule.grid.event_date || schedule.competition.date)) return null;
  const dates=schedule.grid.blocks.filter(block=>!block.kind && state.workouts[block.id]?.is_final)
    .map(block=>new Date(`${String(schedule.grid.event_date || schedule.competition.date).slice(0,10)}T${block.start_time}:00+10:00`).getTime()).filter(Number.isFinite);
  return dates.length ? new Date(Math.min(...dates)).toISOString() : null;
}

async function latchFinal(eventKey,schedule,executor=pool,now=Date.now()) {
  const row=(await executor.query('SELECT * FROM competition_results WHERE event_key=$1',[eventKey])).rows[0];
  const closesAt=finalStartsAt(schedule,row?.state || {workouts:{}});
  if (row && !row.hidden_at && closesAt && now>=new Date(closesAt).getTime()) {
    await executor.query('UPDATE competition_results SET hidden_at=NOW() WHERE event_key=$1 AND hidden_at IS NULL',[eventKey]);
    row.hidden_at=new Date(now).toISOString();
  }
  return {row,closesAt};
}

async function readResults(eventKey,executor=pool) {
  const schedule=await readSchedule(eventKey,executor);
  const {row,closesAt}=await latchFinal(schedule.competition.event_key,schedule,executor);
  const state=row?.state || {workouts:{}};
  const blocks=blocksOf(schedule);
  return {competition:schedule.competition,revision:row?.revision || 0,schedule_revision:schedule.revision,source_hash:schedule.source_hash,
    has_grid:Boolean(schedule.grid),grid_stale:schedule.grid_stale,hidden:Boolean(row?.hidden_at),closes_at:closesAt,state,
    blocks:blocks.map(block=>({...block,teams:roster(block),rankings:rankWorkout(state.workouts[block.id],roster(block))})),
    standings:Object.fromEntries(schedule.competition.categories.map(category=>[category.key,standings(blocks,state,category.key)]))};
}

async function saveResults(eventKey,input) {
  return withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[eventKey]);
    const current=await readResults(eventKey,client);
    if (input.revision!==current.revision || input.schedule_revision!==current.schedule_revision || input.source_hash!==current.source_hash) throw conflict('Данные изменились. Обновите раздел перед сохранением');
    const block=current.blocks.find(item=>item.id===input.complex_id);
    if (current.has_grid && current.grid_stale) throw invalid('Сетка устарела. Сначала обновите её в разделе комплексов');
    if (!block) throw invalid('Комплекс не найден в расписании');
    const state=structuredClone(current.state);
    const existing=state.workouts[block.id];
    const later=current.blocks.filter(item=>item.category_key===block.category_key && item.complex_number>block.complex_number);
    if (existing?.status==='confirmed' && input.action!=='reopen') throw invalid('Сначала откройте результаты для редактирования');
    if (input.action==='reopen') {
      if (existing?.status!=='confirmed') throw invalid('Комплекс ещё не подтверждён');
      if (later.some(item=>hasEntries(state.workouts[item.id]))) throw invalid('У следующих комплексов уже есть результаты. Исправление предыдущего изменит их посев');
      existing.status='draft';
    } else if (input.action==='settings') {
      if (hasEntries(existing)) throw invalid('Тип оценки нельзя менять после ввода результатов');
      if (!Array.isArray(input.components) || input.components.length<1 || input.components.length>2) throw invalid('Выберите один или два зачёта');
      const components=input.components.map(item=>{
        if (!kinds.includes(item.kind) || typeof item.name!=='string' || !item.name.trim() || item.name.trim().length>80) throw invalid('Заполните название и тип каждого зачёта');
        return {name:item.name.trim(),kind:item.kind};
      });
      if (input.is_final && later.length) throw invalid('Финальным может быть только последний комплекс категории');
      state.workouts[block.id]={components,is_final:Boolean(input.is_final),entries:{},status:'draft'};
    } else if (input.action==='save' || input.action==='confirm') {
      if (!current.has_grid || current.grid_stale) throw invalid('Сначала сформируйте актуальную сетку');
      if (!existing?.components?.length) throw invalid('Сначала настройте оценку комплекса');
      if (!block.teams.length) throw invalid('В заходах ещё нет команд. Подтвердите предыдущие комплексы');
      if (!input.entries || typeof input.entries!=='object' || Array.isArray(input.entries)) throw invalid('Некорректные результаты');
      const validIds=new Set(block.teams.map(team=>team.id));
      if (Object.keys(input.entries).some(id=>!validIds.has(id))) throw invalid('Команда отсутствует в этом комплексе');
      existing.entries=Object.fromEntries(block.teams.map(team=>{
        const values=input.entries[team.id];
        if (!Array.isArray(values) || values.length!==existing.components.length) throw invalid(`Заполните поля команды «${team.name}»`);
        return [team.id,existing.components.map((component,index)=>parseResult(values[index],component.kind))];
      }));
      if (input.action==='confirm' && Object.values(existing.entries).some(values=>values.some(value=>value===null))) throw invalid('Для подтверждения нужны все результаты комплекса');
      existing.status=input.action==='confirm' ? 'confirmed' : 'draft';
    } else throw invalid('Неизвестное действие');
    await client.query(`INSERT INTO competition_results(event_key,state,revision) VALUES($1,$2,1)
      ON CONFLICT(event_key) DO UPDATE SET state=EXCLUDED.state,revision=competition_results.revision+1,updated_at=NOW()`,[eventKey,state]);
    if (input.action==='confirm' || input.action==='reopen') {
      const schedule=await readSchedule(eventKey,client);
      if (schedule.grid) await client.query('UPDATE competition_schedules SET generated_grid=$2,revision=revision+1 WHERE event_key=$1',[eventKey,seedResults(schedule.grid,state)]);
    }
    return readResults(eventKey,client);
  });
}

async function guardScheduleChanges(eventKey,current,next,executor) {
  const {row}=await latchFinal(eventKey,current,executor);
  if (!row) return;
  for (const category of current.config.categories) {
    for (const [index,complex] of category.complexes.entries()) {
      const workout=row.state.workouts[complex.id];
      if (!hasEntries(workout) && !workout?.is_final) continue;
      const target=next.categories.find(item=>item.category_key===category.category_key);
      if (target?.complexes[index]?.id!==complex.id) throw invalid('Нельзя удалить, перенести или изменить порядок комплекса с результатами или отметкой финала');
      if (workout?.is_final && target.complexes.length!==index+1) throw invalid('После финального комплекса нельзя добавить ещё один. Сначала измените отметку финала в результатах');
    }
  }
}

async function gridWithResults(eventKey,grid,executor) {
  const row=(await executor.query('SELECT state FROM competition_results WHERE event_key=$1',[eventKey])).rows[0];
  if (!row) return grid;
  const old=(await executor.query('SELECT generated_grid FROM competition_schedules WHERE event_key=$1',[eventKey])).rows[0]?.generated_grid;
  for (const category of new Set(grid.blocks.filter(b=>!b.kind).map(b=>b.category_key))) {
    const ids=g=>roster(g?.blocks.find(b=>b.category_key===category && b.complex_number===1)).map(team=>team.id).sort().join(',');
    if (grid.blocks.some(b=>b.category_key===category && hasEntries(row.state.workouts[b.id])) && ids(old)!==ids(grid)) throw invalid('Состав категории с результатами изменился. Нельзя пересформировать сетку и потерять результаты');
  }
  return seedResults(grid,row.state);
}

async function publicResults(eventKey) {
  return withTransaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[eventKey]);
    const result=await readResults(eventKey,client);
    const base={name:result.competition.name,hidden:result.hidden,closes_at:result.closes_at};
    if (result.hidden) return base;
    return {...base,categories:result.competition.categories.map(category=>({...category,rows:result.standings[category.key].filter(row=>row.scores.length).map(({name,total,place,scores})=>({name,total,place,scores}))}))};
  });
}

module.exports={points,parseResult,rankWorkout,standings,seedResults,finalStartsAt,latchFinal,readResults,saveResults,guardScheduleChanges,gridWithResults,publicResults};
