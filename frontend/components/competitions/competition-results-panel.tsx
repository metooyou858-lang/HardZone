"use client";

import {useCallback,useEffect,useState} from 'react';
import {fetchCompetitionResults,saveCompetitionResults,resultText,type ResultsData,type ResultComponent,type ResultKind} from '@/lib/api/competition-results';

const button='min-h-11 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2 text-sm enabled:hover:bg-[var(--accent)] enabled:hover:text-[#062b26] disabled:opacity-40';
const input='min-h-11 w-full min-w-0 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] px-3 py-2 text-sm';
const kindNames={time:'Время, ММ:СС',reps:'Повторения',weight:'Вес, кг',time_or_reps:'Время или повторения'};

export default function CompetitionResultsPanel({eventKey}:{eventKey:string}) {
  const [data,setData]=useState<ResultsData|null>(null);
  const [category,setCategory]=useState('');
  const [complexId,setComplexId]=useState('');
  const [view,setView]=useState<'entry'|'rating'>('entry');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [dirty,setDirty]=useState(false);
  const [settings,setSettings]=useState(false);
  const [components,setComponents]=useState<ResultComponent[]>([{name:'Результат',kind:'time'}]);
  const [final,setFinal]=useState(false);
  const [entries,setEntries]=useState<Record<string,string[]>>({});
  const [entryModes,setEntryModes]=useState<Record<string,('time'|'reps')[]>>({});
  const blocks=data?.blocks.filter(block=>block.category_key===category) || [];
  const block=blocks.find(item=>item.id===complexId);
  const workout=data?.state.workouts[complexId];
  const confirmed=workout?.status==='confirmed';

  function choose(value:ResultsData,id:string) {
    const current=value.blocks.find(item=>item.id===id);
    const result=value.state.workouts[id];
    const parts=result?.components || [{name:'Результат',kind:'time' as const}];
    setComplexId(id);setComponents(parts);setFinal(result?.is_final || false);setSettings(!result);setDirty(false);
    setEntries(Object.fromEntries((current?.teams || []).map(team=>[team.id,parts.map((part,i)=>{const value=result?.entries[team.id]?.[i];return value && typeof value==='object'?resultText(value.value,value.kind):resultText(value,part.kind);})])));
    setEntryModes(Object.fromEntries((current?.teams || []).map(team=>[team.id,parts.map((_,i)=>{const value=result?.entries[team.id]?.[i];return value && typeof value==='object'?value.kind:'time';})])));
  }
  const load=useCallback(async()=>{
    setBusy(true);setError('');
    try {
      const value=await fetchCompetitionResults(eventKey);setData(value);
      const key=category || value.competition.categories[0]?.key || '';setCategory(key);
      choose(value,value.blocks.find(item=>item.id===complexId)?.id || value.blocks.find(item=>item.category_key===key)?.id || '');
    }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить результаты');}finally{setBusy(false);}
  },[eventKey,category,complexId]);
  useEffect(()=>{void fetchCompetitionResults(eventKey).then(value=>{setData(value);const key=value.competition.categories[0]?.key || '';setCategory(key);choose(value,value.blocks.find(item=>item.category_key===key)?.id || '');}).catch(e=>setError(e.message));},[eventKey]);

  async function save(action:'settings'|'save'|'confirm'|'reopen') {
    if (!data || !block) return;
    setBusy(true);setError('');setNotice('');
    try {
      const submitted=Object.fromEntries(Object.entries(entries).map(([id,values])=>[id,values.map((value,i)=>workout?.components[i]?.kind==='time_or_reps'?{kind:entryModes[id]?.[i] || 'time',value}:value)]));
      const value=await saveCompetitionResults(eventKey,data,{action,complex_id:block.id,components,is_final:final,entries:submitted});
      setData(value);choose(value,block.id);
      setNotice(action==='confirm'?'Результаты подтверждены. Общий рейтинг и состав следующего комплекса обновлены. В разделе заходов нажмите «Обновить данные».':action==='reopen'?'Результаты открыты для исправления. Следующий комплекс ожидает повторного подтверждения.':'Сохранено.');
    }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить');}finally{setBusy(false);}
  }
  async function copyLink() {
    try {await navigator.clipboard.writeText(`${window.location.origin}/competition/results?event=${encodeURIComponent(eventKey)}`);setNotice('Ссылка для участников скопирована.');}catch{setError('Не удалось скопировать ссылку');}
  }

  return <section className="space-y-5 text-[var(--text-main)]">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-4">{([{key:'entry',name:'Ввод результатов'},{key:'rating',name:'Общий рейтинг'}] as const).map(item=><button key={item.key} className={`min-h-11 border-b-2 text-sm ${view===item.key?'border-[var(--accent)]':'border-transparent text-[var(--text-muted)]'}`} onClick={()=>setView(item.key)}>{item.name}</button>)}</div><div className="flex flex-wrap gap-2"><button className={button} onClick={()=>void copyLink()}>Ссылка для участников</button><button className={button} disabled={busy || dirty} onClick={()=>void load()}>Обновить данные</button></div></header>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}{notice && <p role="status" className="text-sm text-[var(--accent)]">{notice}</p>}
    {!data && <p className="text-sm text-[var(--text-muted)]">Загружаем результаты…</p>}
    {data && <>
      <p className="text-sm text-[var(--text-muted)]">{data.hidden?'Результаты скрыты от участников. Организаторам доступны все данные.':data.closes_at?`Все результаты скроются от участников с началом финала: ${new Date(data.closes_at).toLocaleString('ru-RU',{timeZone:'Asia/Vladivostok',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})} по Хабаровску.`:'Отметьте последний комплекс категории как финальный: с его началом все публичные результаты будут скрыты.'}</p>
      <nav className="flex flex-wrap gap-2" aria-label="Категория результатов">{data.competition.categories.map(item=><button key={item.key} className={`${button} ${category===item.key?'border-[var(--accent)]':''}`} disabled={busy || dirty} aria-pressed={category===item.key} onClick={()=>{setCategory(item.key);choose(data,data.blocks.find(block=>block.category_key===item.key)?.id || '');setNotice('');setError('');}}>{item.name}</button>)}</nav>
      {!data.has_grid && <p className="text-sm text-[var(--warning)]">Ввод результатов пока недоступен: сетка не сформирована. <a className="underline underline-offset-4" href={`/competitions?event=${encodeURIComponent(eventKey)}&section=schedule&scheduleView=settings`}>Открыть расчёт и сформировать сетку</a>. Затем вернитесь в результаты и нажмите «Обновить данные».</p>}
      {data.grid_stale && <p className="text-sm text-[var(--warning)]">Сетка устарела. Обновите её перед внесением результатов.</p>}
      {view==='entry' && <>
        <nav className="flex flex-wrap gap-2" aria-label="Комплекс результатов">{blocks.map(item=><button key={item.id} className={`${button} ${complexId===item.id?'border-[var(--accent)]':''}`} disabled={busy || dirty} aria-pressed={complexId===item.id} onClick={()=>{choose(data,item.id);setNotice('');setError('');}}>{item.name}</button>)}</nav>
        {!block && <p className="py-8 text-sm text-[var(--text-muted)]">Сначала добавьте комплекс этой категории в расписание.</p>}
        {block && <article className="overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
          <header className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h3 className="font-semibold">{block.name}{workout?.is_final?' · Финал':''}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{confirmed?'Результаты подтверждены':'Черновик — участникам не виден'} · {block.start_time} · {block.venue}</p></div>{!confirmed && <button className={button} disabled={busy || dirty} onClick={()=>setSettings(!settings)}>{settings?'Свернуть настройки':'Настроить оценку'}</button>}{confirmed && <button className={button} disabled={busy} onClick={()=>void save('reopen')}>Редактировать результаты</button>}</header>
          {settings && !confirmed && <form className="space-y-4 border-t border-[var(--line-soft)] p-4" onSubmit={e=>{e.preventDefault();void save('settings');}}><fieldset disabled={busy || Object.values(workout?.entries || {}).some(values=>values.some(v=>v!==null))} className="space-y-4 disabled:opacity-60">
            <label className="block max-w-sm text-xs">Количество зачётов<select className={`${input} mt-1`} value={components.length} onChange={e=>{setComponents(e.target.value==='2'?[components[0],{name:'Результат 2',kind:'weight'}]:[components[0]]);setDirty(true);}}><option className="bg-white text-black" value={1}>Один результат</option><option className="bg-white text-black" value={2}>Два отдельных результата</option></select></label>
            {components.map((part,index)=><div key={index} className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Название зачёта<input className={`${input} mt-1`} required maxLength={80} value={part.name} onChange={e=>{setComponents(components.map((p,i)=>i===index?{...p,name:e.target.value}:p));setDirty(true);}} /></label><label className="text-xs">Тип результата<select className={`${input} mt-1`} value={part.kind} onChange={e=>{setComponents(components.map((p,i)=>i===index?{...p,kind:e.target.value as ResultKind}:p));setDirty(true);}}>{Object.entries(kindNames).map(([kind,name])=><option className="bg-white text-black" key={kind} value={kind}>{name}</option>)}</select></label></div>)}
            <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={final} onChange={e=>{setFinal(e.target.checked);setDirty(true);}} />Финальный комплекс</label>
            <p className="text-xs text-[var(--text-muted)]">В режиме «Время или повторения» завершившие комплекс идут выше не завершивших: сначала меньшее время, затем больше выполненных повторений. Каждый зачёт приносит до 100 баллов. Равные результаты делят место.</p>
            <div className="flex flex-wrap gap-2"><button className={button} type="submit">Сохранить оценку</button><button className={button} type="button" onClick={()=>choose(data,block.id)}>Отмена изменений</button></div>
          </fieldset></form>}
          {workout && <>
          {settings && <p className="border-t border-[var(--line-soft)] p-4 text-sm text-[var(--warning)]">Сейчас открыты настройки оценки. Сохраните их или нажмите «Свернуть настройки», чтобы перейти к вводу.</p>}
          <div className="divide-y divide-[var(--line-soft)] border-t border-[var(--line-soft)]">{block.teams.map(team=><div key={team.id} className="grid items-start gap-4 p-4 lg:grid-cols-[minmax(180px,1fr)_2fr]"><div className="min-w-0"><p className="break-words font-medium">{team.name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">Заход {team.heat} · Дорожка {team.lane}</p></div><div className={`grid gap-3 ${workout.components.length===2?'sm:grid-cols-2':''}`}>{workout.components.map((part,index)=>{
            const rank=block.rankings[index]?.find(item=>item.id===team.id);
            const mode=part.kind==='time_or_reps' ? entryModes[team.id]?.[index] || 'time' : part.kind;
            const disabled=busy || confirmed || !data.has_grid || data.grid_stale || settings;
            return <div key={index} className="min-w-0 space-y-2 text-xs"><span>{part.name} · {kindNames[part.kind]}</span>
              {part.kind==='time_or_reps' && <select className={input} aria-label={`Формат результата: ${team.name}, ${part.name}`} disabled={disabled} value={mode} onChange={e=>{
                setEntryModes(current=>({...current,[team.id]:workout.components.map((_,i)=>i===index?e.target.value as 'time'|'reps':current[team.id]?.[i] || 'time')}));
                setEntries(current=>({...current,[team.id]:workout.components.map((_,i)=>i===index?'':current[team.id]?.[i] || '')}));setDirty(true);
              }}><option className="bg-white text-black" value="time">Завершили — время</option><option className="bg-white text-black" value="reps">Не завершили — повторения</option></select>}
              <input className={input} aria-label={`${team.name}, ${part.name}: ${kindNames[mode]}`} disabled={disabled} inputMode={mode==='time'?'text':mode==='weight'?'decimal':'numeric'} placeholder={mode==='time'?'ММ:СС':'0'} value={entries[team.id]?.[index] || ''} onChange={e=>{setEntries(current=>({...current,[team.id]:workout.components.map((_,i)=>i===index?e.target.value:current[team.id]?.[i] || '')}));setDirty(true);}} />
              {rank && <span className="block text-[var(--text-muted)]">{rank.place}-е место · {rank.points} баллов{dirty?' · до изменений':''}</span>}
            </div>;
          })}</div></div>)}</div>
          {!block.teams.length && <p className="p-4 text-sm text-[var(--text-muted)]">{block.complex_number>1?'Команды появятся после подтверждения предыдущих комплексов.':'В сохранённой сетке нет команд.'}</p>}
          {!confirmed && <footer className="flex flex-wrap gap-3 border-t border-[var(--line-soft)] p-4"><button className={button} disabled={busy || settings || !block.teams.length || !data.has_grid || data.grid_stale} onClick={()=>void save('save')}>Сохранить черновик</button><button className={button} disabled={busy || settings || !block.teams.length || !data.has_grid || data.grid_stale} onClick={()=>void save('confirm')}>Подтвердить результаты комплекса</button>{dirty && <button className={button} disabled={busy} onClick={()=>choose(data,block.id)}>Отменить изменения</button>}</footer>}</>}
        </article>}
      </>}
      {view==='rating' && <div className="space-y-3"><p className="text-xs text-[var(--text-muted)]">Учитываются подтверждённые комплексы. При равной сумме сравниваем количество первых мест, затем вторых и далее.</p>{(data.standings[category] || []).map(row=><details key={row.id} className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4"><summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"><span className="grid w-full grid-cols-[24px_minmax(0,1fr)_48px] items-center gap-2"><strong>{row.place || '—'}</strong><span className="min-w-0 break-words">{row.name}</span><strong className="text-right">{row.scores.length?row.total:'—'}</strong></span></summary><div className="mt-4 space-y-3 text-sm">{row.scores.length?row.scores.map((score,i)=><div key={i} className="flex flex-wrap justify-between gap-2 border-t border-[var(--line-soft)] pt-3"><span>{score.complex_name} · {score.component}: {resultText(score.value,score.kind)}</span><span>{score.place}-е место · {score.points} баллов</span></div>):<p>Пока нет подтверждённых результатов.</p>}</div></details>)}{!data.standings[category]?.length && <p className="py-8 text-sm text-[var(--text-muted)]">В категории пока нет команд в сетке.</p>}</div>}
    </>}
  </section>;
}
