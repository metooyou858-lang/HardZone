"use client";

import {Fragment,useEffect,useState} from 'react';
import {maskResultInput,validResultTime} from '@/lib/competition-result-input';
import {fetchCompetitionResults,saveCompetitionResults,resultText,type ResultsData,type ResultKind} from '@/lib/api/competition-results';

const button='min-h-11 rounded-lg border border-[var(--line-soft)] px-4 py-2 text-sm disabled:opacity-40';
const input='min-h-11 w-full min-w-0 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] px-3 py-2 text-sm';
const cell='border-b border-[var(--line-soft)] px-3 py-3 text-left align-middle';
const kindNames:Record<ResultKind,string>={time:'Время, ММ:СС',reps:'Повторения',weight:'Вес, кг',time_or_reps:'Время / повторения'};

export default function CompetitionResultsPanel({eventKey}:{eventKey:string}) {
  const [data,setData]=useState<ResultsData|null>(null);
  const [category,setCategory]=useState('');
  const [complexId,setComplexId]=useState('');
  const [view,setView]=useState<'entry'|'rating'>('entry');
  const [entries,setEntries]=useState<Record<string,string[]>>({});
  const [modes,setModes]=useState<Record<string,('time'|'reps')[]>>({});
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const blocks=data?.blocks.filter(item=>item.category_key===category).sort((a,b)=>a.complex_number-b.complex_number) || [];
  const block=blocks.find(item=>item.id===complexId);
  const workout=data?.state.workouts[complexId];
  const confirmed=workout?.status==='confirmed';
  const timingUrl=`/competitions?event=${encodeURIComponent(eventKey)}&section=schedule`;

  function choose(value:ResultsData,id:string) {
    const selected=value.blocks.find(item=>item.id===id);
    const result=value.state.workouts[id];
    setComplexId(id);setDirty(false);setError('');setNotice('');
    setEntries(Object.fromEntries((selected?.teams || []).map(team=>[team.id,(result?.components || []).map((part,index)=>{
      const score=result?.entries[team.id]?.[index];
      return score && typeof score==='object'?resultText(score.value,score.kind):resultText(score,part.kind);
    })])));
    setModes(Object.fromEntries((selected?.teams || []).map(team=>[team.id,(result?.components || []).map((_,index)=>{
      const score=result?.entries[team.id]?.[index];return score && typeof score==='object'?score.kind:'time';
    })])));
  }
  useEffect(()=>{
    let active=true;
    setBusy(true);
    void fetchCompetitionResults(eventKey).then(value=>{
      if (!active) return;
      setData(value);const key=value.competition.categories[0]?.key || '';setCategory(key);
      choose(value,value.blocks.find(item=>item.category_key===key)?.id || '');
    }).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[eventKey]);
  useEffect(()=>{
    if (!dirty) return;
    const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();};
    window.addEventListener('beforeunload',prevent);
    return ()=>window.removeEventListener('beforeunload',prevent);
  },[dirty]);

  async function refresh() {
    setBusy(true);setError('');
    try {const value=await fetchCompetitionResults(eventKey);setData(value);choose(value,value.blocks.find(item=>item.id===complexId)?.id || value.blocks.find(item=>item.category_key===category)?.id || '');}
    catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить результаты');}finally{setBusy(false);}
  }
  async function save(action:'save'|'confirm'|'reopen') {
    if (!data || !block || !workout) return;
    if (action!=='reopen') {
      for (const team of block.teams) for (const [index,part] of workout.components.entries()) {
        const mode=part.kind==='time_or_reps'?modes[team.id]?.[index] || 'time':part.kind;
        const value=entries[team.id]?.[index] || '';
        if (mode==='time' && value && !validResultTime(value)) {
          setError(`${team.name}, ${part.name}: введите время ММ:СС, секунды от 00 до 59.`);
          return;
        }
      }
    }
    setBusy(true);setError('');setNotice('');
    try {
      const submitted=Object.fromEntries(Object.entries(entries).map(([id,values])=>[id,values.map((value,index)=>workout.components[index].kind==='time_or_reps'?{kind:modes[id]?.[index] || 'time',value}:value)]));
      const value=await saveCompetitionResults(eventKey,data,{action,complex_id:complexId,entries:submitted});
      setData(value);choose(value,complexId);
      setNotice(action==='confirm'?'Комплекс завершён. Итоги и следующие заходы обновлены.':action==='reopen'?'Можно исправить результаты.':'Результаты сохранены.');
    } catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить результаты');}finally{setBusy(false);}
  }
  const blocked=!data?.has_grid || data.grid_stale || !workout;
  const complete=!!block?.teams.length && !!workout && block.teams.every(team=>workout.components.every((_,index)=>entries[team.id]?.[index]?.trim()));
  const printReady=!!block&&!blocked&&block.heats.length>0&&block.heats.every(heat=>heat.slots.length>0&&heat.slots.every(slot=>slot.registration_id&&slot.team_name));
  const printUrl=`/competitions/print?event=${encodeURIComponent(eventKey)}&complex=${encodeURIComponent(complexId)}`;

  return <section className="space-y-4 text-[var(--text-main)]">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-wrap gap-3">
        <label className="min-w-0 text-xs">Категория<select aria-label="Категория результатов" className={`${input} mt-1 block sm:w-56`} disabled={busy || dirty} value={category} onChange={e=>{setCategory(e.target.value);if(data)choose(data,data.blocks.find(item=>item.category_key===e.target.value)?.id || '');}}>{data?.competition.categories.map(item=><option className="bg-white text-black" key={item.key} value={item.key}>{item.name}</option>)}</select></label>
        {view==='entry' && <label className="min-w-0 text-xs">Комплекс<select aria-label="Комплекс результатов" className={`${input} mt-1 block sm:w-56`} disabled={busy || dirty || !blocks.length} value={complexId} onChange={e=>data && choose(data,e.target.value)}>{blocks.map(item=><option className="bg-white text-black" key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      </div>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || dirty} onClick={()=>setView(view==='entry'?'rating':'entry')}>{view==='entry'?'Общий итог':'Ввод результатов'}</button><button className={button} disabled={busy || dirty} onClick={()=>void refresh()}>Обновить</button></div>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--accent)]">{notice}</p>}
    {!data && <p className="py-6 text-sm text-[var(--text-muted)]">{busy?'Загружаем результаты…':'Результаты недоступны. Нажмите «Обновить».'}</p>}
    {data && view==='entry' && <>
      {!block && <p className="py-6 text-sm text-[var(--text-muted)]">В этой категории ещё нет комплексов. <a className="underline" href={timingUrl}>Открыть тайминг</a></p>}
      {block && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-3"><h3 className="text-base font-semibold">{block.name}{workout?.is_final?' · Финал':''}</h3>{printReady?<a className={button} href={printUrl} target="_blank" rel="noreferrer">Печать сетки</a>:<button className={button} type="button" disabled title="Состав заходов ещё не определён">Ожидаются результаты</button>}</div><span className="text-xs text-[var(--text-muted)]">{confirmed?'Комплекс завершён':dirty?'Есть несохранённые результаты':'Ввод результатов'}</span></div>
        {blocked && <p className="text-sm text-[var(--warning)]">{!data.has_grid?'Сначала сформируйте сетку заходов в тайминге.':data.grid_stale?'Обновите сохранённую сетку заходов в тайминге.':'Укажите зачёты в настройках этого комплекса.'} <a className="underline" href={timingUrl}>Открыть тайминг</a></p>}
        {workout && <div className="overflow-x-auto rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)]">
          <table className="w-full border-collapse text-sm"><thead className="text-xs text-[var(--text-muted)]"><tr><th className={`${cell} min-w-40`}>Участник</th>{workout.components.map((part,index)=><Fragment key={index}><th className={`${cell} min-w-48`}><span className="block text-[var(--text-main)]">{part.name}</span><span className="font-normal">{kindNames[part.kind]}</span></th><th className={`${cell} w-20 text-right`}>Место</th><th className={`${cell} w-20 text-right`}>Баллы</th></Fragment>)}</tr></thead>
          <tbody>{block.teams.map(team=><tr key={team.id} className="focus-within:bg-white/[0.03]"><th scope="row" className={`${cell} max-w-64 font-medium [overflow-wrap:anywhere]`}>{team.name}<span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">Заход {team.heat} · Дорожка {team.lane}</span></th>{workout.components.map((part,index)=>{
            const mode=part.kind==='time_or_reps'?modes[team.id]?.[index] || 'time':part.kind;
            const rank=block.rankings[index]?.find(item=>item.id===team.id);
            return <Fragment key={index}><td className={cell}><div className="flex min-w-44 items-center gap-2">
              {part.kind==='time_or_reps' && <select className={`${input} !w-24 shrink-0`} aria-label={`Тип результата: ${team.name}, ${part.name}`} disabled={busy || confirmed || blocked} value={mode} onChange={e=>{setModes(current=>({...current,[team.id]:workout.components.map((_,i)=>i===index?e.target.value as 'time'|'reps':current[team.id]?.[i] || 'time')}));setEntries(current=>({...current,[team.id]:workout.components.map((_,i)=>i===index?'':current[team.id]?.[i] || '')}));setDirty(true);setNotice('');}}><option className="bg-white text-black" value="time">Время</option><option className="bg-white text-black" value="reps">Повторы</option></select>}
              <input className={`${input} min-w-24 tabular-nums`} aria-label={`${team.name}, ${part.name}`} disabled={busy || confirmed || blocked} inputMode={mode==='weight'?'decimal':'numeric'} placeholder={mode==='time'?'ММ:СС':'0'} value={entries[team.id]?.[index] ?? ''} onChange={e=>{const value=maskResultInput(e.target.value,mode);setEntries(current=>({...current,[team.id]:workout.components.map((_,i)=>i===index?value:current[team.id]?.[i] || '')}));setDirty(true);setError('');setNotice('');}} />
            </div></td><td className={`${cell} text-right tabular-nums`}>{dirty?'—':rank?.place ?? '—'}</td><td className={`${cell} text-right tabular-nums`}>{dirty?'—':rank?.points ?? '—'}</td></Fragment>;
          })}</tr>)}</tbody></table>
          {!block.teams.length && <p className={`p-4 text-sm ${block.qualification_error?'text-[var(--danger)]':'text-[var(--text-muted)]'}`}>{block.qualification_error || (block.complex_number>1?'Участники появятся после завершения предыдущих комплексов.':'В сетке пока нет участников.')}</p>}
        </div>}
        {workout && <div className="flex flex-wrap items-center gap-3">
          {confirmed?<button className={button} disabled={busy || blocked} onClick={()=>void save('reopen')}>Исправить результаты</button>:<><button className={`${button} bg-[var(--accent)] text-[#062b26]`} disabled={busy || blocked || !dirty || !block.teams.length} onClick={()=>void save('save')}>{busy?'Сохраняем…':'Сохранить'}</button><button className={button} disabled={busy || blocked || !complete} onClick={()=>void save('confirm')}>Завершить комплекс</button></>}
          {dirty && <button className={button} disabled={busy} onClick={()=>choose(data,complexId)}>Отменить изменения</button>}
          {!confirmed && <span className="text-xs text-[var(--text-muted)]">Места и баллы — после сохранения. Общий итог — после завершения комплекса.</span>}
        </div>}
      </>}
    </>}
    {data && view==='rating' && <>
      <div className="overflow-x-auto rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)]"><table className="w-full text-sm"><thead className="text-xs text-[var(--text-muted)]"><tr><th className={cell}>Место</th><th className={`${cell} min-w-40`}>Участник</th>{blocks.flatMap(item=>(data.state.workouts[item.id]?.components || []).map((part,index)=><th key={`${item.id}-${index}`} className={`${cell} min-w-32 text-right`}>{item.name}<span className="block font-normal">{part.name}</span></th>))}<th className={`${cell} text-right`}>Всего</th></tr></thead><tbody>{(data.standings[category] || []).map(row=><tr key={row.id}><td className={cell}>{row.place ?? '—'}</td><th scope="row" className={`${cell} max-w-64 font-medium [overflow-wrap:anywhere]`}>{row.name}</th>{blocks.flatMap(item=>(data.state.workouts[item.id]?.components || []).map((part,index)=>{
        const score=row.scores.filter(score=>score.complex_id===item.id)[index];
        return <td key={`${item.id}-${index}`} className={`${cell} text-right tabular-nums`}>{score?<><strong>{score.points}</strong><span className="block text-xs text-[var(--text-muted)]">{resultText(score.value,score.kind)} · {score.place} место</span></>:'—'}</td>;
      }))}<td className={`${cell} text-right font-semibold tabular-nums`}>{row.scores.length?row.total:'—'}</td></tr>)}</tbody></table>{!data.standings[category]?.length && <p className="p-4 text-sm text-[var(--text-muted)]">Пока нет участников в сетке.</p>}</div>
      <p className="text-xs text-[var(--text-muted)]">Учитываются завершённые комплексы. При равной сумме выше участник с большим числом первых мест, затем вторых и далее.</p>
    </>}
    {data && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-soft)] pt-3 text-xs text-[var(--text-muted)]"><span>{data.hidden?'Публичные результаты скрыты с начала финала.':data.closes_at?'Публичные результаты скроются с началом финала.':'Публикуются только завершённые комплексы.'}</span><a className="inline-flex min-h-11 items-center underline" target="_blank" rel="noreferrer" href={`/competition/results?event=${encodeURIComponent(eventKey)}`}>Таблица для участников</a></div>}
  </section>;
}
