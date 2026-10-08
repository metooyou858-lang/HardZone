"use client";

import { useMemo, useState } from "react";
import {
  finishCompetitionOnsiteRegistration,
  reopenCompetitionOnsiteRegistration,
  updateCompetitionOnsiteStatus,
  type CompetitionPublicConfig,
  type CompetitionRegistration,
} from "@/lib/api/competitions";

const button = "min-h-11 rounded-xl border border-[var(--line-soft)] px-4 py-2 text-sm font-medium disabled:opacity-50";
const primary = `${button} bg-[var(--accent)] text-[#062b26]`;

export default function CompetitionOnsiteRegistrationPanel({ eventKey, competition, registrations, onChanged }: {
  eventKey: string;
  competition: CompetitionPublicConfig;
  registrations: CompetitionRegistration[];
  onChanged: (competition: CompetitionPublicConfig, registrations: CompetitionRegistration[]) => void;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const teams = useMemo(() => registrations.filter(item => item.status === "registered" && item.payment_status === "paid"), [registrations]);
  const arrived = teams.filter(item => item.onsite_status === "arrived").length;
  const closed = Boolean(competition.onsite_registration_closed_at);
  const categoryNames = Object.fromEntries(competition.categories.map(item => [item.key, item.name]));

  async function toggle(item: CompetitionRegistration) {
    setSavingId(item.id); setError(""); setNotice("");
    try {
      const next = item.onsite_status === "arrived" ? "pending" : "arrived";
      const updated = await updateCompetitionOnsiteStatus(eventKey, item.id, next);
      onChanged(competition, updated);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось изменить отметку"); }
    finally { setSavingId(null); }
  }

  async function finish() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await finishCompetitionOnsiteRegistration(eventKey);
      onChanged(result.competition, result.registrations);
      setNotice("Состав участников зафиксирован. Пересформируйте сетку в разделе «Комплексы и заходы».");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось завершить офлайн-регистрацию"); }
    finally { setBusy(false); }
  }

  async function reopen() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await reopenCompetitionOnsiteRegistration(eventKey);
      onChanged(result.competition, result.registrations);
      setNotice("Офлайн-регистрация снова открыта. Неявившиеся команды вернуты в ожидание.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось открыть офлайн-регистрацию"); }
    finally { setBusy(false); }
  }

  if (!competition.online_registration_closed_at) return <p className="border-y border-[var(--line-soft)] py-10 text-center text-sm text-[var(--text-muted)]">Сначала завершите онлайн-регистрацию.</p>;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h2 className="text-lg font-semibold">Команды на площадке</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Прибыли: {arrived} из {teams.length}. Отметка «Прибыла» также подтверждает выдачу стартового пакета.</p></div>
      {closed ? <button className={button} disabled={busy} onClick={() => void reopen()}>Открыть для исправления</button> : <button className={primary} disabled={busy || !teams.length} onClick={() => void finish()}>{busy ? "Завершаем…" : "Завершить офлайн-регистрацию"}</button>}
    </header>
    {closed && <p className="rounded-xl border border-[rgba(94,244,216,.22)] bg-[rgba(94,244,216,.08)] p-4 text-sm text-[var(--accent)]">Офлайн-регистрация завершена. Неприбывшие команды не попадут в окончательную сетку.</p>}
    {(error || notice) && <p role={error ? "alert" : "status"} className={`text-sm ${error ? "text-[var(--danger)]" : "text-[var(--accent)]"}`}>{error || notice}</p>}
    <section className="overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
      {teams.map(item => <div key={item.id} className="grid min-h-20 items-center gap-3 border-b border-[var(--line-soft)] px-4 py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_180px_150px]">
        <div className="min-w-0"><strong className="block break-words text-sm">{item.team_name}</strong><span className="mt-1 block text-xs text-[var(--text-muted)]">{categoryNames[item.category]}</span></div>
        <span className={`text-sm ${item.onsite_status === "arrived" ? "text-[var(--accent)]" : item.onsite_status === "no_show" ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>{item.onsite_status === "arrived" ? "Прибыла · пакет выдан" : item.onsite_status === "no_show" ? "Не прибыла" : "Ожидаем"}</span>
        {!closed && <button type="button" className={item.onsite_status === "arrived" ? button : primary} disabled={savingId === item.id} onClick={() => void toggle(item)}>{item.onsite_status === "arrived" ? "Отменить отметку" : "Прибыла"}</button>}
      </div>)}
      {!teams.length && <p className="p-10 text-center text-sm text-[var(--text-muted)]">Оплаченных команд нет.</p>}
    </section>
  </div>;
}
