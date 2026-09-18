const assert=require('node:assert/strict');
const {test,after}=require('node:test');
const {randomUUID}=require('node:crypto');
const {pool}=require('../src/db');
const {createCompetitionEvent}=require('../src/services/competition-events');
const {createCompetitionRegistration}=require('../src/services/competition-registration');
const {saveSchedule,readSchedule,generateSchedule}=require('../src/services/competition-schedule');
const {points,parseResult,rankWorkout,standings,readResults,saveResults,publicResults,latchFinal,finalStartsAt}=require('../src/services/competition-results');
const keys=[];
const teams=Array.from({length:8},(_,i)=>({id:String(i+1),name:`Команда ${i+1}`}));
const config={name:'Результат',kind:'reps'};

test('place points and shared places use gaps; zero is a result, empty is not',()=>{
  assert.deepEqual([1,2,3,4,5,6,7,10,11,31,32,100].map(points),[100,95,90,85,80,77,74,65,62,2,0,0]);
  const entries=Object.fromEntries(teams.map((t,i)=>[t.id,[[10,9,8,7,6,6,5,0][i]]]));
  const ranked=rankWorkout({components:[config],entries},teams)[0];
  assert.deepEqual(ranked.map(r=>r.place),[1,2,3,4,5,5,7,8]);
  assert.deepEqual(ranked.slice(4,7).map(r=>r.points),[80,80,74]);
  assert.equal(parseResult('07:38','time'),458);
  assert.equal(parseResult('0','reps'),0);
  assert.equal(parseResult('95,25','weight'),95.25);
  assert.equal(parseResult('','time'),null);
  for(const value of ['1:60','-1:30','NaN']) assert.throws(()=>parseResult(value,'time'));
  assert.throws(()=>parseResult('1.5','reps'));
});

test('total ranking counts best places; equal totals and place histograms share rank',()=>{
  const block={id:'a',category_key:'cat',complex_number:1,name:'Комплекс',heats:[{number:1,slots:teams.slice(0,3).map((t,i)=>({registration_id:t.id,team_name:t.name,lane:i+1}))}]};
  const state={workouts:{a:{status:'confirmed',components:[config,config],entries:{1:[30,10],2:[20,20],3:[10,30]}}}};
  const rating=standings([block],state,'cat');
  assert.deepEqual(rating.map(r=>[r.id,r.total,r.place]),[['1',190,1],['3',190,1],['2',190,3]]);
  state.workouts.a.status='draft';
  assert.ok(standings([block],state,'cat').every(r=>r.place===null && r.scores.length===0));
});

test('results lifecycle, next heat seeding, privacy latch and event isolation',async()=>{
  const event=await createCompetitionEvent({name:'Проверка результатов',date:'2026-10-10',location:'Зал',fee_rubles:3500,registration_enabled:true,categories:[{key:'cat',name:'Категория'}],terms_text:'Тест'});keys.push(event.event_key);
  const ids=[];
  for(let i=0;i<3;i++) {
    const reg=await createCompetitionRegistration({team_name:`Команда ${i+1}`,team_email:'test@example.ru',category:'cat',male_name:'Иван',female_name:'Анна',male_phone:`7999777100${i}`,female_phone:`7999777200${i}`,terms_accepted:true,personal_data_accepted:true},event.event_key);
    ids.push(reg.id);
    await pool.query("UPDATE competition_registrations SET payment_status='paid' WHERE id=$1",[reg.id]);
  }
  const complex=(name,start)=>({id:randomUUID(),name,start_time:start,briefing_time:null,venue:'Зал',lanes:2,duration_minutes:10,gap_minutes:3,break_after_minutes:0});
  const first=complex('Первый','09:00'),second=complex('Финал','10:00');
  let schedule=await saveSchedule(event.event_key,{revision:0,config:{categories:[{category_key:'cat',planned_count:4,complexes:[first,second]}]}});
  schedule=await generateSchedule(event.event_key,{revision:schedule.revision,source_hash:schedule.source_hash});
  const times=JSON.stringify(schedule.grid.blocks.map(b=>b.heats.map(h=>[h.start_time,h.end_time])));
  let data=await readResults(event.event_key);
  const apply=async input=>{data=await saveResults(event.event_key,{revision:data.revision,schedule_revision:data.schedule_revision,source_hash:data.source_hash,...input});return data;};
  await apply({action:'settings',complex_id:first.id,components:[config],is_final:false});
  await apply({action:'settings',complex_id:second.id,components:[{name:'Время',kind:'time'},{name:'Вес',kind:'weight'}],is_final:true});
  assert.equal(data.closes_at,'2026-10-10T00:00:00.000Z');
  assert.equal(finalStartsAt({...schedule,grid:schedule.grid},{workouts:{[second.id]:{is_final:true}}}),'2026-10-10T00:00:00.000Z');
  const entries=Object.fromEntries(ids.map((id,i)=>[id,[String((i+1)*10)]]));
  const incomplete={...entries,[ids[0]]:['']};
  await apply({action:'save',complex_id:first.id,entries:incomplete});
  assert.equal((await publicResults(event.event_key)).categories[0].rows.length,0);
  await assert.rejects(apply({action:'confirm',complex_id:first.id,entries:incomplete}),/все результаты/);
  await assert.rejects(apply({action:'save',complex_id:first.id,entries:{...entries,999:['1']}}),/отсутствует/);
  await apply({action:'confirm',complex_id:first.id,entries});
  schedule=await readSchedule(event.event_key);
  assert.equal(JSON.stringify(schedule.grid.blocks.map(b=>b.heats.map(h=>[h.start_time,h.end_time]))),times);
  assert.deepEqual(schedule.grid.blocks[1].heats.flatMap(h=>h.slots).map(s=>s.registration_id),[ids[0],ids[1],ids[2],null]);
  const publicly=await publicResults(event.event_key);
  assert.equal(publicly.categories[0].rows[0].total,100);
  assert.ok(!JSON.stringify(publicly).includes('test@example'));
  assert.ok(!JSON.stringify(publicly).includes('registration_id'));
  const finalEntries=Object.fromEntries(ids.map((id,i)=>[id,[`0${i+1}:00`,String(100+i)]]));
  await apply({action:'save',complex_id:second.id,entries:finalEntries});
  await assert.rejects(apply({action:'reopen',complex_id:first.id}),/уже есть результаты/);
  await assert.rejects(saveSchedule(event.event_key,{revision:schedule.revision,config:{categories:[{category_key:'cat',planned_count:4,complexes:[second]}]}}),/Нельзя удалить/);
  await latchFinal(event.event_key,schedule,pool,Date.parse('2026-10-10T00:00:00Z'));
  const hidden=await publicResults(event.event_key);
  assert.equal(hidden.hidden,true);assert.equal(hidden.categories,undefined);
  assert.equal((await readResults(event.event_key)).blocks[0].rankings[0].length,3);
  schedule=await saveSchedule(event.event_key,{revision:schedule.revision,config:{categories:[{category_key:'cat',planned_count:4,complexes:[first,{...second,start_time:'11:00'}]}]}});
  schedule=await generateSchedule(event.event_key,{revision:schedule.revision,source_hash:schedule.source_hash});
  assert.equal((await publicResults(event.event_key)).hidden,true);
  const other=await createCompetitionEvent({name:'Другое',date:'2026-10-10',location:'Зал',fee_rubles:3500,registration_enabled:false,categories:[{key:'cat',name:'Категория'}],terms_text:'Тест'});keys.push(other.event_key);
  assert.deepEqual((await readResults(other.event_key)).state,{workouts:{}});
  await assert.rejects(saveResults(event.event_key,{revision:0,schedule_revision:0,source_hash:'old',complex_id:first.id,action:'reopen'}),/изменились/);
});

after(async()=>{
  await pool.query('DELETE FROM competition_schedules WHERE event_key=ANY($1::TEXT[])',[keys]);
  await pool.query('DELETE FROM competition_email_jobs WHERE registration_id IN (SELECT id FROM competition_registrations WHERE event_key=ANY($1::TEXT[]))',[keys]);
  await pool.query('DELETE FROM competition_registrations WHERE event_key=ANY($1::TEXT[])',[keys]);
  await pool.query('DELETE FROM competition_events WHERE event_key=ANY($1::TEXT[])',[keys]);
  await pool.end();
});
