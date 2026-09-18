const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { randomUUID } = require('node:crypto');
const { pool } = require('../src/db');
const { createCompetitionEvent, updateCompetitionEvent } = require('../src/services/competition-events');
const { createCompetitionRegistration } = require('../src/services/competition-registration');
const { normalizeSchedule, buildSchedule, readSchedule, saveSchedule, generateSchedule, planActivity, previewActivity } = require('../src/services/competition-schedule');

const competition = { name:'Соревнование',date:'2026-10-10',categories:[{key:'amateur',name:'Любители'},{key:'advanced',name:'Продвинутые'}] };
const complex = (patch={}) => ({id:randomUUID(),name:'Комплекс 1',start_time:'09:00',briefing_time:'08:45',venue:'Основной зал',lanes:4,duration_minutes:10,gap_minutes:3,break_after_minutes:15,...patch});
const plan = (complexes=[complex()],planned_count=null) => ({categories:[{category_key:'amateur',planned_count,complexes}]});
const teams = Array.from({length:10},(_,i)=>({id:String(i+1),team_name:`Команда ${i+1}`,category:'amateur',created_at:new Date(2026,8,1,0,i),status:'registered',payment_status:'paid'}));
const keys=[];

const activity = (patch={}) => ({id:randomUUID(),kind:'break',name:'Перерыв',venue:'Основной зал',start_time:'09:00',duration_minutes:15,...patch});
const currentPlan = config => ({config,competition,confirmed_counts:{amateur:0,advanced:0},preview:buildSchedule(config,competition,[]),source_hash:'test'});

test('insertion delays the whole complex including briefing, propagates by category across venues, preserves unrelated venue',()=>{
  const first=complex({start_time:'09:00',briefing_time:'08:45',break_after_minutes:0});
  const second=complex({start_time:'09:15',briefing_time:null,venue:'Улица',break_after_minutes:0});
  const other=complex({start_time:'09:00',briefing_time:null,venue:'Другой зал',break_after_minutes:0});
  const config={categories:[{category_key:'amateur',planned_count:4,complexes:[first,second]},{category_key:'advanced',planned_count:4,complexes:[other]}]};
  const result=planActivity(currentPlan(config),activity({start_time:'08:50'}));
  assert.equal(result.shifts.length,2);
  assert.equal(result.shifts[0].briefing_after,'09:05');
  assert.equal(result.shifts[0].after,'09:20');
  assert.equal(result.shifts[1].after,'09:30');
  assert.equal(result.config.categories[1].complexes[0].start_time,'09:00');
  assert.equal(config.categories[0].complexes[0].start_time,'09:00');
  assert.deepEqual(result.errors,[]);
});

test('free interval absorbs insertion; awards are shared without categories and take part in timing',()=>{
  const config=plan([complex({start_time:'10:00',briefing_time:null,break_after_minutes:0})],4);
  const result=planActivity(currentPlan(config),activity());
  assert.deepEqual(result.shifts,[]);
  const awards=planActivity(currentPlan(result.config),activity({kind:'awards',name:'Награждение',start_time:'10:10',duration_minutes:30}));
  assert.deepEqual(awards.errors,[]);
  assert.equal(awards.end_after,'10:40');
  assert.equal(awards.config.activities[1].category_key,undefined);
});

test('editing does not duplicate activity; shrinking and deletion do not pull later starts backwards',()=>{
  const pause=activity();
  const config={...plan([complex({start_time:'09:15',briefing_time:null,break_after_minutes:0})],4),activities:[pause]};
  const result=planActivity(currentPlan(config),{...pause,duration_minutes:5});
  assert.equal(result.config.activities.length,1);
  assert.deepEqual(result.shifts,[]);
  assert.equal(buildSchedule({...result.config,activities:[]},competition,[]).blocks[0].start_time,'09:15');
});

test('insertion refuses overflow and validates activities including duplicate ids',()=>{
  const last=complex({start_time:'23:40',briefing_time:null,break_after_minutes:0});
  assert.throws(()=>planActivity(currentPlan(plan([last],4)),activity({start_time:'23:40',duration_minutes:30})),/пределы дня/);
  assert.throws(()=>normalizeSchedule({...plan([last],4),activities:[activity({id:last.id})]},competition),/повторяющийся/);
  assert.throws(()=>normalizeSchedule({...plan(),activities:{}},competition),/100/);
});

test('activity preview is read-only, shifted plan preserves snapshot and source hash guards stale acceptance',async()=>{
  const event=await createCompetitionEvent({name:'Пункты расписания',date:'2026-10-10',location:'Зал',fee_rubles:3500,registration_enabled:false,categories:competition.categories,terms_text:'Тест'}); keys.push(event.event_key);
  let saved=await saveSchedule(event.event_key,{revision:0,config:plan([complex({briefing_time:null,break_after_minutes:0})],4)});
  saved=await generateSchedule(event.event_key,{revision:saved.revision,source_hash:saved.source_hash});
  const result=await previewActivity(event.event_key,{revision:saved.revision,activity:activity()});
  assert.deepEqual((await readSchedule(event.event_key)).config,saved.config);
  await assert.rejects(saveSchedule(event.event_key,{revision:saved.revision,config:result.config,source_hash:'stale'}),/Состав команд изменился/);
  const changed=await saveSchedule(event.event_key,{revision:saved.revision,config:result.config,source_hash:result.source_hash});
  assert.deepEqual(changed.grid,saved.grid);
  assert.equal(changed.grid_stale,true);
  const generated=await generateSchedule(event.event_key,{revision:changed.revision,source_hash:changed.source_hash});
  assert.equal(generated.grid.blocks[0].kind,'break');
  assert.equal(generated.grid.blocks[1].start_time,'09:15');
});

test('moving a complex preserves its id and settings, uses target count and leaves the saved grid unchanged',async()=>{
  const event=await createCompetitionEvent({name:'Перенос комплекса',date:'2026-10-10',location:'Зал',fee_rubles:3500,registration_enabled:false,categories:competition.categories,terms_text:'Тест'}); keys.push(event.event_key);
  const moved=complex({start_time:'11:00',briefing_time:null});
  const existing=complex({start_time:'09:00',briefing_time:null});
  let result=await saveSchedule(event.event_key,{revision:0,config:{categories:[{category_key:'amateur',planned_count:8,complexes:[moved]},{category_key:'advanced',planned_count:12,complexes:[existing]}]}});
  result=await generateSchedule(event.event_key,{revision:result.revision,source_hash:result.source_hash});
  const snapshot=result.grid;
  result=await saveSchedule(event.event_key,{revision:result.revision,config:{categories:[{category_key:'amateur',planned_count:8,complexes:[]},{category_key:'advanced',planned_count:12,complexes:[existing,moved]}]}});
  assert.deepEqual(result.config.categories[1].complexes,[existing,moved]);
  assert.equal(result.preview.blocks.find(b=>b.id===moved.id).planned_count,12);
  assert.equal(result.preview.blocks.find(b=>b.id===moved.id).assignment,'results');
  assert.equal(result.preview.blocks.filter(b=>b.id===moved.id).length,1);
  assert.deepEqual(result.grid,snapshot);
  assert.equal(result.grid_stale,true);
});

test('disabled briefing does not reserve the venue from midnight, while explicit midnight remains a time',()=>{
  const config={categories:[{category_key:'amateur',planned_count:8,complexes:[complex({start_time:'10:20',briefing_time:'10:00',duration_minutes:12,break_after_minutes:5})]},{category_key:'advanced',planned_count:8,complexes:[complex({start_time:'10:55',briefing_time:null,break_after_minutes:5})]}]};
  const grid=buildSchedule(normalizeSchedule(config,competition),competition,[]);
  assert.deepEqual(grid.errors,[]);
  assert.equal(grid.start_time,'10:00');
  assert.equal(grid.blocks[1].briefing_time,null);
  config.categories[1].complexes[0].briefing_time='00:00';
  const midnight=buildSchedule(normalizeSchedule(config,competition),competition,[]);
  assert.equal(midnight.start_time,'00:00');
  assert.match(midnight.errors.join(' '),/пересекаются/);
});
after(async()=>{
  await pool.query('DELETE FROM competition_schedules WHERE event_key=ANY($1::TEXT[])',[keys]);
  await pool.query('DELETE FROM competition_email_jobs WHERE registration_id IN (SELECT id FROM competition_registrations WHERE event_key=ANY($1::TEXT[]))',[keys]);
  await pool.query('DELETE FROM competition_registrations WHERE event_key=ANY($1::TEXT[])',[keys]);
  await pool.query('DELETE FROM competition_events WHERE event_key=ANY($1::TEXT[])',[keys]);
  await pool.end();
});

test('first complex uses reverse registration order with a partial first heat and correct timing',()=>{
  const grid=buildSchedule(normalizeSchedule(plan(),competition),competition,teams);
  assert.deepEqual(grid.errors,[]);
  assert.deepEqual(grid.blocks[0].heats.map(h=>h.slots.length),[2,4,4]);
  assert.deepEqual(grid.blocks[0].heats.flatMap(h=>h.slots.map(s=>s.registration_id)),['10','9','8','7','6','5','4','3','2','1']);
  assert.deepEqual(grid.blocks[0].heats.map(h=>h.start_time),['09:00','09:13','09:26']);
  assert.equal(grid.blocks[0].end_time,'09:36'); assert.equal(grid.end_time,'09:51'); assert.equal(grid.start_time,'08:45');
});

test('later complexes reserve all places without assigning participants prematurely',()=>{
  const grid=buildSchedule(plan([complex(),complex({name:'Комплекс 2',start_time:'10:00',briefing_time:null,lanes:3})]),competition,teams);
  assert.deepEqual(grid.errors,[]);
  assert.equal(grid.blocks[1].assignment,'results');
  assert.deepEqual(grid.blocks[1].heats.map(h=>h.slots.length),[1,3,3,3]);
  assert.ok(grid.blocks[1].heats.every(h=>h.slots.every(s=>s.registration_id===null)));
});

test('explicit planned count reserves capacity; smaller capacity and zero actual participants block generation',()=>{
  const reserved=buildSchedule(plan([complex()],12),competition,teams);
  assert.equal(reserved.blocks[0].heats.flatMap(h=>h.slots).length,12);
  assert.equal(reserved.blocks[0].heats.flatMap(h=>h.slots).filter(s=>!s.registration_id).length,2);
  assert.match(buildSchedule(plan([complex()],8),competition,teams).errors.join(' '),/уже оплачено 10/);
  assert.match(buildSchedule(plan(),competition,[]).errors.join(' '),/нет оплаченных/);
});

test('cancelled and unpaid participants are not assigned, equal timestamps use registration id',()=>{
  const rows=[...teams.slice(0,2).map(r=>({...r,created_at:new Date('2026-01-01')})),{...teams[2],status:'cancelled'},{...teams[3],payment_status:'processing'}];
  const grid=buildSchedule(plan(),competition,rows);
  assert.deepEqual(grid.blocks[0].heats[0].slots.map(s=>s.registration_id),['2','1']);
});

test('shared venues include briefing and breaks; independent venues may overlap',()=>{
  const config=plan([complex()],4);
  config.categories.push({category_key:'advanced',planned_count:4,complexes:[complex({venue:'основной зал',start_time:'09:30',briefing_time:'09:20'})]});
  assert.match(buildSchedule(config,competition,[]).errors.join(' '),/Площадка/);
  config.categories[1].complexes[0].briefing_time='09:25';
  assert.deepEqual(buildSchedule(config,competition,[]).errors,[]);
  config.categories[1].complexes[0].venue='Улица'; config.categories[1].complexes[0].start_time='09:00'; config.categories[1].complexes[0].briefing_time=null;
  assert.deepEqual(buildSchedule(config,competition,[]).errors,[]);
});

test('same category cannot overlap between venues; invalid briefing and day overflow are reported',()=>{
  const config=plan([complex(),complex({venue:'Улица',start_time:'09:10',briefing_time:null})],4);
  assert.match(buildSchedule(config,competition,[]).errors.join(' '),/раньше завершения/);
  assert.match(buildSchedule(plan([complex({briefing_time:'09:01'})],4),competition,[]).errors.join(' '),/брифинг/);
  assert.match(buildSchedule(plan([complex({start_time:'23:59',briefing_time:null})],4),competition,[]).errors.join(' '),/пределы дня/);
});

test('input validation rejects foreign categories, duplicate complexes and invalid numbers',()=>{
  for(const patch of [{lanes:0},{duration_minutes:0},{gap_minutes:-1},{lanes:1.5},{start_time:'25:00'},{venue:''}]) assert.throws(()=>normalizeSchedule(plan([complex(patch)]),competition));
  const c=complex(); assert.throws(()=>normalizeSchedule(plan([c,c]),competition),/повторяющийся/);
  assert.throws(()=>normalizeSchedule({categories:[{category_key:'foreign',complexes:[]}]},competition),/отсутствует/);
});

test('saved grid is isolated, frozen across edits and new payments, with optimistic conflict protection',async()=>{
  const event=await createCompetitionEvent({name:'Тест сетки',date:'2026-10-10',location:'Зал',fee_rubles:3500,registration_enabled:true,categories:competition.categories,terms_text:'Тест'});
  keys.push(event.event_key);
  process.env.COMPETITION_PAYMENT_ENABLED='true';
  const reg=await createCompetitionRegistration({team_name:'Тестовая команда',team_email:'test@example.ru',category:'amateur',male_name:'Иван',female_name:'Анна',male_phone:'79997770101',female_phone:'79997770102',terms_accepted:true,personal_data_accepted:true},event.event_key);
  const rawBefore=(await pool.query('SELECT * FROM competition_registrations WHERE id=$1',[reg.id])).rows[0];
  let result=await saveSchedule(event.event_key,{config:plan([complex()],4),revision:0});
  result=await generateSchedule(event.event_key,{revision:result.revision,source_hash:result.source_hash});
  const frozen=result.grid;
  assert.equal(result.grid_stale,false);
  assert.deepEqual((await pool.query('SELECT * FROM competition_registrations WHERE id=$1',[reg.id])).rows[0],rawBefore);
  await pool.query("UPDATE competition_registrations SET payment_status='paid' WHERE id=$1",[reg.id]);
  const changed=await readSchedule(event.event_key);
  assert.equal(changed.grid_stale,true); assert.deepEqual(changed.grid,frozen);
  await assert.rejects(generateSchedule(event.event_key,{revision:result.revision,source_hash:result.source_hash}),/изменились/);
  result=await generateSchedule(event.event_key,{revision:changed.revision,source_hash:changed.source_hash});
  assert.equal(result.grid.blocks[0].heats[0].slots[0].registration_id,reg.id);
  const oldRevision=result.revision;
  result=await saveSchedule(event.event_key,{revision:oldRevision,config:plan([complex({start_time:'10:00'})],4)});
  assert.equal(result.grid.blocks[0].start_time,'09:00'); assert.equal(result.preview.blocks[0].start_time,'10:00'); assert.equal(result.grid_stale,true);
  await assert.rejects(saveSchedule(event.event_key,{revision:oldRevision,config:plan()}),/другой вкладке/);
  const other=await createCompetitionEvent({name:'Другое',date:'2026-10-10',location:'Зал',fee_rubles:3500,registration_enabled:false,categories:competition.categories,terms_text:'Тест'}); keys.push(other.event_key);
  assert.equal((await readSchedule(other.event_key)).grid,null);
  await assert.rejects(readSchedule('missing-event'),/не найдено/);
});

test('conflicting schedule can be saved for correction but cannot become the fixed grid',async()=>{
  const event=await createCompetitionEvent({name:'Конфликты',date:'2026-10-10',location:'Зал',fee_rubles:3500,registration_enabled:false,categories:competition.categories,terms_text:'Тест'}); keys.push(event.event_key);
  const result=await saveSchedule(event.event_key,{revision:0,config:plan([complex(),complex()],4)});
  assert.ok(result.preview.errors.length);
  await assert.rejects(generateSchedule(event.event_key,{revision:result.revision,source_hash:result.source_hash}),/пересекаются/);
  await assert.rejects(updateCompetitionEvent(event.event_key,{...event,categories:[competition.categories[1]]}),/с комплексами/);
  assert.equal((await readSchedule(event.event_key)).grid,null);
});

test('deleting a complex preserves other categories and deleting the last leaves an empty persisted plan',async()=>{
  const event=await createCompetitionEvent({name:'Удаление комплекса',date:'2026-10-10',location:'Зал',fee_rubles:3500,registration_enabled:false,categories:competition.categories,terms_text:'Тест'}); keys.push(event.event_key);
  const first=complex(); const second=complex({venue:'Улица'});
  let result=await saveSchedule(event.event_key,{revision:0,config:{categories:[{category_key:'amateur',planned_count:10,complexes:[first]},{category_key:'advanced',planned_count:6,complexes:[second]}]}});
  result=await generateSchedule(event.event_key,{revision:result.revision,source_hash:result.source_hash});
  const frozen=result.grid;
  const remove=id=>({categories:result.config.categories.map(item=>({...item,complexes:item.complexes.filter(c=>c.id!==id)}))});
  result=await saveSchedule(event.event_key,{revision:result.revision,config:remove(first.id)});
  assert.deepEqual(result.preview.blocks.map(b=>b.id),[second.id]);
  assert.equal(result.config.categories[0].planned_count,10);
  assert.equal(result.config.categories[1].planned_count,6);
  result=await saveSchedule(event.event_key,{revision:result.revision,config:remove(second.id)});
  const reloaded=await readSchedule(event.event_key);
  assert.deepEqual(reloaded.preview.blocks,[]);
  assert.equal(reloaded.preview.start_time,null);
  assert.deepEqual(reloaded.grid,frozen);
  assert.equal(reloaded.grid_stale,true);
});
