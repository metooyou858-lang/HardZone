const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function fixture(workouts={}) {
  let row={state:{workouts},revision:1,hidden_at:null};
  const executor={query:async(sql,args)=>{
    if (sql.startsWith('SELECT')) return {rows:[row]};
    if (sql.startsWith('INSERT')) row={...row,state:args[1],revision:row.revision+1};
    if (sql.startsWith('UPDATE')) row.hidden_at='latched';
    return {rows:[]};
  }};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/services/competition-results.js'),'utf8'),{
    module,require:name=>name==='../db'?{pool:executor}:{},structuredClone,Date,console,
  });
  return {service:module.exports,executor,row:()=>row};
}
const scoring={components:[{name:'Повторения',kind:'reps'}],is_final:false};
const schedule={competition:{date:'2020-01-01'},grid:null,config:{categories:[]}};
const input=value=>({categories:[{category_key:'cat',complexes:[{id:'first',scoring:value}]}]});

test('timing saves two scores without a grid and preserves other results',async()=>{
  const old={components:scoring.components,is_final:false,entries:{1:[12]},status:'confirmed'};
  const f=fixture({other:old});
  await f.service.saveScheduleScoring('event',schedule,input({...scoring,components:[...scoring.components,{name:'Вес',kind:'weight'}]}),f.executor);
  assert.equal(f.row().state.workouts.first.components.length,2);
  assert.deepEqual(f.row().state.workouts.other,old);
});

test('existing scores block changed settings but allow saving unchanged timing',async()=>{
  const f=fixture({first:{...scoring,entries:{1:[0]},status:'draft'}});
  await f.service.saveScheduleScoring('event',schedule,input(scoring),f.executor);
  assert.equal(f.row().revision,1);
  await assert.rejects(f.service.saveScheduleScoring('event',schedule,input({...scoring,components:[{name:'Время',kind:'time'}]}),f.executor),/после ввода/);
  assert.equal(f.row().state.workouts.first.entries[1][0],0);
});

test('invalid scoring and a nonlast final are rejected',async()=>{
  const f=fixture();
  for (const components of [[],[null],[{name:'',kind:'time'}],[{name:'Неверно',kind:'unknown'}]]) {
    await assert.rejects(f.service.saveScheduleScoring('event',schedule,input({...scoring,components}),f.executor));
  }
  const config=input({...scoring,is_final:true});config.categories[0].complexes.push({id:'second'});
  await assert.rejects(f.service.saveScheduleScoring('event',schedule,config,f.executor),/последний/);
});

test('removing a started final marker does not publish or hide results',async()=>{
  const f=fixture({first:{...scoring,is_final:true,entries:{},status:'draft'}});
  await f.service.saveScheduleScoring('event',{...schedule,grid:{event_date:'2020-01-01',blocks:[{id:'first',start_time:'09:00'}]}},input(scoring),f.executor);
  assert.equal(f.row().hidden_at,null);
  assert.equal(f.row().state.workouts.first.is_final,false);
});
