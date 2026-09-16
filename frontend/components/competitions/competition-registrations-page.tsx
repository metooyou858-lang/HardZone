"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CompetitionSchedulePanel from "./competition-schedule-panel";

import {
  fetchCompetitionRegistrations,
  updateCompetitionRegistrationStatus,
  type CompetitionPublicConfig,
  type CompetitionRegistration,
  type CompetitionRegistrationStatus,
} from "@/lib/api/competitions";

const paymentLabels = {
  pending: "Ожидает оплаты",
  processing: "Оплачивается",
  paid: "Подтверждена",
  failed: "Не оплачено",
  refunded: "Возврат",
} as const;

function paymentColor(status: keyof typeof paymentLabels) {
  if (status === "paid") return "text-[var(--accent)]";
  if (status === "failed" || status === "refunded") return "text-[var(--danger)]";
  return "text-[var(--text-muted)]";
}

function registrationLabel(item: CompetitionRegistration) {
  if (item.status === "cancelled") return item.expired_at ? "Срок оплаты истёк" : "Отменена";
  return paymentLabels[item.payment_status];
}

function createdAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function CompetitionRegistrationsPage({ eventKey, onBack, onEdit }: { eventKey: string; onBack: () => void; onEdit: (event: CompetitionPublicConfig) => void }) {
  const [competition, setCompetition] = useState<CompetitionPublicConfig | null>(null);
  const [registrations, setRegistrations] = useState<CompetitionRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState("");
  const [section, setSectionState] = useState<"registrations" | "schedule">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("section") === "schedule" ? "schedule" : "registrations"
  );
  function setSection(next: "registrations" | "schedule") {
    setSectionState(next);
    const url = new URL(window.location.href);
    url.searchParams.set("section", next);
    window.history.replaceState(window.history.state, "", url);
  }
  const requestVersion = useRef(0);
  const categoryLabels = Object.fromEntries((competition?.categories || []).map(item => [item.key, item.name]));

  const load = useCallback(async (silent = false) => {
    const version = ++requestVersion.current;
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await fetchCompetitionRegistrations(eventKey);
      if (version !== requestVersion.current) return;
      setCompetition(data.competition);
      setRegistrations(data.registrations);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить заявки");
    } finally {
      setLoading(false);
    }
  }, [eventKey]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const totals = useMemo(() => {
    const active = registrations.filter((item) => item.status === "registered");
    return {
      active: active.length,
      paid: active.filter((item) => item.payment_status === "paid").length,
    };
  }, [registrations]);
  const visible = category ? registrations.filter(item => item.category === category && item.status === "registered" && item.payment_status === "paid") : registrations;

  async function changeStatus(id: string, status: CompetitionRegistrationStatus) {
    setSavingId(id);
    setError("");
    setNotice("");
    try {
      ++requestVersion.current;
      setRegistrations(await updateCompetitionRegistrationStatus(id, status, eventKey));
      ++requestVersion.current;
      setNotice(status === "cancelled" ? "Регистрация отменена" : "Регистрация восстановлена");
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Не удалось изменить статус");
    } finally {
      setSavingId(null);
    }
  }

  async function copyRegistrationLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${competition?.public_path || "/competition"}`);
      setNotice("Ссылка на регистрацию скопирована");
      setError("");
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onBack} className="min-h-11 text-sm text-[var(--text-muted)]">← Все мероприятия</button>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="break-words text-2xl font-semibold text-[var(--text-main)]">{competition?.name || "Мероприятие"}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Активных заявок: {totals.active} · Подтверждено оплатой: {totals.paid}</p>
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={!competition} onClick={() => competition && onEdit(competition)} className="min-h-11 rounded-xl border border-[var(--line-soft)] px-4 text-sm">Настройки</button><button type="button" disabled={!competition} onClick={() => void copyRegistrationLink()} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#062b26]">Ссылка регистрации</button></div>
      </div>

      {!loading && competition && !competition.registration_enabled && (
        <div className="rounded-[14px] border border-[rgba(245,197,66,.24)] bg-[rgba(245,197,66,.08)] px-4 py-3 text-sm text-[var(--warning)]">
          Публичная регистрация временно закрыта настройкой мероприятия.
        </div>
      )}
      {(error || notice) && (
        <div className={`rounded-[14px] border px-4 py-3 text-sm ${error ? "border-[rgba(255,116,57,.28)] bg-[rgba(255,116,57,.1)] text-[var(--danger)]" : "border-[rgba(94,244,216,.22)] bg-[rgba(94,244,216,.08)] text-[var(--accent)]"}`} role={error ? "alert" : "status"}>
          {error || notice}
        </div>
      )}

      <nav aria-label="Разделы мероприятия" className="flex flex-wrap gap-x-6 border-b border-[var(--line-soft)]">
        {[{key:"registrations" as const,name:"Регистрация"},{key:"schedule" as const,name:"Комплексы и заходы"}].map(item => <button key={item.key} type="button" onClick={() => setSection(item.key)} aria-pressed={section === item.key} className={`min-h-11 border-b-2 px-1 text-sm ${section === item.key ? "border-[var(--accent)] text-[var(--text-main)]" : "border-transparent text-[var(--text-muted)]"}`}>{item.name}</button>)}
      </nav>
      <div hidden={section !== "schedule"}><CompetitionSchedulePanel eventKey={eventKey} /></div>
      {section === "registrations" && <>
      <nav aria-label="Заявки и категории" className="flex flex-wrap gap-x-5 border-b border-[var(--line-soft)]">
        {[{key:"",name:"Все заявки"}, ...(competition?.categories || [])].map(item => <button key={item.key} type="button" aria-pressed={category === item.key} onClick={() => setCategory(item.key)} className={`min-h-11 border-b-2 px-1 text-sm ${category === item.key ? "border-[var(--accent)] text-[var(--text-main)]" : "border-transparent text-[var(--text-muted)]"}`}>{item.name}{item.key && ` · ${registrations.filter(r => r.category === item.key && r.status === "registered" && r.payment_status === "paid").length}`}</button>)}
      </nav>
      {category && <p className="text-sm text-[var(--text-muted)]">Команды попадают в категорию автоматически после подтверждения оплаты.</p>}
      <section className="overflow-hidden rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--line-soft)] text-xs text-[var(--text-muted)]">
                <th className="px-5 py-4 font-medium">Команда</th>
                <th className="px-5 py-4 font-medium">Email</th>
                <th className="px-5 py-4 font-medium">Категория</th>
                <th className="px-5 py-4 font-medium">Мужчина</th>
                <th className="px-5 py-4 font-medium">Женщина</th>
                <th className="px-5 py-4 font-medium">Подана</th>
                <th className="px-5 py-4 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className={`border-b border-[var(--line-soft)] last:border-0 ${item.status === "cancelled" ? "opacity-55" : ""}`}>
                  <td className="px-5 py-4 text-sm font-semibold text-[var(--text-main)]">{item.team_name}{item.email_delivery_issue && <span className="mt-1 block text-xs text-[var(--warning)]">Проверьте отправку письма</span>}{item.automation_error && <span className="mt-1 block text-xs text-[var(--warning)]">Проверка оплаты отложена</span>}</td>
                  <td className="px-5 py-4 text-sm text-[var(--text-muted)]">{item.team_email ? <a className="block max-w-[240px] break-all hover:text-[var(--accent)]" href={`mailto:${item.team_email}`}>{item.team_email}</a> : "Не указан"}</td>
                  <td className="px-5 py-4 text-sm text-[var(--text-main)]">{categoryLabels[item.category]}</td>
                  <td className="px-5 py-4 text-sm"><span className="block text-[var(--text-main)]">{item.male_name}</span><a className="mt-1 block text-xs text-[var(--text-muted)] hover:text-[var(--accent)]" href={`tel:${item.male_phone}`}>{item.male_phone}</a></td>
                  <td className="px-5 py-4 text-sm"><span className="block text-[var(--text-main)]">{item.female_name}</span><a className="mt-1 block text-xs text-[var(--text-muted)] hover:text-[var(--accent)]" href={`tel:${item.female_phone}`}>{item.female_phone}</a></td>
                  <td className="px-5 py-4 text-xs text-[var(--text-muted)]">{createdAt(item.created_at)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-medium ${paymentColor(item.payment_status)}`}>{registrationLabel(item)}</span>
                      {!item.expired_at && <button type="button" disabled={savingId === item.id} onClick={() => void changeStatus(item.id, item.status === "registered" ? "cancelled" : "registered")} className="min-h-10 text-xs text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text-main)] disabled:opacity-50">{item.status === "registered" ? "Отменить" : "Восстановить"}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-[var(--line-soft)] md:hidden">
          {visible.map((item) => (
            <article key={item.id} className={`p-4 ${item.status === "cancelled" ? "opacity-55" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="font-semibold text-[var(--text-main)]">{item.team_name}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{categoryLabels[item.category]} · {createdAt(item.created_at)}</p><p className="mt-2 break-all text-xs text-[var(--text-muted)]">Email: {item.team_email ? <a href={`mailto:${item.team_email}`}>{item.team_email}</a> : "Не указан"}</p>{item.email_delivery_issue && <p className="mt-1 text-xs text-[var(--warning)]">Проверьте отправку письма</p>}{item.automation_error && <p className="mt-1 text-xs text-[var(--warning)]">Проверка оплаты отложена</p>}<p className={`mt-1 text-xs font-medium ${paymentColor(item.payment_status)}`}>{registrationLabel(item)}</p></div>
                {!item.expired_at && <button type="button" disabled={savingId === item.id} onClick={() => void changeStatus(item.id, item.status === "registered" ? "cancelled" : "registered")} className="min-h-10 shrink-0 text-xs text-[var(--text-muted)] underline underline-offset-4 hover:text-[var(--text-main)] disabled:opacity-50">{item.status === "registered" ? "Отменить" : "Восстановить"}</button>}
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <div><span className="block text-xs text-[var(--text-muted)]">Мужчина</span><span className="mt-1 block text-[var(--text-main)]">{item.male_name}</span><a className="mt-1 block text-xs text-[var(--accent)]" href={`tel:${item.male_phone}`}>{item.male_phone}</a></div>
                <div><span className="block text-xs text-[var(--text-muted)]">Женщина</span><span className="mt-1 block text-[var(--text-main)]">{item.female_name}</span><a className="mt-1 block text-xs text-[var(--accent)]" href={`tel:${item.female_phone}`}>{item.female_phone}</a></div>
              </div>
            </article>
          ))}
        </div>

        {!loading && visible.length === 0 && <div className="px-5 py-16 text-center text-sm text-[var(--text-muted)]">{category ? "В этой категории пока нет подтверждённых команд" : "Заявок пока нет"}</div>}
        {loading && <div className="px-5 py-16 text-center text-sm text-[var(--text-muted)]">Загружаем заявки…</div>}
      </section>
      </>}
    </div>
  );
}
