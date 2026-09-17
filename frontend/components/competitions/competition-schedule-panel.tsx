"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchCompetitionSchedule, generateCompetitionSchedule, saveCompetitionSchedule, type CompetitionSchedule, type ScheduleConfig, type CompetitionComplex, type ScheduleGrid } from "@/lib/api/competition-schedule";

const button = "min-h-11 rounded-xl border border-[var(--line-soft)] px-4 py-2 text-sm font-medium disabled:opacity-40";
const primary = `${button} bg-[var(--accent)] text-[#062b26]`;
const inputClass = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] px-3 py-2 text-sm text-[var(--text-main)]";

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
  const editorRef = useRef<HTMLFormElement>(null);
  const editorId = editor?.isNew ? editor.complex.id : undefined;
  useEffect(() => { if (editorId) editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [editorId]);

  const accept = useCallback((value: CompetitionSchedule) => {
    setData(value);
    setDraft({categories:value.competition.categories.map(item => value.config.categories.find(c => c.category_key === item.key) || {category_key:item.key,planned_count:null,complexes:[]})});
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
    setDraft(current => ({categories:current.categories.map(item => item.category_key === categoryKey ? {...item,planned_count:count} : item)}));
    setDirty(true); setNotice("");
  }
  function updateComplex(patch: Partial<CompetitionComplex>) {
    setEditor(current => current ? {...current, complex: {...current.complex, ...patch}} : current);
  }
  function addComplex() {
    setEditor({category:"", isNew:true, complex:{
      id:crypto.randomUUID(),name:"", start_time:"", briefing_time:null,
      venue:"",lanes:4,duration_minutes:10,gap_minutes:3,break_after_minutes:0,
    }});
  }
  async function persist(config: ScheduleConfig, message: string) {
    if (!data) return false;
    setBusy(true); setError(""); setNotice("");
    try { accept(await saveCompetitionSchedule(eventKey,config,data.revision)); setNotice(message); return true; }
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
    const next = {categories:draft.categories.map(item => ({...item,complexes:item.category_key === editor.category
      ? item.complexes.some(complex => complex.id === editor.complex.id)
        ? item.complexes.map(complex => complex.id === editor.complex.id ? editor.complex : complex)
        : [...item.complexes,editor.complex]
      : item.complexes.filter(complex => complex.id !== editor.complex.id)}))};
    if (await persist(next, editor.isNew ? "Комплекс добавлен. Расчёт обновлён." : "Комплекс изменён. Расчёт обновлён.")) setEditor(null);
  }
  function editComplex(id: string) {
    const owner = draft.categories.find(item => item.complexes.some(complex => complex.id === id));
    const complex = owner?.complexes.find(item => item.id === id);
    if (owner && complex) setEditor({category:owner.category_key, complex:{...complex}, isNew:false});
  }
  async function deleteComplex(id: string) {
    await persist({categories:draft.categories.map(item => ({...item,complexes:item.complexes.filter(complex => complex.id !== id)}))},"Комплекс удалён из расчёта. Сохранённая сетка обновляется отдельно.");
  }
  async function generate() {
    if (!data || dirty) return;
    setBusy(true); setError(""); setNotice("");
    try { accept(await generateCompetitionSchedule(eventKey,data.revision,data.source_hash)); setView("grid"); setNotice("Сетка сохранена. Состав первого комплекса — по оплаченным заявкам."); }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось сформировать сетку"); }
    finally { setBusy(false); }
  }

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
              <label className="min-w-0 text-xs">Начало первого захода<input className={inputClass} type="time" required value={complex.start_time} onChange={e => updateComplex({start_time:e.target.value})} /></label>
              <div className="min-w-0 space-y-2"><label className="flex min-h-11 items-center gap-2 text-xs"><input type="checkbox" checked={complex.briefing_time !== null} onChange={e => updateComplex({briefing_time:e.target.checked ? "" : null})} />Проводить брифинг</label>{complex.briefing_time !== null && <label className="block text-xs">Начало брифинга<input className={inputClass} type="time" required value={complex.briefing_time} onChange={e => updateComplex({briefing_time:e.target.value})} /></label>}</div>
              {([{key:"lanes",name:"Количество дорожек",min:1,max:100},{key:"duration_minutes",name:"Время одного захода, мин",min:1,max:240},{key:"gap_minutes",name:"Между заходами, мин",min:0,max:240},{key:"break_after_minutes",name:"После комплекса, мин",min:0,max:240}] as const).map(item => <label key={item.key} className="min-w-0 text-xs">{item.name}<input className={inputClass} required type="number" step={1} min={item.min} max={item.max} value={Number.isNaN(complex[item.key]) ? "" : complex[item.key]} onChange={e => updateComplex({[item.key]:e.target.value === "" ? NaN : Number(e.target.value)})} /></label>)}
            </div>
          </section>)}
          <div className="mt-4 flex flex-wrap items-center gap-3"><button type="submit" className={primary}>{busy ? "Сохраняем…" : editor.isNew ? "Создать комплекс" : "Сохранить изменения"}</button><button type="button" className={button} onClick={() => setEditor(null)}>Отмена</button><span className="text-xs text-[var(--text-muted)]">Расчёт обновится после сохранения. Время — по Хабаровску.</span></div>
        </fieldset>
      </form>
  ) : null;

  return <div className="space-y-5 text-[var(--text-main)]">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-4"><button className="min-h-11 text-sm" aria-pressed={view === "settings"} onClick={() => setView("settings")}><span className={view === "settings" ? "border-b-2 border-[var(--accent)] pb-2" : "text-[var(--text-muted)]"}>Настройка комплексов</span></button><button className="min-h-11 text-sm" aria-pressed={view === "grid"} onClick={() => setView("grid")}><span className={view === "grid" ? "border-b-2 border-[var(--accent)] pb-2" : "text-[var(--text-muted)]"}>Сохранённая сетка</span></button></div>
      <button className={button} disabled={busy || dirty || !!editor} onClick={() => void load()}>Обновить данные</button>
    </header>
    {error && <p role="alert" className="whitespace-pre-line text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--accent)]">{notice}</p>}
    {!data && <p className="text-sm text-[var(--text-muted)]">{busy ? "Загружаем комплексы…" : "Расписание недоступно. Повторите загрузку."}</p>}
    {data && view === "settings" && <>
      <details className="border-b border-[var(--line-soft)] pb-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Количество команд по категориям{dirty && <span className="ml-2 text-[var(--warning)]">Есть несохранённые изменения</span>}</summary>
      <form onSubmit={save} className="space-y-5 pt-3">
        <fieldset disabled={busy || !!editor} className="space-y-5 disabled:opacity-60">
          <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {draft.categories.map(item => <label key={item.category_key} className="min-w-0 text-sm">{data.competition.categories.find(category => category.key === item.category_key)?.name}<input aria-label={`Плановое количество команд: ${data.competition.categories.find(category => category.key === item.category_key)?.name}`} className={inputClass} type="number" min={1} max={1000} step={1} placeholder={`По оплатам: ${data.confirmed_counts[item.category_key] || 0}`} value={item.planned_count ?? ""} onChange={e => changeCount(item.category_key,e.target.value === "" ? null : Number(e.target.value))} /></label>)}
            <button type="submit" className={button} disabled={!dirty}>Сохранить количество</button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Плановое количество применяется ко всем комплексам своей категории. Пустое поле — расчёт по оплаченным командам.</p>
          {dirty && <p className="text-sm text-[var(--warning)]">Сохраните количество команд перед работой с комплексами.</p>}
        </fieldset>
      </form>
      </details>
      <button type="button" className={primary} disabled={busy || dirty || !!editor || !draft.categories.length} onClick={addComplex}>Добавить комплекс</button>
      {editor?.isNew && editorForm}
      <section className="space-y-4 border-t border-[var(--line-soft)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Расчёт всего мероприятия</h2><button className={primary} disabled={busy || dirty || !!editor || !data.preview.blocks.length || !!data.preview.errors.length} onClick={() => void generate()}>{data.grid ? "Пересформировать сетку" : "Сформировать сетку"}</button></div>
        <p className="text-xs text-[var(--text-muted)]">Перерыв после комплекса резервирует площадку. Следующее начало задайте с учётом этого перерыва. Сохранённая сетка изменится только по кнопке формирования.</p>
        {(dirty || editor) && <p className="text-sm text-[var(--warning)]">Ниже расчёт по последним сохранённым настройкам.</p>}
        {!!data.preview.errors.length && <ul role="alert" className="list-disc space-y-2 pl-5 text-sm text-[var(--danger)]">{data.preview.errors.map((message,i) => <li key={i}>{message}</li>)}</ul>}
        <Grid grid={data.preview} onEdit={editComplex} onDelete={id => void deleteComplex(id)} actionsDisabled={busy || dirty || !!editor} editingId={editor?.isNew ? undefined : editor?.complex.id} editorForm={editorForm} />
      </section>
    </>}
    {data && view === "grid" && <>
      {(data.grid_stale || dirty) && <p className="rounded-xl border border-[var(--line-soft)] p-4 text-sm text-[var(--warning)]">Состав команд или настройки изменились. Здесь остаётся прежняя сетка. Проверьте расчёт во вкладке настройки и пересформируйте её, если нужно.</p>}
      {data.grid ? <><p className="text-sm text-[var(--text-muted)]">Первый комплекс — поздние заявки выступают раньше. В следующих комплексах места зарезервированы; распределение по результатам появится на следующем этапе.</p><Grid grid={data.grid} /></> : <p className="border-y border-[var(--line-soft)] py-10 text-center text-sm text-[var(--text-muted)]">Сетка ещё не сформирована. Добавьте комплексы и проверьте расчёт.</p>}
    </>}
  </div>;
}

function Grid({ grid, onEdit, onDelete, actionsDisabled, editingId, editorForm }: { grid: ScheduleGrid; onEdit?: (id:string) => void; onDelete?: (id:string) => void; actionsDisabled?: boolean; editingId?: string; editorForm?: ReactNode }) {
  if (!grid.blocks.length) return <p className="text-sm text-[var(--text-muted)]">После добавления комплексов здесь появится расписание.</p>;
  return <div className="space-y-4">
    <p className="text-sm"><strong>{grid.start_time} — {grid.end_time}</strong><span className="text-[var(--text-muted)]"> · {grid.event_date ? new Date(`${grid.event_date}T12:00:00`).toLocaleDateString("ru-RU") : "Дата не задана"} · Хабаровск</span></p>
    {grid.blocks.map(block => <section key={block.id} className="overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h3 className="break-words font-semibold">{block.category_name} · {block.name}</h3>{onEdit && editingId !== block.id && <button type="button" className={button} disabled={actionsDisabled} onClick={() => onEdit(block.id)} aria-label={`Редактировать: ${block.category_name} · ${block.name}`}>Редактировать</button>}{onDelete && editingId !== block.id && <button type="button" className={`${button} text-[var(--danger)]`} disabled={actionsDisabled} onClick={() => onDelete(block.id)} aria-label={`Удалить: ${block.category_name} · ${block.name}`}>Удалить</button>}</div><p className="mt-1 text-xs text-[var(--text-muted)]">{block.venue} · Дорожек: {block.lanes} · Мест: {block.planned_count} · Заходов: {block.heats.length}</p></div><strong className="text-sm">{block.start_time} — {block.end_time}</strong></header>
      {editingId === block.id ? editorForm : <>
      {block.briefing_time && <p className="border-t border-[var(--line-soft)] px-4 py-3 text-sm">{block.briefing_time} — {block.start_time} · Брифинг</p>}
      <div className="border-t border-[var(--line-soft)]"><div className="divide-y divide-[var(--line-soft)]">{block.heats.map(heat => <div key={heat.number} className="grid sm:grid-cols-[180px_minmax(0,1fr)]"><div className="px-4 py-4 text-sm"><strong>{heat.start_time} — {heat.end_time}</strong><p className="mt-1 text-[var(--text-muted)]">Заход {heat.number}</p></div><ol className="grid min-w-0" style={{gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 180px), 1fr))"}}>{Array.from({length:block.lanes},(_,index) => {
        const lane = index + 1;
        const slot = heat.slots.find(item => item.lane === lane);
        return <li key={lane} className="relative flex min-h-16 min-w-0 items-center justify-center border-l border-b border-[var(--line-soft)] px-4 py-5 text-center text-sm"><span className="absolute left-2 top-1 text-xs text-[var(--text-muted)]">{lane}</span><span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{slot ? slot.team_name || (block.assignment === "results" ? "После результатов" : "Резерв") : "—"}</span></li>;
      })}</ol></div>)}</div></div>
      {(block.gap_minutes > 0 || block.break_after_minutes > 0) && <p className="border-t border-[var(--line-soft)] px-4 py-3 text-xs text-[var(--text-muted)]">Между заходами: {block.gap_minutes} мин{block.break_after_minutes > 0 ? ` · Перерыв после комплекса: ${block.end_time} — ${block.available_after}` : ""}</p>}
      </>}
    </section>)}
  </div>;
}
