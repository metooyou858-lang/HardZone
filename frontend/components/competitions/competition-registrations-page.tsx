"use client";

import { useEffect, useMemo, useState } from "react";

import {
  fetchCompetitionRegistrations,
  updateCompetitionRegistrationStatus,
  type CompetitionPublicConfig,
  type CompetitionRegistration,
  type CompetitionRegistrationStatus,
} from "@/lib/api/competitions";

const categoryLabels = {
  amateur: "Любители",
  advanced: "Продвинутые",
} as const;

const paymentLabels = {
  pending: "Ожидает оплаты",
  processing: "Оплачивается",
  paid: "Оплачено",
  failed: "Не оплачено",
  refunded: "Возврат",
} as const;

function paymentColor(status: keyof typeof paymentLabels) {
  if (status === "paid") return "text-[var(--accent)]";
  if (status === "failed" || status === "refunded") return "text-[var(--danger)]";
  return "text-[var(--text-muted)]";
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

export default function CompetitionRegistrationsPage() {
  const [competition, setCompetition] = useState<CompetitionPublicConfig | null>(null);
  const [registrations, setRegistrations] = useState<CompetitionRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCompetitionRegistrations();
      setCompetition(data.competition);
      setRegistrations(data.registrations);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить заявки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const totals = useMemo(() => {
    const active = registrations.filter((item) => item.status === "registered");
    return {
      active: active.length,
      paid: active.filter((item) => item.payment_status === "paid").length,
      amateur: active.filter((item) => item.category === "amateur").length,
      advanced: active.filter((item) => item.category === "advanced").length,
    };
  }, [registrations]);

  async function changeStatus(id: string, status: CompetitionRegistrationStatus) {
    setSavingId(id);
    setError("");
    setNotice("");
    try {
      setRegistrations(await updateCompetitionRegistrationStatus(id, status));
      setNotice(status === "cancelled" ? "Регистрация отменена" : "Регистрация восстановлена");
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Не удалось изменить статус");
    } finally {
      setSavingId(null);
    }
  }

  async function copyRegistrationLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/competition`);
      setNotice("Ссылка на регистрацию скопирована");
      setError("");
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)]">{competition?.name || "Командные соревнования HardZone"}</p>
          <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">Соревнования</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Заявок: {totals.active} · Оплачено: {totals.paid} · Любители: {totals.amateur} · Продвинутые: {totals.advanced}</p>
        </div>
        <button type="button" onClick={() => void copyRegistrationLink()} className="min-h-11 rounded-[14px] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#062b26] transition hover:brightness-110">
          Скопировать ссылку регистрации
        </button>
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

      <section className="overflow-hidden rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--line-soft)] text-xs text-[var(--text-muted)]">
                <th className="px-5 py-4 font-medium">Команда</th>
                <th className="px-5 py-4 font-medium">Категория</th>
                <th className="px-5 py-4 font-medium">Мужчина</th>
                <th className="px-5 py-4 font-medium">Женщина</th>
                <th className="px-5 py-4 font-medium">Подана</th>
                <th className="px-5 py-4 font-medium">Оплата</th>
                <th className="px-5 py-4 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((item) => (
                <tr key={item.id} className={`border-b border-[var(--line-soft)] last:border-0 ${item.status === "cancelled" ? "opacity-55" : ""}`}>
                  <td className="px-5 py-4 text-sm font-semibold text-[var(--text-main)]">{item.team_name}{item.team_email && <a className="mt-1 block text-xs font-normal text-[var(--text-muted)]" href={`mailto:${item.team_email}`}>{item.team_email}</a>}{item.email_delivery_issue && <span className="mt-1 block text-xs text-[var(--warning)]">Проверьте отправку письма</span>}{item.automation_error && <span className="mt-1 block text-xs text-[var(--warning)]">Проверка оплаты отложена</span>}</td>
                  <td className="px-5 py-4 text-sm text-[var(--text-main)]">{categoryLabels[item.category]}</td>
                  <td className="px-5 py-4 text-sm"><span className="block text-[var(--text-main)]">{item.male_name}</span><a className="mt-1 block text-xs text-[var(--text-muted)] hover:text-[var(--accent)]" href={`tel:${item.male_phone}`}>{item.male_phone}</a></td>
                  <td className="px-5 py-4 text-sm"><span className="block text-[var(--text-main)]">{item.female_name}</span><a className="mt-1 block text-xs text-[var(--text-muted)] hover:text-[var(--accent)]" href={`tel:${item.female_phone}`}>{item.female_phone}</a></td>
                  <td className="px-5 py-4 text-xs text-[var(--text-muted)]">{createdAt(item.created_at)}</td>
                  <td className={`px-5 py-4 text-sm font-medium ${paymentColor(item.payment_status)}`}>{paymentLabels[item.payment_status]}</td>
                  <td className="px-5 py-4">
                    <select value={item.status} disabled={savingId === item.id} onChange={(event) => void changeStatus(item.id, event.target.value as CompetitionRegistrationStatus)} className="min-h-10 rounded-[10px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] disabled:opacity-50">
                      <option value="registered">Зарегистрирована</option>
                      <option value="cancelled">Отменена</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-[var(--line-soft)] md:hidden">
          {registrations.map((item) => (
            <article key={item.id} className={`p-4 ${item.status === "cancelled" ? "opacity-55" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-semibold text-[var(--text-main)]">{item.team_name}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{categoryLabels[item.category]} · {createdAt(item.created_at)}</p>{item.team_email && <a className="mt-1 block text-xs text-[var(--text-muted)]" href={`mailto:${item.team_email}`}>{item.team_email}</a>}{item.email_delivery_issue && <p className="mt-1 text-xs text-[var(--warning)]">Проверьте отправку письма</p>}{item.automation_error && <p className="mt-1 text-xs text-[var(--warning)]">Проверка оплаты отложена</p>}<p className={`mt-1 text-xs font-medium ${paymentColor(item.payment_status)}`}>{paymentLabels[item.payment_status]}</p></div>
                <select aria-label={`Статус команды ${item.team_name}`} value={item.status} disabled={savingId === item.id} onChange={(event) => void changeStatus(item.id, event.target.value as CompetitionRegistrationStatus)} className="min-h-10 max-w-[148px] rounded-[10px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)] disabled:opacity-50">
                  <option value="registered">Зарегистрирована</option>
                  <option value="cancelled">Отменена</option>
                </select>
              </div>
              <div className="mt-4 grid gap-3 text-sm">
                <div><span className="block text-xs text-[var(--text-muted)]">Мужчина</span><span className="mt-1 block text-[var(--text-main)]">{item.male_name}</span><a className="mt-1 block text-xs text-[var(--accent)]" href={`tel:${item.male_phone}`}>{item.male_phone}</a></div>
                <div><span className="block text-xs text-[var(--text-muted)]">Женщина</span><span className="mt-1 block text-[var(--text-main)]">{item.female_name}</span><a className="mt-1 block text-xs text-[var(--accent)]" href={`tel:${item.female_phone}`}>{item.female_phone}</a></div>
              </div>
            </article>
          ))}
        </div>

        {!loading && registrations.length === 0 && <div className="px-5 py-16 text-center text-sm text-[var(--text-muted)]">Заявок пока нет</div>}
        {loading && <div className="px-5 py-16 text-center text-sm text-[var(--text-muted)]">Загружаем заявки…</div>}
      </section>
    </div>
  );
}
