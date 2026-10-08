"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchCompetitionSchedule, generateCompetitionSchedule, saveCompetitionSchedule, type CompetitionSchedule, type ScheduleConfig, type CompetitionComplex, type ScheduleGrid } from "@/lib/api/competition-schedule";
import { previewScheduleActivity, type ScheduleActivity, type ActivityPreview } from "@/lib/api/competition-schedule";
import type { ResultKind } from "@/lib/api/competition-results";
import CompetitionScheduleOperations from "./competition-schedule-operations";

const resultKinds = {time:"Время, ММ:СС",reps:"Повторения",weight:"Вес, кг",time_or_reps:"Время или повторения"};

const button = "min-h-11 rounded-xl border border-[var(--line-soft)] px-4 py-2 text-sm font-medium disabled:opacity-40";
const primary = `${button} bg-[var(--accent)] text-[#062b26]`;
const addButton = `${button} bg-[var(--bg-card)] text-[var(--text-main)] transition-colors enabled:hover:border-[var(--accent)] enabled:hover:bg-[var(--accent)] enabled:hover:text-[#062b26] focus-visible:bg-[var(--accent)] focus-visible:text-[#062b26]`;
const inputClass = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] px-3 py-2 text-sm text-[var(--text-main)]";

function addMinutes(value: string, delta: number) {
  const [hours, minutes] = value.split(":").map(Number);
  const total = hours * 60 + minutes + delta;
  return total >= 0 && total < 1440 ? `${Math.floor(total / 60).toString().padStart(2,"0")}:${(total % 60).toString().padStart(2,"0")}` : null;
}

export default function CompetitionSchedulePanel({ eventKey }: { eventKey: string }) {
  const [data, setData] = useState<CompetitionSchedule | null>(null);
  const [draft, setDraft] = useState<ScheduleConfig>({categories:[]});
  const [view, setViewState] = useState<"settings" | "grid">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("scheduleView") === "grid" ? "grid" : "settings"
  );
  function setView(next: "settings" | "grid") {
    setViewState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("scheduleView", next);
    window.history.replaceState(window.history.state, "", url);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editor, setEditor] = useState<{ category: string; complex: CompetitionComplex; isNew: boolean } | null>(null);
  const [activityEditor,setActivityEditor] = useState<{item:ScheduleActivity;isNew:boolean}|null>(null);
  const [activityPreview,setActivityPreview] = useState<ActivityPreview|null>(null);
  const editing = !!editor || !!activityEditor;
  const editorRef = useRef<HTMLFormElement>(null);
  const editorId = editor?.isNew ? editor.complex.id : undefined;
  useEffect(() => { if (editorId) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [editorId]);

  const accept = useCallback((value: CompetitionSchedule) => {
    setData(value);
    setDraft({...value.config,categories:value.competition.categories.map(item => value.config.categories.find(c => c.category_key === item.key) || {category_key:item.key,planned_count:null,complexes:[]})});
    setDirty(false);
  }, []);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { accept(await fetchCompetitionSchedule(eventKey)); }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось загрузить расписание"); }
    finally { setBusy(false); }
  }, [eventKey, accept]);
  useEffect(() => { void load(); }, [load]);

  function changeCount(categoryKey: string, count: number | null) {
    setDraft(current => ({...current,categories:current.categories.map(item => item.category_key === categoryKey ? {...item,planned_count:count} : item)}));
    setDirty(true); setNotice("");
  }
  function updateComplex(patch: Partial<CompetitionComplex>) {
    setEditor(current => current ? {...current, complex: {...current.complex, ...patch}} : current);
  }
  function addComplex() {
    setError("");
    setEditor({category:"", isNew:true, complex:{
      id:crypto.randomUUID(),name:"", start_time:"", briefing_time:null,
      venue:"",lanes:4,duration_minutes:10,gap_minutes:3,break_after_minutes:0,
      depends_on_complex_id:null,start_after_minutes:0,briefing_before_minutes:null,
      redistribute_by_overall:false,qualification_limit:null,
      scoring:{components:[{name:"Результат",kind:"time"}],is_final:false},
    }});
  }
  async function persist(config: ScheduleConfig, message: string, sourceHash?:string) {
    if (!data) return false;
    setBusy(true); setError(""); setNotice("");
    try { accept(await saveCompetitionSchedule(eventKey,config,data.revision,sourceHash,data.results_revision)); setNotice(message); return true; }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось сохранить настройки"); return false; }
    finally { setBusy(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await persist(draft,"Количество команд по категориям сохранено. Расчёт обновлён.");
  }
  async function saveComplex(e: FormEvent) {
    e.preventDefault(); if (!editor) return;
    const target = draft.categories.find(item => item.category_key === editor.category);
    if (!target) { setError("Выберите категорию комплекса"); return; }
    if (target.complexes.filter(item => item.id !== editor.complex.id).length >= 20) { setError("В категории допускается до 20 комплексов"); return; }
    const next = {...draft,categories:draft.categories.map(item => ({...item,complexes:item.category_key === editor.category
      ? item.complexes.some(complex => complex.id === editor.complex.id)
        ? item.complexes.map(complex => complex.id === editor.complex.id ? editor.complex : complex)
        : [...item.complexes,editor.complex]
      : item.complexes.filter(complex => complex.id !== editor.complex.id)}))};
    if (await persist(next, editor.isNew ? "Комплекс добавлен. Расчёт обновлён." : "Комплекс изменён. Расчёт обновлён.")) setEditor(null);
  }
  function editComplex(id: string) {
    setError("");
    const activity = draft.activities?.find(item => item.id === id);
    if (activity) { setActivityEditor({item:{...activity},isNew:false}); setActivityPreview(null); return; }
    const owner = draft.categories.find(item => item.complexes.some(complex => complex.id === id));
    const complex = owner?.complexes.find(item => item.id === id);
    if (owner && complex) setEditor({category:owner.category_key, complex:{...complex}, isNew:false});
  }
  async function deleteComplex(id: string) {
    await persist({...draft,activities:draft.activities?.filter(item => item.id !== id),categories:draft.categories.map(item => ({...item,complexes:item.complexes.filter(complex => complex.id !== id)}))},"Пункт удалён из расчёта. Время остальных пунктов сохранено. Сохранённая сетка обновляется отдельно.");
  }
  function addActivity(kind:ScheduleActivity["kind"]) {
    setActivityPreview(null); setError(""); setNotice("");
    const names = {briefing:"Брифинг",break:"Перерыв",awards:"Награждение"};
    setActivityEditor({isNew:true,item:{id:crypto.randomUUID(),kind,name:names[kind],start_time:"",venue:"",duration_minutes:15,depends_on_complex_id:null,start_after_minutes:0}});
  }
  function updateActivity(patch:Partial<ScheduleActivity>) {
    setActivityEditor(current => current ? {...current,item:{...current.item,...patch}} : null);
    setActivityPreview(null);
  }
  async function saveActivity(e:FormEvent) {
    e.preventDefault(); if (!data || !activityEditor) return;
    if (activityPreview) {
      if (await persist(activityPreview.config,"Расписание сохранено. Сохранённая сетка обновляется отдельно.",activityPreview.source_hash)) { setActivityEditor(null); setActivityPreview(null); }
      return;
    }
    setBusy(true); setError("");
    try {
      const result = await previewScheduleActivity(eventKey,activityEditor.item,data.revision);
      setActivityPreview(result);
    } catch(e) { setError(e instanceof Error ? e.message : "Не удалось рассчитать смещение"); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!data || dirty) return;
    setBusy(true); setError(""); setNotice("");
    try { const result=await generateCompetitionSchedule(eventKey,data.revision,data.source_hash); accept(result); setView("grid"); setNotice(result.grid?.blocks.length ? "Сетка сохранена. Состав первого комплекса — по оплаченным заявкам." : "Сетка обновлена: в плане нет комплексов и других пунктов расписания."); }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось сформировать сетку"); }
    finally { setBusy(false); }
  }

  const editorCategory = editor ? draft.categories.find(item => item.category_key === editor.category) : undefined;
  const editorExistingIndex = editor ? editorCategory?.complexes.findIndex(item => item.id === editor.complex.id) ?? -1 : -1;
  const editorComplexNumber = editor ? (editorExistingIndex >= 0 ? editorExistingIndex + 1 : (editorCategory?.complexes.length || 0) + 1) : 0;
  const canRedistribute = editorComplexNumber > 1;
  const qualificationIsRequired = !!editorCategory?.complexes.slice(0,Math.max(0,editorComplexNumber-1)).some(item=>item.qualification_limit!==null);
  const blockOptions = [...draft.categories.flatMap(category => category.complexes.map(complex => ({
    id:complex.id,
    name:`${data?.competition.categories.find(item => item.key === category.category_key)?.name || category.category_key} · ${complex.name}`,
    dependsOn:complex.depends_on_complex_id,
  }))), ...(draft.activities || []).map(activity => ({
    id:activity.id,
    name:`${{briefing:"Брифинг",break:"Перерыв",awards:"Награждение"}[activity.kind]} · ${activity.name}`,
    dependsOn:activity.depends_on_complex_id,
  }))];
  function availableDependencies(currentId:string) {
    return blockOptions.filter(option => {
    if (option.id === currentId) return false;
    let current: typeof option | undefined = option;
    const visited = new Set<string>();
    while (current?.dependsOn && !visited.has(current.id)) {
      if (current.dependsOn === currentId) return false;
      visited.add(current.id);
      current = blockOptions.find(item => item.id === current?.dependsOn);
    }
    return true;
  });
  }
  const dependencyOptions = editor ? availableDependencies(editor.complex.id) : [];
  const activityDependencyOptions = activityEditor ? availableDependencies(activityEditor.item.id) : [];
  const dependencyBlock = editor?.complex.depends_on_complex_id ? data?.preview.blocks.find(block => block.id === editor.complex.depends_on_complex_id) : undefined;
  const calculatedStart = dependencyBlock ? addMinutes(dependencyBlock.available_after, editor?.complex.start_after_minutes || 0) : null;
  const activityDependencyBlock = activityEditor?.item.depends_on_complex_id ? data?.preview.blocks.find(block => block.id === activityEditor.item.depends_on_complex_id) : undefined;
  const calculatedActivityStart = activityDependencyBlock ? addMinutes(activityDependencyBlock.available_after, activityEditor?.item.start_after_minutes || 0) : null;

  const editorForm = editor && data ? (
    <form ref={editorRef} onSubmit={saveComplex} className={`scroll-mt-4 p-4 sm:p-5 ${editor.isNew ? "rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]" : "border-t border-[var(--line-soft)]"}`}>
        <fieldset disabled={busy}>
          {[editor.complex].map(complex => <section key={complex.id} className="space-y-4">
            {editor.isNew && <h3 className="font-semibold">Новый комплекс</h3>}
            <label className="block max-w-md text-xs">Категория комплекса<select required className={inputClass} value={editor.category} onChange={e => {
              const categoryKey = e.target.value;
              setEditor(current => current ? {...current,category:categoryKey,complex:{...current.complex,name:current.complex.name || `Комплекс ${(draft.categories.find(item => item.category_key === categoryKey)?.complexes.length || 0) + 1}`}} : current);
            }}><option className="bg-white text-black" value="" disabled>Выберите категорию</option>{data.competition.categories.map(item => <option className="bg-white text-black" key={item.key} value={item.key}>{item.name}</option>)}</select></label>
            {!editor.isNew && !draft.categories.find(item => item.category_key === editor.category)?.complexes.some(item => item.id === complex.id) && <p className="text-sm text-[var(--text-muted)]">После сохранения комплекс переместится в конец плана выбранной категории и будет использовать её количество команд.</p>}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="min-w-0 text-xs">Название<input className={inputClass} required maxLength={120} value={complex.name} onChange={e => updateComplex({name:e.target.value})} /></label>
              <label className="min-w-0 text-xs">Место / площадка<input className={inputClass} required maxLength={120} placeholder="Основной зал" value={complex.venue} onChange={e => updateComplex({venue:e.target.value})} /></label>
              <label className="min-w-0 text-xs">Расчёт времени<select className={inputClass} value={complex.depends_on_complex_id || ""} onChange={e => {
                updateComplex({depends_on_complex_id:e.target.value || null,start_after_minutes:0});
              }}><option className="bg-white text-black" value="">Указать время вручную</option>{dependencyOptions.map(option => <option className="bg-white text-black" key={option.id} value={option.id}>После: {option.name}</option>)}</select></label>
              {complex.depends_on_complex_id ? <label className="min-w-0 text-xs">Интервал после опорного блока, мин<input className={inputClass} type="number" required min={0} max={1440} step={1} value={complex.start_after_minutes} onChange={e => updateComplex({start_after_minutes:e.target.value === "" ? NaN : Number(e.target.value)})} /></label> : <label className="min-w-0 text-xs">Начало первого захода<input className={inputClass} type="time" required value={complex.start_time} onChange={e => updateComplex({start_time:e.target.value})} /></label>}
              {([{key:"lanes",name:"Количество дорожек",min:1,max:100},{key:"duration_minutes",name:"Время одного захода, мин",min:1,max:240},{key:"gap_minutes",name:"Между заходами, мин",min:0,max:240},{key:"break_after_minutes",name:"После комплекса, мин",min:0,max:240}] as const).map(item => <label key={item.key} className="min-w-0 text-xs">{item.name}<input className={inputClass} required type="number" step={1} min={item.min} max={item.max} value={Number.isNaN(complex[item.key]) ? "" : complex[item.key]} onChange={e => updateComplex({[item.key]:e.target.value === "" ? NaN : Number(e.target.value)})} /></label>)}
            </div>
            {complex.depends_on_complex_id && <p className="text-xs text-[var(--text-muted)]">{dependencyBlock ? calculatedStart ? `Первый заход начнётся в ${calculatedStart}. При переносе опорного блока время изменится автоматически.` : "Рассчитанное время выходит за пределы дня. Уменьшите интервал." : "После сохранения время будет рассчитано от окончания выбранного блока."}</p>}
            <div className="space-y-1 border-t border-[var(--line-soft)] pt-4">
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={!canRedistribute || qualificationIsRequired || complex.scoring_locked} checked={canRedistribute && (qualificationIsRequired || complex.redistribute_by_overall)} onChange={e=>updateComplex({redistribute_by_overall:e.target.checked})} />Перераспределить участников по общему рейтингу перед этим блоком</label>
              <p className="text-xs text-[var(--text-muted)]">{!canRedistribute ? "Первый блок всегда формируется по регистрации." : qualificationIsRequired ? "После отсева этот блок обязательно формируется по общему рейтингу." : complex.redistribute_by_overall ? editorComplexNumber === 2 ? "После утверждения блока 1 участники будут распределены заново по сумме баллов." : `После утверждения блоков 1–${editorComplexNumber - 1} участники будут распределены заново по сумме баллов.` : "Состав заходов и дорожек останется по исходной регистрации."}</p>
            </div>
            <div className="space-y-2 border-t border-[var(--line-soft)] pt-4">
              <label className="block max-w-xs text-xs">После комплекса оставить участников<input className={inputClass} type="number" min={1} max={1000} step={1} placeholder="Без отсева" value={complex.qualification_limit ?? ""} onChange={e=>updateComplex({qualification_limit:e.target.value===""?null:Number(e.target.value)})} /></label>
              <p className="text-xs text-[var(--text-muted)]">Пусто — все продолжают соревнование. При отсеве следующие комплексы получают строго указанное количество участников по правилам итоговой таблицы.</p>
            </div>
            {complex.scoring && <fieldset disabled={complex.scoring_locked} className="space-y-3 border-t border-[var(--line-soft)] pt-4 disabled:opacity-60">
              <legend className="px-1 text-sm font-medium">Оценка комплекса</legend>
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <label className="min-w-0 text-xs">Количество зачётов<select className={inputClass} value={complex.scoring.components.length} onChange={e=>updateComplex({scoring:{...complex.scoring!,components:e.target.value==='2'?[complex.scoring!.components[0],{name:'Результат 2',kind:'weight'}]:[complex.scoring!.components[0]]}})}><option className="bg-white text-black" value={1}>Один результат</option><option className="bg-white text-black" value={2}>Два отдельных результата</option></select></label>
              <div className="min-w-0 space-y-4">{complex.scoring.components.map((part,index)=><div key={index} className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs">Название зачёта<input className={inputClass} required maxLength={80} value={part.name} onChange={e=>updateComplex({scoring:{...complex.scoring!,components:complex.scoring!.components.map((item,i)=>i===index?{...item,name:e.target.value}:item)}})} /></label>
                <label className="text-xs">Тип результата<select className={inputClass} value={part.kind} onChange={e=>updateComplex({scoring:{...complex.scoring!,components:complex.scoring!.components.map((item,i)=>i===index?{...item,kind:e.target.value as ResultKind}:item)}})}>{Object.entries(resultKinds).map(([kind,name])=><option className="bg-white text-black" key={kind} value={kind}>{name}</option>)}</select></label>
              </div>)}</div>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={complex.scoring.is_final} onChange={e=>updateComplex({scoring:{...complex.scoring!,is_final:e.target.checked}})} />Финальный комплекс</label>
              {complex.scoring_locked && <p className="text-xs text-[var(--text-muted)]">В этом комплексе уже есть результаты. Настройки зачётов зафиксированы.</p>}
            </fieldset>}
          </section>)}
          {error && <p role="alert" className="mt-4 whitespace-pre-line text-sm text-[var(--danger)]">{error}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3"><button type="submit" className={primary}>{busy ? "Сохраняем…" : editor.isNew ? "Создать комплекс" : "Сохранить изменения"}</button><button type="button" className={button} onClick={() => {setEditor(null);setError("");}}>Отмена</button><span className="text-xs text-[var(--text-muted)]">Расчёт обновится после сохранения. Время — по Хабаровску.</span></div>
        </fieldset>
      </form>
  ) : null;

  const activityForm = activityEditor && <form onSubmit={saveActivity} className={`p-4 sm:p-5 ${activityEditor.isNew ? "rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]" : "border-t border-[var(--line-soft)]"}`}>
    <fieldset disabled={busy} className="space-y-4">
      {activityEditor.isNew && <h3 className="font-semibold">{{briefing:"Новый брифинг",break:"Новый перерыв",awards:"Общее награждение"}[activityEditor.item.kind]}</h3>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="min-w-0 text-xs">Название<input className={inputClass} required maxLength={120} value={activityEditor.item.name} onChange={e => updateActivity({name:e.target.value})} /></label>
        <label className="min-w-0 text-xs">Место / площадка<input className={inputClass} required maxLength={120} list="schedule-venues" value={activityEditor.item.venue} onChange={e => updateActivity({venue:e.target.value})} /><datalist id="schedule-venues">{Array.from(new Set(data?.preview.blocks.map(item => item.venue))).map(venue => <option key={venue} value={venue} />)}</datalist></label>
        <label className="min-w-0 text-xs">Расчёт времени<select className={inputClass} value={activityEditor.item.depends_on_complex_id || ""} onChange={e => updateActivity({depends_on_complex_id:e.target.value || null,start_after_minutes:0})}><option className="bg-white text-black" value="">Указать время вручную</option>{activityDependencyOptions.map(option => <option className="bg-white text-black" key={option.id} value={option.id}>После: {option.name}</option>)}</select></label>
        {activityEditor.item.depends_on_complex_id ? <label className="min-w-0 text-xs">Интервал после опорного блока, мин<input className={inputClass} type="number" min={0} max={1440} step={1} required value={Number.isNaN(activityEditor.item.start_after_minutes) ? "" : activityEditor.item.start_after_minutes} onChange={e => updateActivity({start_after_minutes:e.target.value === "" ? NaN : Number(e.target.value)})} /></label> : <label className="min-w-0 text-xs">Время начала<input className={inputClass} type="time" required value={activityEditor.item.start_time} onChange={e => updateActivity({start_time:e.target.value})} /></label>}
        <label className="min-w-0 text-xs">Длительность, мин<input className={inputClass} type="number" min={1} max={activityEditor.item.kind === "briefing" ? 1440 : 240} step={1} required value={Number.isNaN(activityEditor.item.duration_minutes) ? "" : activityEditor.item.duration_minutes} onChange={e => updateActivity({duration_minutes:e.target.value === "" ? NaN : Number(e.target.value)})} /></label>
      </div>
      {activityEditor.item.depends_on_complex_id && <p className="text-xs text-[var(--text-muted)]">{activityDependencyBlock ? calculatedActivityStart ? `Блок начнётся в ${calculatedActivityStart}. При переносе опорного блока время изменится автоматически.` : "Рассчитанное время выходит за пределы дня. Уменьшите интервал." : "После сохранения время будет рассчитано от окончания выбранного блока."}</p>}
      {activityPreview && <div aria-live="polite" className="space-y-3 rounded-lg border border-[var(--line-soft)] p-4 text-sm">
        <p className="font-medium">{activityPreview.shifts.length ? "После сохранения изменится время:" : "Время других пунктов остаётся прежним."}</p>
        {activityPreview.shifts.map(shift => <div key={shift.id} className="flex flex-wrap justify-between gap-2 border-b border-[var(--line-soft)] pb-2"><span className="min-w-0 break-words">{shift.name}{shift.briefing_before && <span className="block text-xs text-[var(--text-muted)]">Брифинг: {shift.briefing_before} → {shift.briefing_after}</span>}</span><span>{shift.before} → <strong>{shift.after}</strong> (+{shift.minutes} мин)</span></div>)}
        {activityPreview.end_before !== activityPreview.end_after && <p>Окончание мероприятия: {activityPreview.end_before || "—"} → <strong>{activityPreview.end_after}</strong></p>}
        {!!activityPreview.errors.length && <ul role="alert" className="space-y-2 text-[var(--danger)]">{activityPreview.errors.map(message => <li key={message}>{message}</li>)}</ul>}
      </div>}
      <div className="flex flex-wrap items-center gap-3"><button className={primary} type="submit" disabled={!!activityPreview?.errors.length}>{busy ? "Рассчитываем…" : !activityPreview ? "Проверить расписание" : activityPreview.shifts.length ? activityEditor.isNew ? "Добавить и сдвинуть" : "Сохранить и сдвинуть" : activityEditor.isNew ? "Добавить" : "Сохранить изменения"}</button><button className={button} type="button" onClick={() => {setActivityEditor(null);setActivityPreview(null);}}>Отмена</button><span className="text-xs text-[var(--text-muted)]">Время — по Хабаровску. Сохранённая сетка обновляется отдельно.</span></div>
    </fieldset>
  </form>;

  return <div className="space-y-5 text-[var(--text-main)]">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-4"><button className="min-h-11 text-sm" aria-pressed={view === "settings"} onClick={() => setView("settings")}><span className={view === "settings" ? "border-b-2 border-[var(--accent)] pb-2" : "text-[var(--text-muted)]"}>Настройка комплексов</span></button><button className="min-h-11 text-sm" aria-pressed={view === "grid"} onClick={() => setView("grid")}><span className={view === "grid" ? "border-b-2 border-[var(--accent)] pb-2" : "text-[var(--text-muted)]"}>Сохранённая сетка</span></button></div>
      <button className={button} disabled={busy || dirty || editing} onClick={() => void load()}>Обновить данные</button>
    </header>
    {error && !editor && <p role="alert" className="whitespace-pre-line text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--accent)]">{notice}</p>}
    {!data && <p className="text-sm text-[var(--text-muted)]">{busy ? "Загружаем комплексы…" : "Расписание недоступно. Повторите загрузку."}</p>}
    {data && view === "settings" && <>
      <details className="border-b border-[var(--line-soft)] pb-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Количество команд по категориям{dirty && <span className="ml-2 text-[var(--warning)]">Есть несохранённые изменения</span>}</summary>
      <form onSubmit={save} className="space-y-5 pt-3">
        <fieldset disabled={busy || editing} className="space-y-5 disabled:opacity-60">
          <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {draft.categories.map(item => <label key={item.category_key} className="min-w-0 text-sm">{data.competition.categories.find(category => category.key === item.category_key)?.name}<input aria-label={`Плановое количество команд: ${data.competition.categories.find(category => category.key === item.category_key)?.name}`} className={inputClass} type="number" min={1} max={1000} step={1} placeholder={`По оплатам: ${data.confirmed_counts[item.category_key] || 0}`} value={item.planned_count ?? ""} onChange={e => changeCount(item.category_key,e.target.value === "" ? null : Number(e.target.value))} /></label>)}
            <button type="submit" className={button} disabled={!dirty}>Сохранить количество</button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Плановое количество применяется ко всем комплексам своей категории. Пустое поле — расчёт по оплаченным командам.</p>
          {dirty && <p className="text-sm text-[var(--warning)]">Сохраните количество команд перед работой с комплексами.</p>}
        </fieldset>
      </form>
      </details>
      <div className="flex flex-wrap gap-3"><button type="button" className={addButton} disabled={busy || dirty || editing || !draft.categories.length} onClick={addComplex}>Добавить комплекс</button><button type="button" className={addButton} disabled={busy || dirty || editing} onClick={() => addActivity("briefing")}>Добавить брифинг</button><button type="button" className={addButton} disabled={busy || dirty || editing} onClick={() => addActivity("break")}>Добавить перерыв</button><button type="button" className={addButton} disabled={busy || dirty || editing} onClick={() => addActivity("awards")}>Добавить награждение</button></div>
      {editor?.isNew && editorForm}
      {activityEditor?.isNew && activityForm}
      <section className="space-y-4 border-t border-[var(--line-soft)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Расчёт всего мероприятия</h2><button className={primary} disabled={busy || dirty || editing || (!data.preview.blocks.length && !data.grid) || !!data.preview.errors.length} onClick={() => void generate()}>{data.grid ? "Пересформировать сетку" : "Сформировать сетку"}</button></div>
        <p className="text-xs text-[var(--text-muted)]">Перерыв после комплекса резервирует площадку. Следующее начало задайте с учётом этого перерыва. Сохранённая сетка изменится только по кнопке формирования.</p>
        {(dirty || editing) && <p className="text-sm text-[var(--warning)]">Ниже расчёт по последним сохранённым настройкам.</p>}
        {!!data.preview.errors.length && <ul role="alert" className="list-disc space-y-2 pl-5 text-sm text-[var(--danger)]">{data.preview.errors.map((message,i) => <li key={i}>{message}</li>)}</ul>}
        <Grid grid={data.preview} onEdit={editComplex} onDelete={id => void deleteComplex(id)} actionsDisabled={busy || dirty || editing} editingId={activityEditor && !activityEditor.isNew ? activityEditor.item.id : editor?.isNew ? undefined : editor?.complex.id} editorForm={activityEditor ? activityForm : editorForm} />
      </section>
    </>}
    {data && view === "grid" && <>
      {(data.grid_stale || dirty) && <p className="rounded-xl border border-[var(--line-soft)] p-4 text-sm text-[var(--warning)]">Состав команд или настройки изменились. Здесь остаётся прежняя сетка. Проверьте расчёт во вкладке настройки и пересформируйте её, если нужно.</p>}
      {data.grid ? <><p className="text-sm text-[var(--text-muted)]">Блоки без перераспределения сохраняют порядок регистрации. В отмеченных блоках после утверждения предыдущих результатов лидеры общего рейтинга выступают последними.</p>{!data.grid_stale&&<CompetitionScheduleOperations eventKey={eventKey} data={data} onApplied={(value,message)=>{accept(value);setNotice(message);}} />}<Grid grid={data.grid} /></> : <p className="border-y border-[var(--line-soft)] py-10 text-center text-sm text-[var(--text-muted)]">Сетка ещё не сформирована. Добавьте комплексы и проверьте расчёт.</p>}
    </>}
  </div>;
}

function Grid({ grid, onEdit, onDelete, actionsDisabled, editingId, editorForm }: { grid: ScheduleGrid; onEdit?: (id:string) => void; onDelete?: (id:string) => void; actionsDisabled?: boolean; editingId?: string; editorForm?: ReactNode }) {
  if (!grid.blocks.length) return <p className="text-sm text-[var(--text-muted)]">После добавления комплексов здесь появится расписание.</p>;
  return <div className="space-y-4">
    <p className="text-sm"><strong>{grid.start_time} — {grid.end_time}</strong><span className="text-[var(--text-muted)]"> · {grid.event_date ? new Date(`${grid.event_date}T12:00:00`).toLocaleDateString("ru-RU") : "Дата не задана"} · Хабаровск</span></p>
    {grid.blocks.map(block => block.kind ? <section key={block.id} className="overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h3 className="break-words font-semibold">{block.name}</h3>{onEdit && editingId !== block.id && <button className={button} disabled={actionsDisabled} onClick={() => onEdit(block.id)} aria-label={`Редактировать: ${block.name}`}>Редактировать</button>}{onDelete && editingId !== block.id && <button className={`${button} text-[var(--danger)]`} disabled={actionsDisabled} onClick={() => onDelete(block.id)} aria-label={`Удалить: ${block.name}`}>Удалить</button>}</div><p className="mt-1 text-xs text-[var(--text-muted)]">{{briefing:"Брифинг",break:"Перерыв",awards:"Общее награждение"}[block.kind]} · {block.venue} · {block.duration_minutes} мин</p>{block.depends_on_complex_id && <p className="mt-1 text-xs text-[var(--text-muted)]">Время связано с «{[grid.blocks.find(item => item.id === block.depends_on_complex_id)?.category_name,grid.blocks.find(item => item.id === block.depends_on_complex_id)?.name].filter(Boolean).join(" · ")}»{block.start_after_minutes ? ` + ${block.start_after_minutes} мин` : ""}</p>}</div><strong className="text-sm">{block.start_time} — {block.end_time}</strong></header>
      {editingId === block.id && editorForm}
    </section> : <section key={block.id} className="overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h3 className="break-words font-semibold">{block.category_name} · {block.name}</h3>{onEdit && editingId !== block.id && <button type="button" className={button} disabled={actionsDisabled} onClick={() => onEdit(block.id)} aria-label={`Редактировать: ${block.category_name} · ${block.name}`}>Редактировать</button>}{onDelete && editingId !== block.id && <button type="button" className={`${button} text-[var(--danger)]`} disabled={actionsDisabled} onClick={() => onDelete(block.id)} aria-label={`Удалить: ${block.category_name} · ${block.name}`}>Удалить</button>}</div><p className="mt-1 text-xs text-[var(--text-muted)]">{block.venue} · Дорожек: {block.lanes} · Мест: {block.planned_count} · Заходов: {block.heats.length}</p>{block.depends_on_complex_id && <p className="mt-1 text-xs text-[var(--text-muted)]">Время связано с «{[grid.blocks.find(item => item.id === block.depends_on_complex_id)?.category_name,grid.blocks.find(item => item.id === block.depends_on_complex_id)?.name].filter(Boolean).join(" · ")}»{block.start_after_minutes ? ` + ${block.start_after_minutes} мин` : ""}</p>}<p className="mt-1 text-xs text-[var(--text-muted)]">{block.redistribute_by_overall ? `Перераспределение по общему рейтингу после блока ${block.complex_number - 1}` : "Распределение по регистрации"}</p>{block.qualification_limit!==null && <p className="mt-1 text-xs text-[var(--text-muted)]">После комплекса остаются: {block.qualification_limit} участников</p>}{block.qualification_error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{block.qualification_error}</p>}</div><strong className="text-sm">{block.start_time} — {block.end_time}</strong></header>
      {editingId === block.id ? editorForm : <>
      {block.heats.some(heat=>heat.combined_heat_id&&grid.combined_heats?.some(item=>item.id===heat.combined_heat_id&&item.block_ids[0]!==block.id))&&<p className="border-t border-[var(--line-soft)] px-4 py-3 text-xs text-[var(--text-muted)]">Неполный заход этой категории показан в общей карточке выше.</p>}
      <div className="border-t border-[var(--line-soft)]"><div className="divide-y divide-[var(--line-soft)]">{block.heats.map(heat => {
        const combined=heat.combined_heat_id ? grid.combined_heats?.find(item=>item.id===heat.combined_heat_id) : undefined;
        if(combined&&combined.block_ids[0]!==block.id)return null;
        const slots=combined?.slots || heat.slots;
        return <div key={combined?.id || heat.number} className="grid sm:grid-cols-[180px_minmax(0,1fr)]"><div className="px-4 py-4 text-sm"><strong>{heat.start_time} — {heat.end_time}</strong><p className="mt-1 text-[var(--text-muted)]">{combined?`Общий заход ${combined.number}`:`Заход ${heat.number}`}</p>{combined&&<p className="mt-1 text-xs text-[var(--text-muted)]">{Array.from(new Set(combined.slots.map(slot=>slot.category_name))).join(" + ")}</p>}</div><ol className="grid min-w-0" style={{gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 180px), 1fr))"}}>{Array.from({length:block.lanes},(_,index) => {
          const lane = index + 1;
          const slot = slots.find(item => item.lane === lane);
          return <li key={lane} className="relative flex min-h-16 min-w-0 items-center justify-center border-l border-b border-[var(--line-soft)] px-4 py-5 text-center text-sm"><span className="absolute left-2 top-1 text-xs text-[var(--text-muted)]">{lane}</span><span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{slot ? <>{slot.team_name || (block.qualification_error ? "Нужен доп. результат" : block.assignment === "results" ? "После результатов" : "Резерв")}{combined&&<span className="mt-1 block text-xs text-[var(--text-muted)]">{combined.slots.find(item=>item.lane===lane)?.category_name}</span>}</> : "—"}</span></li>;
        })}</ol></div>;
      })}</div></div>
      {(block.gap_minutes > 0 || block.break_after_minutes > 0) && <p className="border-t border-[var(--line-soft)] px-4 py-3 text-xs text-[var(--text-muted)]">Между заходами: {block.gap_minutes} мин{block.break_after_minutes > 0 ? ` · Перерыв после комплекса: ${block.end_time} — ${block.available_after}` : ""}</p>}
      </>}
    </section>)}
  </div>;
}
