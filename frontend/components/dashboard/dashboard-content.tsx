"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasModuleAccess, type AuthModulePermission } from "@/lib/access";
import { fetchDashboard, type DashboardData } from "@/lib/api/dashboard";
import { AttentionPanelLive } from "./attention-panel-live";

const actions = [
  ["/sales", "Новая продажа", "Открыть кассу", "sales"],
  ["/clients", "Найти клиента", "База и абонементы", "clients"],
  ["/schedule", "Расписание", "Все дни и занятия", "schedule"],
] as const;

export function DashboardContent({ name, modules }: { name: string; modules?: readonly AuthModulePermission[] }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const local = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && window.location.port === "3000";
    if (local) {
      const today = new Date().toISOString().slice(0, 10);
      setData({ generated_at: new Date().toISOString(), schedule: { date: today, total_slots: 0, completed_slots: 0, total_bookings: 0, slots: [] }, attention: { unpaid_visits: [], expiring_subscriptions: [], low_stock: [] } });
      return;
    }

    let active = true;
    fetchDashboard().then((result) => { if (active) setData(result); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить главный экран"); });
    return () => { active = false; };
  }, []);

  const date = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return <div className="min-h-[calc(100dvh-8rem)] p-5 sm:p-8">
    <header className="flex flex-col gap-5 border-b border-white/[.07] pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[10px] uppercase tracking-[.28em] text-[#5ef4d8]">Рабочий день</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#f1f4f8] sm:text-4xl">Добрый день, {name}</h1><p className="mt-2 text-sm text-[#7f899b]">Всё важное по клубу — на одном экране.</p></div>
      <div className="flex items-center gap-3"><i className="h-2 w-2 rounded-full bg-[#5ef4d8] shadow-[0_0_14px_#5ef4d8]" /><p className="text-sm font-semibold capitalize text-[#dfe4ec]">{date}</p></div>
    </header>

    {error && <div className="mt-7 rounded-[20px] border border-[#ff9d73]/20 bg-[#ff9d73]/[.06] p-5 text-sm text-[#ffb294]">{error}</div>}
    {!data && !error && <div className="mt-7 grid gap-5 xl:grid-cols-[1.55fr_.85fr]"><div className="h-[360px] animate-pulse rounded-[24px] bg-white/[.035]" /><div className="h-[250px] animate-pulse rounded-[24px] bg-white/[.025]" /></div>}
    {data && <section className="mt-7 grid items-start gap-5 xl:grid-cols-[1.55fr_.85fr]">
      {data.schedule ? <ScheduleCard schedule={data.schedule} /> : <div />}
      <AttentionPanelLive data={data.attention} />
    </section>}

    <section className="mt-5 grid gap-3 md:grid-cols-3">{actions.filter((action) => hasModuleAccess(modules, action[3])).map((action) => <Link key={action[0]} href={action[0]} className="group flex items-center gap-4 rounded-[20px] border border-white/[.07] bg-white/[.025] p-5 transition-all duration-200 hover:border-[#5ef4d8]/30 hover:bg-[#5ef4d8]/10"><b className="grid h-11 w-11 place-items-center rounded-[14px] bg-white/[.05] text-[#95a1b5] transition-colors duration-200 group-hover:bg-[#5ef4d8] group-hover:text-[#071310]">{action[1][0]}</b><div className="flex-1"><p className="font-semibold text-[#e7ebf1]">{action[1]}</p><p className="text-xs text-[#707b8e]">{action[2]}</p></div><span className="text-[#7f8a9d] transition-transform group-hover:translate-x-0.5 group-hover:text-[#d8dee7]"><ArrowRightIcon /></span></Link>)}</section>
  </div>;
}

function ScheduleCard({ schedule }: { schedule: NonNullable<DashboardData["schedule"]> }) {
  return <div className="overflow-hidden rounded-[24px] border border-white/[.08] bg-[rgba(17,23,34,.82)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
    <div className="flex flex-col gap-5 border-b border-white/[.07] px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] uppercase tracking-[.24em] text-[#7e899d]">Сегодня в клубе</p><h2 className="mt-2 text-2xl font-semibold text-[#edf1f6]">Расписание</h2></div><div className="grid grid-cols-3 gap-7 text-center sm:ml-auto">{[[schedule.total_slots, "занятий"], [schedule.completed_slots, "завершено"], [schedule.total_bookings, "записей"]].map(([value, label]) => <div key={label} className="min-w-[48px]"><strong className="text-xl font-semibold text-[#dfe4ec]">{value}</strong><p className="mt-0.5 text-[10px] lowercase text-[#748096]">{label}</p></div>)}</div></div>
    {schedule.slots.length > 0 ? <div className="divide-y divide-white/[.055] px-3 py-2">{schedule.slots.map((slot) => { const occupied = Number(slot.occupied_count || 0); const free = Math.max(Number(slot.capacity || 0) - occupied, 0); return <Link href="/schedule" key={slot.id} className="grid grid-cols-[58px_minmax(0,1fr)_54px] items-center gap-3 rounded-[15px] px-3 py-3.5 transition hover:bg-[#5ef4d8]/10 sm:grid-cols-[64px_minmax(0,1fr)_64px_76px]"><time className={`text-sm font-semibold ${slot.is_in_progress ? "text-[#5ef4d8]" : "text-[#e7ebf1]"}`}>{slot.is_in_progress ? "Сейчас" : String(slot.start_time).slice(0, 5)}</time><div className="min-w-0"><p className="truncate text-sm font-medium text-[#dfe4ec]">{slot.training_type_name || "Занятие"}</p><p className="mt-0.5 truncate text-xs text-[#6f7a8e]">{slot.trainer_name || "Тренер не назначен"}</p></div><p className="text-right text-xs text-[#9aa4b5]">{occupied} / {slot.capacity}</p><p className={`hidden text-right text-xs font-medium sm:block ${free === 0 ? "text-[#ff9d73]" : "text-[#5ef4d8]"}`}>{free === 0 ? "Заполнено" : `${free} мест`}</p></Link>; })}</div> : <div className="grid min-h-[210px] place-items-center p-6 text-center"><div><p className="text-sm text-[#9aa4b5]">На сегодня больше нет занятий.</p><p className="mt-2 text-xs text-[#657084]">Дневная статистика сохранена выше.</p></div></div>}
  </div>;
}

function ArrowRightIcon() { return <svg viewBox="0 0 18 18" width="18" height="18" fill="none" aria-hidden="true"><path d="M3.5 9h10M9.5 5l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
