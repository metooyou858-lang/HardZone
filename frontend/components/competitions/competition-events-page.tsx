"use client";

import { FormEvent, useEffect, useState } from "react";
import { fetchCompetitionEvents, saveCompetitionEvent, type CompetitionEvent, type CompetitionEventInput, type CompetitionPublicConfig } from "@/lib/api/competitions";
import CompetitionRegistrationsPage from "./competition-registrations-page";

const field = "mt-2 min-h-11 w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-main)]";
const button = "min-h-11 rounded-xl border border-[var(--line-soft)] px-4 py-2 text-sm font-medium disabled:opacity-50";
const primary = `${button} bg-[var(--accent)] text-[#062b26]`;

export default function CompetitionEventsPage() {
  const [events, setEvents] = useState<CompetitionEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<CompetitionPublicConfig | "new" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try { setEvents(await fetchCompetitionEvents()); setError(""); }
    catch(e) { setError(e instanceof Error ? e.message : "Не удалось загрузить мероприятия"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("event");
    if (key) setSelected(key);
    void load();
  }, []);

  function select(key: string | null) {
    setSelected(key);
    window.history.replaceState(null, "", key ? `/competitions?event=${encodeURIComponent(key)}` : "/competitions");
  }

  if (editor) return <EventEditor initial={editor === "new" ? null : editor} onCancel={() => setEditor(null)} onSaved={async event => { setEditor(null); await load(); select(event.event_key); }} />;

  if (selected) return <CompetitionRegistrationsPage key={selected} eventKey={selected} onBack={() => { select(null); void load(); }} onEdit={setEditor} />;

  return <div className="space-y-6 text-[var(--text-main)]">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-semibold">Соревнования</h1><p className="mt-2 text-sm text-[var(--text-muted)]">Регистрация и участники каждого мероприятия</p></div>
      <button className={primary} onClick={() => setEditor("new")}>Создать мероприятие</button>
    </header>
    {error && <div role="alert" className="text-[var(--danger)]">{error} <button className={button} onClick={() => void load()}>Повторить</button></div>}
    {loading ? <p>Загружаем мероприятия…</p> : <section className="overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
      <div className="hidden grid-cols-[minmax(0,1fr)_150px_180px_100px] gap-5 border-b border-[var(--line-soft)] px-5 py-3 text-xs text-[var(--text-muted)] lg:grid"><span>Мероприятие</span><span>Дата</span><span>Регистрация</span><span>Подтверждено</span></div>
      {events.map(event => <button key={event.event_key} className="grid min-h-24 w-full gap-3 border-b border-[var(--line-soft)] px-5 py-5 text-left last:border-0 hover:bg-white/5 lg:grid-cols-[minmax(0,1fr)_150px_180px_100px] lg:items-center lg:gap-5" onClick={() => select(event.event_key)}>
        <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{event.name}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Команды М + Ж · {event.location}</p></div>
        <span className="text-sm">{event.date ? new Date(`${event.date}T12:00:00`).toLocaleDateString("ru-RU") : "Дата не задана"}</span>
        <span className={`text-sm ${event.registration_enabled ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>{event.registration_enabled ? "Приём заявок открыт" : "Приём заявок закрыт"}</span>
        <span className="text-sm"><span className="font-semibold">{event.confirmed_count}</span><span className="text-[var(--text-muted)]"> из {event.registrations_count} заявок</span></span>
      </button>)}
      {!events.length && !error && <p className="p-8 text-[var(--text-muted)]">Создайте первое мероприятие, чтобы открыть регистрацию.</p>}
    </section>}
  </div>;
}

function EventEditor({ initial, onCancel, onSaved }: { initial: CompetitionPublicConfig | null; onCancel: () => void; onSaved: (event: CompetitionPublicConfig) => Promise<void> }) {
  const [form, setForm] = useState<CompetitionEventInput>(() => initial || { name: "", date: "", location: "Клуб HardZone, г. Хабаровск, ул. Тихоокеанская, 47Г", fee_rubles: null, categories: [{ key: "amateur", name: "Любители" }, { key: "advanced", name: "Продвинутые" }], terms_text: "", registration_enabled: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function update<K extends keyof CompetitionEventInput>(key: K, value: CompetitionEventInput[K]) { setForm(current => ({ ...current, [key]: value })); }
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try { await onSaved(await saveCompetitionEvent(form, initial?.event_key)); }
    catch(err) { setError(err instanceof Error ? err.message : "Не удалось сохранить мероприятие"); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit} className="max-w-3xl space-y-6 text-[var(--text-main)]">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{initial ? "Настройки мероприятия" : "Новое мероприятие"}</h1><button type="button" className={button} disabled={saving} onClick={onCancel}>Назад</button></header>
    <fieldset disabled={saving} className="space-y-6 disabled:opacity-60">
      <label className="block text-sm">Название<input className={field} required maxLength={160} value={form.name} onChange={e => update("name", e.target.value)} /></label>
      <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm">Дата<input className={field} required type="date" value={form.date || ""} onChange={e => update("date", e.target.value)} /></label><label className="block text-sm">Взнос с команды, ₽<input className={field} required type="number" min={1} max={1000000} step={1} value={form.fee_rubles ?? ""} onChange={e => update("fee_rubles", e.target.value ? Number(e.target.value) : null)} /></label></div>
      <label className="block text-sm">Место проведения<input className={field} required maxLength={300} value={form.location} onChange={e => update("location", e.target.value)} /></label>
      <section className="space-y-3 border-t border-[var(--line-soft)] pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Категории · команды М + Ж</h2>{!initial?.legacy && <button type="button" className={button} disabled={form.categories.length >= 30} onClick={() => update("categories", [...form.categories, { key: crypto.randomUUID(), name: "" }])}>Добавить категорию</button>}</div>
        {form.categories.map((category, index) => <div key={category.key} className="flex items-center gap-3"><input aria-label={`Категория ${index + 1}`} className={field.replace("mt-2 ", "")} required maxLength={80} readOnly={initial?.legacy} value={category.name} onChange={e => update("categories", form.categories.map(item => item.key === category.key ? { ...item, name: e.target.value } : item))} />{!initial?.legacy && <button type="button" className={button} disabled={form.categories.length === 1} onClick={() => update("categories", form.categories.filter(item => item.key !== category.key))}>Убрать</button>}</div>)}
      </section>
      {!initial?.legacy && <label className="block text-sm">Условия участия<textarea className={`${field} min-h-40`} required maxLength={12000} value={form.terms_text} onChange={e => update("terms_text", e.target.value)} /><span className="mt-2 block text-xs text-[var(--text-muted)]">Участники увидят этот текст перед отправкой заявки. Количество и содержание комплексов можно определить позже.</span></label>}
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.registration_enabled} onChange={e => update("registration_enabled", e.target.checked)} />Открыть приём заявок</label>
      <p className="text-sm text-[var(--text-muted)]">Участие подтверждается после оплаты. На оплату новой заявки — 60 минут. Изменение взноса применяется к новым заявкам.</p>
    </fieldset>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <button className={primary} disabled={saving} type="submit">{saving ? "Сохраняем…" : initial ? "Сохранить изменения" : "Создать мероприятие"}</button>
  </form>;
}
