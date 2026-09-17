"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { fetchCompetitionSchedule, generateCompetitionSchedule, saveCompetitionSchedule, type CompetitionSchedule, type ScheduleConfig, type CompetitionComplex, type ScheduleGrid } from "@/lib/api/competition-schedule";

const button = "min-h-11 rounded-xl border border-[var(--line-soft)] px-4 py-2 text-sm font-medium disabled:opacity-40";
const primary = `${button} bg-[var(--accent)] text-[#062b26]`;
const inputClass = "mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] px-3 py-2 text-sm text-[var(--text-main)]";

export default function CompetitionSchedulePanel({ eventKey }: { eventKey: string }) {
  const [data, setData] = useState<CompetitionSchedule | null>(null);
  const [draft, setDraft] = useState<ScheduleConfig>({categories:[]});
  const [category, setCategory] = useState("");
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

  const accept = useCallback((value: CompetitionSchedule) => {
    setData(value);
    setDraft({categories:value.competition.categories.map(item => value.config.categories.find(c => c.category_key === item.key) || {category_key:item.key,planned_count:null,complexes:[]})});
    setCategory(current => current || value.competition.categories[0]?.key || "");
    setDirty(false);
  }, []);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { accept(await fetchCompetitionSchedule(eventKey)); }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось загрузить расписание"); }
    finally { setBusy(false); }
  }, [eventKey, accept]);
  useEffect(() => { void load(); }, [load]);

  const selected = draft.categories.find(item => item.category_key === category);
  function changeCategory(next: NonNullable<typeof selected>) {
    setDraft(current => ({categories:current.categories.map(item => item.category_key === category ? next : item)}));
    setDirty(true); setNotice("");
  }
  function updateComplex(id: string, patch: Partial<CompetitionComplex>) {
    if (selected) changeCategory({...selected,complexes:selected.complexes.map(item => item.id === id ? {...item,...patch} : item)});
  }
  function addComplex() {
    if (!selected) return;
    const last = selected.complexes.at(-1);
    changeCategory({...selected,complexes:[...selected.complexes,{
      id:crypto.randomUUID(),name:`Комплекс ${selected.complexes.length + 1}`, start_time:"", briefing_time:null,
      venue:last?.venue || "",lanes:last?.lanes || 4,duration_minutes:10,gap_minutes:3,break_after_minutes:0,
    }]});
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (!data) return;
    setBusy(true); setError(""); setNotice("");
    try { accept(await saveCompetitionSchedule(eventKey,draft,data.revision)); setNotice("Настройки сохранены. Расчёт обновлён."); }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось сохранить настройки"); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!data || dirty) return;
    setBusy(true); setError(""); setNotice("");
    try { accept(await generateCompetitionSchedule(eventKey,data.revision,data.source_hash)); setView("grid"); setNotice("Сетка сохранена. Состав первого комплекса — по оплаченным заявкам."); }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось сформировать сетку"); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5 text-[var(--text-main)]">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-4"><button className="min-h-11 text-sm" aria-pressed={view === "settings"} onClick={() => setView("settings")}><span className={view === "settings" ? "border-b-2 border-[var(--accent)] pb-2" : "text-[var(--text-muted)]"}>Настройка комплексов</span></button><button className="min-h-11 text-sm" aria-pressed={view === "grid"} onClick={() => setView("grid")}><span className={view === "grid" ? "border-b-2 border-[var(--accent)] pb-2" : "text-[var(--text-muted)]"}>Сохранённая сетка</span></button></div>
      <button className={button} disabled={busy || dirty} onClick={() => void load()}>Обновить данные</button>
    </header>
    {error && <p role="alert" className="whitespace-pre-line text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--accent)]">{notice}</p>}
    {!data && <p className="text-sm text-[var(--text-muted)]">{busy ? "Загружаем комплексы…" : "Расписание недоступно. Повторите загрузку."}</p>}
    {data && view === "settings" && <>
      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
          <div className="grid items-end gap-4 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto]">
            <label className="min-w-0 text-sm">Категория<select className={inputClass} value={category} onChange={e => setCategory(e.target.value)}>{data.competition.categories.map(item => <option className="bg-white text-black" key={item.key} value={item.key}>{item.name}</option>)}</select></label>
            <label className="min-w-0 text-sm">Плановое количество команд<input className={inputClass} type="number" min={1} max={1000} step={1} placeholder={`По оплатам: ${data.confirmed_counts[category] || 0}`} value={selected?.planned_count ?? ""} onChange={e => selected && changeCategory({...selected,planned_count:e.target.value === "" ? null : Number(e.target.value)})} /></label>
            <button type="button" className={button} disabled={!selected || selected.complexes.length >= 20} onClick={addComplex}>Добавить комплекс</button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Пустое количество — расчёт по оплаченным командам. Начало и брифинг задаются по времени Хабаровска. Брифинг заканчивается к началу первого захода.</p>
          {!selected?.complexes.length && <div className="border-y border-[var(--line-soft)] py-10 text-center text-sm text-[var(--text-muted)]">Добавьте первый комплекс этой категории.</div>}
          {selected?.complexes.map((complex,index) => <section key={complex.id} className="space-y-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Комплекс {index + 1}</h3><button type="button" className={`${button} text-[var(--text-muted)]`} onClick={() => changeCategory({...selected,complexes:selected.complexes.filter(item => item.id !== complex.id)})}>Убрать из плана</button></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="min-w-0 text-xs">Название<input aria-label={`Комплекс ${index+1}: название`} className={inputClass} required maxLength={120} value={complex.name} onChange={e => updateComplex(complex.id,{name:e.target.value})} /></label>
              <label className="min-w-0 text-xs">Место / площадка<input aria-label={`Комплекс ${index+1}: площадка`} className={inputClass} required maxLength={120} placeholder="Основной зал" value={complex.venue} onChange={e => updateComplex(complex.id,{venue:e.target.value})} /></label>
              <label className="min-w-0 text-xs">Начало первого захода<input aria-label={`Комплекс ${index+1}: начало`} className={inputClass} type="time" required value={complex.start_time} onChange={e => updateComplex(complex.id,{start_time:e.target.value})} /></label>
              <label className="min-w-0 text-xs">Начало брифинга · необязательно<input aria-label={`Комплекс ${index+1}: брифинг`} className={inputClass} type="time" value={complex.briefing_time || ""} onChange={e => updateComplex(complex.id,{briefing_time:e.target.value || null})} /></label>
              {([{key:"lanes",name:"Количество дорожек",min:1,max:100},{key:"duration_minutes",name:"Время одного захода, мин",min:1,max:240},{key:"gap_minutes",name:"Между заходами, мин",min:0,max:240},{key:"break_after_minutes",name:"После комплекса, мин",min:0,max:240}] as const).map(item => <label key={item.key} className="min-w-0 text-xs">{item.name}<input aria-label={`Комплекс ${index+1}: ${item.name}`} className={inputClass} required type="number" step={1} min={item.min} max={item.max} value={Number.isNaN(complex[item.key]) ? "" : complex[item.key]} onChange={e => updateComplex(complex.id,{[item.key]:e.target.value === "" ? NaN : Number(e.target.value)})} /></label>)}
            </div>
          </section>)}
          <div className="flex flex-wrap items-center gap-3"><button type="submit" className={primary} disabled={!dirty}>{busy ? "Сохраняем…" : "Сохранить и рассчитать"}</button>{dirty && <span className="text-sm text-[var(--text-muted)]">Есть несохранённые изменения</span>}</div>
        </fieldset>
      </form>
      <section className="space-y-4 border-t border-[var(--line-soft)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Расчёт всего мероприятия</h2><button className={primary} disabled={busy || dirty || !data.preview.blocks.length || !!data.preview.errors.length} onClick={() => void generate()}>{data.grid ? "Пересформировать сетку" : "Сформировать сетку"}</button></div>
        <p className="text-xs text-[var(--text-muted)]">Перерыв после комплекса резервирует площадку. Следующее начало задайте с учётом этого перерыва. Сохранённая сетка изменится только по кнопке формирования.</p>
        {dirty && <p className="text-sm text-[var(--warning)]">Ниже расчёт по последним сохранённым настройкам.</p>}
        {!!data.preview.errors.length && <ul role="alert" className="list-disc space-y-2 pl-5 text-sm text-[var(--danger)]">{data.preview.errors.map((message,i) => <li key={i}>{message}</li>)}</ul>}
        <Grid grid={data.preview} />
      </section>
    </>}
    {data && view === "grid" && <>
      {(data.grid_stale || dirty) && <p className="rounded-xl border border-[var(--line-soft)] p-4 text-sm text-[var(--warning)]">Состав команд или настройки изменились. Здесь остаётся прежняя сетка. Проверьте расчёт во вкладке настройки и пересформируйте её, если нужно.</p>}
      {data.grid ? <><p className="text-sm text-[var(--text-muted)]">Первый комплекс — поздние заявки выступают раньше. В следующих комплексах места зарезервированы; распределение по результатам появится на следующем этапе.</p><Grid grid={data.grid} /></> : <p className="border-y border-[var(--line-soft)] py-10 text-center text-sm text-[var(--text-muted)]">Сетка ещё не сформирована. Добавьте комплексы и проверьте расчёт.</p>}
    </>}
  </div>;
}

function Grid({ grid }: { grid: ScheduleGrid }) {
  if (!grid.blocks.length) return <p className="text-sm text-[var(--text-muted)]">После добавления комплексов здесь появится расписание.</p>;
  return <div className="space-y-4">
    <p className="text-sm"><strong>{grid.start_time} — {grid.end_time}</strong><span className="text-[var(--text-muted)]"> · {grid.event_date ? new Date(`${grid.event_date}T12:00:00`).toLocaleDateString("ru-RU") : "Дата не задана"} · Хабаровск</span></p>
    {grid.blocks.map(block => <section key={block.id} className="overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4"><div><h3 className="break-words font-semibold">{block.category_name} · {block.name}</h3><p className="mt-1 text-xs text-[var(--text-muted)]">{block.venue} · Дорожек: {block.lanes} · Мест: {block.planned_count} · Заходов: {block.heats.length}</p></div><strong className="text-sm">{block.start_time} — {block.end_time}</strong></header>
      {block.briefing_time && <p className="border-t border-[var(--line-soft)] px-4 py-3 text-sm">{block.briefing_time} — {block.start_time} · Брифинг</p>}
      <div className="divide-y divide-[var(--line-soft)] border-t border-[var(--line-soft)]">{block.heats.map(heat => <div key={heat.number} className="grid gap-3 px-4 py-4 sm:grid-cols-[180px_minmax(0,1fr)]"><div className="text-sm"><strong>{heat.start_time} — {heat.end_time}</strong><p className="mt-1 text-[var(--text-muted)]">Заход {heat.number}</p></div><ol className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{heat.slots.map(slot => <li key={slot.lane} className="flex min-w-0 gap-3 text-sm"><span className="w-5 shrink-0 text-[var(--text-muted)]">{slot.lane}</span><span className="break-words">{slot.team_name || (block.assignment === "results" ? "После результатов" : "Резерв")}</span></li>)}</ol></div>)}</div>
      {(block.gap_minutes > 0 || block.break_after_minutes > 0) && <p className="border-t border-[var(--line-soft)] px-4 py-3 text-xs text-[var(--text-muted)]">Между заходами: {block.gap_minutes} мин{block.break_after_minutes > 0 ? ` · Перерыв после комплекса: ${block.end_time} — ${block.available_after}` : ""}</p>}
    </section>)}
  </div>;
}
