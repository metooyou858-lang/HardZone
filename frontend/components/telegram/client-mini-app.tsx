"use client";

import { type FormEvent, useEffect, useState } from "react";

import {
  bookClientMiniAppSlot,
  cancelClientMiniAppBooking,
  linkClientMiniAppPhone,
  loginClientMiniApp,
  type ClientMiniAppAvailableSlot,
  type ClientMiniAppBooking,
  type ClientMiniAppPayload,
  type ClientMiniAppSubscription,
  type ClientMiniAppVisit,
} from "@/lib/api/client-miniapp";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

type ClientTab = "home" | "schedule" | "subscription" | "profile";
type AuthMode = "checking" | "linked" | "phone" | "telegram";

const tabLabels: Record<ClientTab, string> = {
  home: "Главная",
  schedule: "Расписание",
  subscription: "Абонемент",
  profile: "Профиль",
};

const datePartsFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  weekday: "short",
});

function formatTime(value: string | null | undefined) {
  return String(value || "").slice(0, 5);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const parts = Object.fromEntries(datePartsFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekday = String(parts.weekday || "").replace(".", "");
  const day = String(parts.day || "");
  const month = String(parts.month || "");
  const capitalizedWeekday = weekday ? weekday.slice(0, 1).toUpperCase() + weekday.slice(1) : "";
  return [capitalizedWeekday, `${day} ${month}`].filter(Boolean).join(", ");
}

function dateKey(value: string | null | undefined) {
  return String(value || "").slice(0, 10);
}

function sortByDateTime<T extends { date: string; start_time: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftValue = `${dateKey(left.date)} ${left.start_time}`;
    const rightValue = `${dateKey(right.date)} ${right.start_time}`;
    return leftValue.localeCompare(rightValue);
  });
}

function firstDayOnly<T extends { date: string; start_time: string }>(items: T[]) {
  const sorted = sortByDateTime(items);
  const firstDay = dateKey(sorted[0]?.date);
  return firstDay ? sorted.filter((item) => dateKey(item.date) === firstDay) : [];
}

function clientName(data: ClientMiniAppPayload | null) {
  const client = data?.client;
  if (!client) return "Клиент HardZone";
  return [client.first_name, client.middle_name, client.last_name].filter(Boolean).join(" ");
}

function cabinetNumber(data: ClientMiniAppPayload | null) {
  return data?.client.barcode || "не указан";
}

function subscriptionTitle(subscription: ClientMiniAppSubscription | null) {
  if (!subscription) return "Нет активного абонемента";
  return subscription.product_name || {
    single: "Разовое посещение",
    visits: "Абонемент по посещениям",
    period: "Периодный абонемент",
    unlimited: "Безлимит",
  }[subscription.type];
}

function subscriptionMeta(subscription: ClientMiniAppSubscription | null) {
  if (!subscription) return "Обратитесь на ресепшн HardZone";
  if (subscription.type === "visits" || subscription.type === "single") {
    return subscription.visits_left === null ? "Посещения не ограничены" : `Осталось ${subscription.visits_left}`;
  }
  return subscription.expires_at ? `Действует до ${formatDate(subscription.expires_at.slice(0, 10))}` : "Активен";
}

const code128Patterns = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

function getCode128Pattern(value: string) {
  const text = value.trim();
  if (!text || [...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126)) {
    return null;
  }

  const codes = [104, ...[...text].map((char) => char.charCodeAt(0) - 32)];
  const checksum = codes.reduce((sum, code, index) => sum + (index === 0 ? code : code * index), 0) % 103;
  return [...codes, checksum, 106].map((code) => code128Patterns[code]).join("");
}

function BarcodeSvg({ value }: { value: string | null | undefined }) {
  const pattern = getCode128Pattern(String(value || ""));
  if (!pattern) {
    return (
      <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
        Штрихкод не указан
      </div>
    );
  }

  const quiet = 10;
  let x = quiet;
  const bars = [...pattern].map((width, index) => {
    const moduleWidth = Number(width);
    const bar = index % 2 === 0 ? { x, width: moduleWidth } : null;
    x += moduleWidth;
    return bar;
  }).filter(Boolean) as Array<{ x: number; width: number }>;
  const totalWidth = x + quiet;

  return (
    <div className="rounded-md bg-white px-3 py-2">
      <svg
        viewBox={`0 0 ${totalWidth} 34`}
        className="h-10 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Штрихкод ${value}`}
      >
        <rect x="0" y="0" width={totalWidth} height="44" fill="#ffffff" />
        {bars.map((bar, index) => (
          <rect key={`${bar.x}-${index}`} x={bar.x} y="3" width={bar.width} height="30" fill="#05070b" />
        ))}
      </svg>
    </div>
  );
}

function tabIcon(tab: ClientTab, active: boolean) {
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (tab === "home") {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 10v9h11v-9" />
        <path d="M10 19v-5h4v5" />
      </svg>
    );
  }

  if (tab === "schedule") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="M4 10h16" />
      </svg>
    );
  }

  if (tab === "subscription") {
    return (
      <svg {...common}>
        <path d="M6 4h12v16H6z" />
        <path d="M9 8h6" />
        <path d="M9 12h6" />
        <path d="M9 16h3" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function AppHeader({ title, onRefresh }: { title: string; onRefresh: () => void }) {
  return (
    <header className="z-20 shrink-0 bg-[rgba(8,11,16,0.9)] px-3 py-1.5 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="h-8 w-8" />
        <h1 className="text-sm font-medium leading-tight text-[var(--text-main)]">{title}</h1>
        <div className="flex h-8 w-8 items-center justify-end">
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-xs text-[var(--text-main)]"
            aria-label="Обновить"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 11a8 8 0 1 0-2.3 5.7" />
              <path d="M20 5v6h-6" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

function BottomNav({ active, onChange }: { active: ClientTab; onChange: (tab: ClientTab) => void }) {
  const tabs: ClientTab[] = ["home", "schedule", "subscription", "profile"];

  return (
    <nav className="z-30 shrink-0 px-3 pb-[max(7px,env(safe-area-inset-bottom))] pt-1">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(12,15,21,0.94)] p-1 shadow-[0_14px_30px_rgba(0,0,0,0.34)] backdrop-blur">
        {tabs.map((tab) => {
          const activeTab = active === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onChange(tab)}
              className={`flex min-h-[36px] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md px-1 text-[8px] transition [&_svg]:h-3.5 [&_svg]:w-3.5 ${
                activeTab
                  ? "bg-[rgba(94,244,216,0.12)] text-[var(--text-main)]"
                  : "text-[var(--text-muted)] active:bg-[rgba(255,255,255,0.04)]"
              }`}
            >
              {tabIcon(tab, activeTab)}
              <span className="block max-w-full truncate leading-tight">{tabLabels[tab]}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ClientCard({ data }: { data: ClientMiniAppPayload | null }) {
  const name = clientName(data);
  const barcode = data?.client.barcode || "";

  return (
    <section className="relative overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(135deg,#11151d_0%,#121923_100%)] p-3 shadow-[0_14px_34px_rgba(0,0,0,0.24)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#5ef4d8,#f6d46b,#ff7a59)]" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[rgba(94,244,216,0.10)] blur-2xl" />
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.92)] text-base font-medium text-[var(--text-inverse)] shadow-[0_8px_20px_rgba(0,0,0,0.24)]">
          {name.trim().slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium leading-tight text-[var(--text-main)]">{name}</h2>
          <p className="mt-1 truncate font-[family:var(--font-mono)] text-[11px] text-[var(--text-muted)]">
            ЛК {cabinetNumber(data)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[rgba(94,244,216,0.28)] bg-[rgba(94,244,216,0.10)] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-[#9ffbed]">
          Club
        </span>
      </div>
      <div className="relative mt-3">
        <BarcodeSvg value={barcode} />
      </div>
    </section>
  );
}

function SubscriptionSummary({ subscription }: { subscription: ClientMiniAppSubscription | null }) {
  return (
    <section className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-3">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">Абонемент</p>
      <p className="mt-1 truncate text-xs font-medium text-[var(--text-main)]">{subscriptionTitle(subscription)}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{subscriptionMeta(subscription)}</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-2.5 py-2">
      <p className="text-base font-medium leading-none text-[var(--text-main)]">{value}</p>
      <p className="mt-1 text-[10px] leading-none text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function BookingItem({ booking }: { booking: ClientMiniAppBooking }) {
  return (
    <article className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--accent)]">{formatDate(booking.date)}</p>
          <h3 className="mt-1 truncate text-xs font-medium text-[var(--text-main)]">
            {booking.training_type_name || "Занятие"}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{booking.trainer_name || "Тренер не назначен"}</p>
        </div>
        <span className="font-[family:var(--font-mono)] text-xs text-[var(--text-main)]">{formatTime(booking.start_time)}</span>
      </div>
    </article>
  );
}

function ClientBookingItem({
  booking,
  busy,
  onCancel,
}: {
  booking: ClientMiniAppBooking;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <article className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--accent)]">{formatDate(booking.date)}</p>
          <h3 className="mt-1 truncate text-xs font-medium text-[var(--text-main)]">
            {booking.training_type_name || "Занятие"}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{booking.trainer_name || "Тренер не назначен"}</p>
        </div>
        <span className="font-[family:var(--font-mono)] text-xs text-[var(--text-main)]">{formatTime(booking.start_time)}</span>
      </div>
      {booking.status === "confirmed" ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="mt-2 h-8 w-full rounded-md border border-[rgba(255,116,57,0.28)] bg-[rgba(255,116,57,0.08)] text-xs font-medium text-[#ffb599] disabled:opacity-60"
        >
          {busy ? "Отменяем..." : "Отменить запись"}
        </button>
      ) : null}
    </article>
  );
}

function AvailableSlotItem({
  slot,
  busy,
  onBook,
}: {
  slot: ClientMiniAppAvailableSlot;
  busy: boolean;
  onBook: () => void;
}) {
  const disabled = busy || slot.is_booked || slot.free_places <= 0;

  return (
    <article className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--accent)]">{formatDate(slot.date)}</p>
          <h3 className="mt-1 truncate text-xs font-medium text-[var(--text-main)]">
            {slot.training_type_name || "Занятие"}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{slot.trainer_name || "Тренер не назначен"}</p>
        </div>
        <div className="text-right">
          <p className="font-[family:var(--font-mono)] text-xs text-[var(--text-main)]">{formatTime(slot.start_time)}</p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">{slot.free_places} мест</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onBook}
        disabled={disabled}
        className="mt-2 h-8 w-full rounded-md bg-[var(--accent)] text-xs font-medium text-[var(--text-inverse)] disabled:bg-[rgba(255,255,255,0.08)] disabled:text-[var(--text-muted)]"
      >
        {busy ? "Записываем..." : slot.is_booked ? "Вы записаны" : slot.free_places <= 0 ? "Мест нет" : "Записаться"}
      </button>
    </article>
  );
}

function VisitItem({ visit }: { visit: ClientMiniAppVisit }) {
  const visitedAt = new Date(visit.visited_at);
  const label = Number.isNaN(visitedAt.getTime())
    ? visit.visited_at
    : formatDate(visitedAt.toISOString().slice(0, 10));

  return (
    <article className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-2.5">
      <p className="text-xs font-medium text-[var(--text-main)]">{visit.training_type_name || (visit.visit_type === "open_gym" ? "Open Gym" : "Занятие")}</p>
      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{label}</p>
    </article>
  );
}

function HomeScreen({ data }: { data: ClientMiniAppPayload | null }) {
  const activeSubscription = data?.subscriptions.find((item) => item.status === "active") || data?.subscriptions[0] || null;
  const nextBooking = data?.bookings[0] || null;

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      <ClientCard data={data} />
      <SubscriptionSummary subscription={activeSubscription} />
      <section className="grid grid-cols-3 gap-2">
        <Stat label="записей" value={data?.bookings.length ?? "..."} />
        <Stat label="посещений" value={data?.visits.length ?? "..."} />
        <Stat label="долг" value={data?.debt.unpaid_missed_count ?? "..."} />
      </section>
      <section className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-3">
        <h2 className="text-xs font-medium text-[var(--text-main)]">Ближайшая запись</h2>
        {nextBooking ? (
          <div className="mt-2">
            <BookingItem booking={nextBooking} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-muted)]">Активных записей пока нет</p>
        )}
      </section>
    </div>
  );
}

function ScheduleScreen({
  bookings,
  availableSlots,
  busyId,
  error,
  onBook,
  onCancel,
}: {
  bookings: ClientMiniAppBooking[];
  availableSlots: ClientMiniAppAvailableSlot[];
  busyId: string | null;
  error: string;
  onBook: (slot: ClientMiniAppAvailableSlot) => void;
  onCancel: (booking: ClientMiniAppBooking) => void;
}) {
  const sortedBookings = sortByDateTime(bookings);
  const visibleSlots = firstDayOnly(availableSlots.filter((slot) => !slot.is_booked));
  const slotsDay = visibleSlots[0]?.date;

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      {error ? (
        <div className="rounded-md border border-[rgba(255,116,57,0.28)] bg-[rgba(255,116,57,0.08)] p-2.5 text-xs text-[#ffb599]">
          {error}
        </div>
      ) : null}
      <section>
        <h2 className="mb-2 text-xs font-medium text-[var(--text-main)]">Мои записи</h2>
        <div className="space-y-2">
          {bookings.length === 0 ? (
            <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-3 text-xs text-[var(--text-muted)]">
              Активных записей нет
            </div>
          ) : (
            sortedBookings.map((booking) => (
              <ClientBookingItem
                key={booking.id}
                booking={booking}
                busy={busyId === `cancel-${booking.id}`}
                onCancel={() => onCancel(booking)}
              />
            ))
          )}
        </div>
      </section>
      <section>
        <div className="mb-2 flex items-end justify-between gap-3">
          <h2 className="text-xs font-medium text-[var(--text-main)]">Доступно для записи</h2>
          {slotsDay ? <p className="truncate text-[11px] text-[var(--accent)]">{formatDate(slotsDay)}</p> : null}
        </div>
        <div className="space-y-2">
          {visibleSlots.length === 0 ? (
            <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-3 text-xs text-[var(--text-muted)]">
              На ближайшие дни свободных занятий нет
            </div>
          ) : (
            visibleSlots.map((slot) => (
              <AvailableSlotItem
                key={slot.id}
                slot={slot}
                busy={busyId === `book-${slot.id}`}
                onBook={() => onBook(slot)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function SubscriptionScreen({ subscriptions, visits }: { subscriptions: ClientMiniAppSubscription[]; visits: ClientMiniAppVisit[] }) {
  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      <section className="space-y-2">
        {subscriptions.length === 0 ? (
          <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-4 text-center text-xs text-[var(--text-muted)]">
            Активных абонементов нет
          </div>
        ) : (
          subscriptions.map((subscription) => (
            <article key={subscription.id} className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-3">
              <h2 className="text-xs font-medium text-[var(--text-main)]">{subscriptionTitle(subscription)}</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{subscriptionMeta(subscription)}</p>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">Статус: {subscription.status}</p>
            </article>
          ))
        )}
      </section>
      <section>
        <h2 className="mb-2 text-xs font-medium text-[var(--text-main)]">Последние посещения</h2>
        <div className="space-y-2">
          {visits.length === 0 ? (
            <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-3 text-xs text-[var(--text-muted)]">
              Посещений пока нет
            </div>
          ) : (
            visits.map((visit) => <VisitItem key={visit.id} visit={visit} />)
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileScreen({ data }: { data: ClientMiniAppPayload | null }) {
  const client = data?.client;

  return (
    <div className="space-y-3 px-3 pb-3 pt-2">
      <ClientCard data={data} />
      <section className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-3">
        <div className="space-y-2.5 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-[var(--text-muted)]">Телефон</span>
            <span className="text-right text-[var(--text-main)]">{client?.phone || "Не указан"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--text-muted)]">Email</span>
            <span className="text-right text-[var(--text-main)]">{client?.email || "Не указан"}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[var(--text-muted)]">Штрихкод</span>
            <span className="text-right font-[family:var(--font-mono)] text-[var(--text-main)]">{client?.barcode || "Не указан"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ClientAuthScreen({
  mode,
  phone,
  error,
  loading,
  onPhoneChange,
  onSubmit,
}: {
  mode: AuthMode;
  phone: string;
  error: string;
  loading: boolean;
  onPhoneChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const canEnterPhone = mode === "phone";

  return (
    <main className="flex h-[100dvh] items-center bg-[var(--bg-app)] px-4 py-8 text-[var(--text-main)]">
      <section className="mx-auto w-full max-w-md rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
        <p className="font-[family:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
          HardZone
        </p>
        <h1 className="mt-2 text-xl font-medium leading-tight text-[var(--text-main)]">Вход клиента</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          {canEnterPhone
            ? "Введите телефон из вашей карточки клиента."
            : "Откройте это приложение из Telegram, чтобы мы получили защищённые данные запуска."}
        </p>

        {canEnterPhone ? (
          <form
            className="mt-5 space-y-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <input
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+7 999 000-00-00"
              className="h-12 w-full rounded-lg border border-[var(--line-soft)] bg-[rgba(255,255,255,0.04)] px-3 text-base text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-lg bg-[var(--accent)] text-sm font-medium text-[var(--text-inverse)] disabled:opacity-60"
            >
              {loading ? "Проверяем..." : "Продолжить"}
            </button>
          </form>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-[rgba(255,116,57,0.32)] bg-[rgba(255,116,57,0.10)] p-3 text-sm text-[#ffb599]">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function ClientMiniApp() {
  const [activeTab, setActiveTab] = useState<ClientTab>("home");
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [initData, setInitData] = useState("");
  const [phone, setPhone] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [data, setData] = useState<ClientMiniAppPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function authenticate() {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();

    const telegramInitData = webApp?.initData || "";
    setInitData(telegramInitData);

    if (!telegramInitData) {
      setAuthMode("telegram");
      setAuthError("Telegram не передал данные запуска. Откройте Mini App из кнопки в боте HardZone.");
      return;
    }

    try {
      const payload = await loginClientMiniApp(telegramInitData);
      setData(payload);
      setAuthMode("linked");
      setAuthError("");
    } catch (error) {
      if (error instanceof Error && error.message.includes("не привязан")) {
        setAuthMode("phone");
        setAuthError("");
        return;
      }

      setAuthMode("telegram");
      setAuthError(error instanceof Error ? error.message : "Не удалось войти через Telegram");
    }
  }

  async function linkPhone() {
    setAuthLoading(true);
    setAuthError("");

    try {
      const payload = await linkClientMiniAppPhone(initData, phone);
      setData(payload);
      setPhone("");
      setAuthMode("linked");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Не удалось привязать Telegram по телефону");
    } finally {
      setAuthLoading(false);
    }
  }

  async function bookSlot(slot: ClientMiniAppAvailableSlot) {
    setBusyId(`book-${slot.id}`);
    setActionError("");

    try {
      setData(await bookClientMiniAppSlot(initData, slot.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось записаться");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelBooking(booking: ClientMiniAppBooking) {
    setBusyId(`cancel-${booking.id}`);
    setActionError("");

    try {
      setData(await cancelClientMiniAppBooking(initData, booking.id));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось отменить запись");
    } finally {
      setBusyId(null);
    }
  }

  useEffect(() => {
    void authenticate();
  }, []);

  if (authMode === "phone" || authMode === "telegram") {
    return (
      <ClientAuthScreen
        mode={authMode}
        phone={phone}
        error={authError}
        loading={authLoading}
        onPhoneChange={setPhone}
        onSubmit={() => void linkPhone()}
      />
    );
  }

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)]">
      <AppHeader title={tabLabels[activeTab]} onRefresh={() => void authenticate()} />

      <div className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto">
        {activeTab === "home" ? <HomeScreen data={data} /> : null}
        {activeTab === "schedule" ? (
          <ScheduleScreen
            bookings={data?.bookings || []}
            availableSlots={data?.available_slots || []}
            busyId={busyId}
            error={actionError}
            onBook={(slot) => void bookSlot(slot)}
            onCancel={(booking) => void cancelBooking(booking)}
          />
        ) : null}
        {activeTab === "subscription" ? (
          <SubscriptionScreen subscriptions={data?.subscriptions || []} visits={data?.visits || []} />
        ) : null}
        {activeTab === "profile" ? <ProfileScreen data={data} /> : null}
      </div>

      <BottomNav active={activeTab} onChange={setActiveTab} />
    </main>
  );
}
