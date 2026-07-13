"use client";

import { useEffect, useMemo, useState } from "react";

import {
  attendStaffBooking,
  cancelStaffBooking,
  createStaffBooking,
  fetchStaffBookings,
  fetchStaffMe,
  fetchStaffToday,
  searchStaffClients,
  type StaffBooking,
  type StaffClientSearchResult,
  type StaffMe,
  type StaffSlot,
  type StaffSlotBookings,
  unattendStaffBooking,
} from "@/lib/api/staff";

import { waitForTelegramInitData } from "./telegram-web-app-script";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        viewportHeight?: number;
        viewportStableHeight?: number;
        ready?: () => void;
        expand?: () => void;
        onEvent?: (eventType: "viewportChanged", eventHandler: (eventData: { isStateStable?: boolean }) => void) => void;
        offEvent?: (eventType: "viewportChanged", eventHandler: (eventData: { isStateStable?: boolean }) => void) => void;
      };
    };
  }
}

type AppTab = "home" | "schedule" | "clients" | "profile";
type ScheduleMode = "list" | "detail";
type AuthMode = "checking" | "linked" | "telegram";

const tabLabels: Record<AppTab, string> = {
  home: "Главная",
  schedule: "Расписание",
  clients: "Клиенты",
  profile: "Профиль",
};

const weekDayFormatter = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("ru-RU", { month: "long" });
const longDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  weekday: "short",
});

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatTime(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2}):(\d{2})/);
  if (match) return `${match[1]}:${match[2]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Vladivostok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatShortDate(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}.${match[2]}.${match[1]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Vladivostok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return longDateFormatter.format(date);
}

function formatMonth(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return monthFormatter.format(date);
}

function normalizeColor(value: string | null | undefined) {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) return "#5EF4D8";
  return value;
}

function subscriptionLabel(
  item: Pick<
    StaffBooking | StaffClientSearchResult,
    "subscription_type" | "subscription_status" | "visits_left" | "expires_at"
  >
) {
  if (!item.subscription_type) return "Абонемент не выбран";
  if (item.subscription_type === "unlimited") {
    return item.expires_at ? `Безлимит до ${formatShortDate(item.expires_at)}` : "Безлимит";
  }
  if (item.visits_left !== null && item.visits_left !== undefined) return `Осталось ${item.visits_left}`;
  return item.subscription_status || "Абонемент";
}

function clientName(client: StaffClientSearchResult) {
  return [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(" ");
}

function slotTitle(slot: StaffSlot) {
  return slot.training_type_name || (slot.slot_type === "personal" ? "Персональное занятие" : "Занятие");
}

function slotKindLabel(slot: StaffSlot) {
  if (slot.slot_type === "personal") return "Персональное занятие";
  if (slot.is_free) return "Open Gym";
  return "Групповое занятие";
}

function tabIcon(tab: AppTab, active: boolean) {
  const stroke = active ? "currentColor" : "currentColor";
  const common = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
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
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }

  if (tab === "clients") {
    return (
      <svg {...common}>
        <path d="M16 18a4 4 0 0 0-8 0" />
        <circle cx="12" cy="9" r="3" />
        <path d="M19 18a3 3 0 0 0-2-2.8" />
        <path d="M17 7.2a2.5 2.5 0 0 1 0 4.6" />
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <p className="text-xl font-semibold leading-none text-[var(--text-main)]">{value}</p>
      <p className="mt-1.5 text-[11px] leading-none text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

function AppHeader({ title, action }: { title?: string; action?: React.ReactNode }) {
  return (
    <header className="z-20 shrink-0 bg-[rgba(8,11,16,0.9)] px-4 py-2 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3">
        <div className="h-9 w-9" />
        <div className="text-center">
          {title ? <h1 className="text-base font-semibold leading-tight text-[var(--text-main)]">{title}</h1> : null}
        </div>
        <div className="flex h-9 w-9 items-center justify-end">{action}</div>
      </div>
    </header>
  );
}

function BottomNav({ active, onChange }: { active: AppTab; onChange: (tab: AppTab) => void }) {
  const tabs: AppTab[] = ["home", "schedule", "clients", "profile"];

  return (
    <nav className="z-30 shrink-0 px-4 pb-[max(10px,env(safe-area-inset-bottom))] pt-2">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(12,15,21,0.94)] p-1 shadow-[0_14px_30px_rgba(0,0,0,0.34)] backdrop-blur">
        {tabs.map((tab) => {
          const activeTab = active === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onChange(tab)}
              className={`flex min-h-[46px] min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md px-1 text-[10px] transition [&_svg]:h-5 [&_svg]:w-5 ${
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

function TrainerCard({ staff }: { staff: StaffMe | null }) {
  const trainerName = staff?.trainer_profile
    ? `${staff.trainer_profile.first_name} ${staff.trainer_profile.last_name}`
    : staff?.user.name || "Тренер HardZone";
  const role = staff?.user.role_title || "Тренер";
  const contact = staff?.trainer_profile?.phone || staff?.trainer_profile?.email || staff?.user.username || "Telegram";

  return (
    <section className="relative overflow-hidden rounded-lg border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(135deg,#11151d_0%,#121923_100%)] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.24)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#5ef4d8,#f6d46b,#ff7a59)]" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[rgba(94,244,216,0.10)] blur-2xl" />
      <div className="relative flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.92)] text-lg font-semibold text-[var(--text-inverse)] shadow-[0_8px_20px_rgba(0,0,0,0.24)]">
          {trainerName.trim().slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-tight text-[var(--text-main)]">{trainerName}</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">HardZone · {role}</p>
          <p className="mt-2 truncate font-[family:var(--font-mono)] text-xs text-[var(--text-muted)]">{contact}</p>
        </div>
        <span className="shrink-0 rounded-full border border-[rgba(94,244,216,0.28)] bg-[rgba(94,244,216,0.10)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#9ffbed]">
          CRM
        </span>
      </div>
    </section>
  );
}

function SlotListItem({ slot, onOpen }: { slot: StaffSlot; onOpen: () => void }) {
  const confirmed = Number(slot.confirmed_count || 0);
  const attended = Number(slot.attended_count || 0);
  const capacity = Number(slot.capacity || 0);
  const color = normalizeColor(slot.training_type_color);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[88px_minmax(0,1fr)_24px] gap-3 border-b border-[var(--line-soft)] py-4 text-left active:bg-[rgba(255,255,255,0.035)]"
    >
      <div className="flex gap-3">
        <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <p className="text-lg font-medium leading-none text-[var(--text-main)]">{formatTime(slot.start_time)}</p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{slot.duration_minutes} мин</p>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold leading-tight text-[var(--text-main)]">{slotTitle(slot)}</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{slotKindLabel(slot)}</p>
        <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">{slot.trainer_name || "Тренер не назначен"}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            {confirmed}/{capacity}
          </span>
          <span className="rounded-full bg-[rgba(63,185,80,0.12)] px-2 py-0.5 text-xs text-[#9be7aa]">
            {attended} пришли
          </span>
        </div>
      </div>
      <div className="flex items-center justify-end text-2xl text-[var(--text-main)]">›</div>
    </button>
  );
}

function DateStrip({
  selectedDate,
  onSelect,
}: {
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => Array.from({ length: 10 }, (_, index) => addDays(today, index - 1)), [today]);

  return (
    <section className="border-b border-[var(--line-soft)] bg-[var(--bg-panel)] px-4 py-3">
      <div className="mx-auto max-w-md">
        <p className="mb-2 px-1 text-xs uppercase text-[var(--text-muted)]">{formatMonth(selectedDate)}</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((date) => {
            const value = toDateInputValue(date);
            const active = selectedDate === value;
            const label = value === toDateInputValue(today) ? "сегодня" : value === toDateInputValue(addDays(today, 1)) ? "завтра" : "";
            return (
              <button
                key={value}
                type="button"
                onClick={() => onSelect(value)}
                className={`h-[74px] w-[62px] shrink-0 rounded-lg border text-center transition ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--text-main)]"
                }`}
              >
                <span className="block pt-2 text-xs uppercase">{weekDayFormatter.format(date).replace(".", "")}</span>
                <span className="block text-2xl font-semibold leading-tight">{date.getDate()}</span>
                <span className={`block text-[11px] ${active ? "text-white/70" : "text-[var(--text-muted)]"}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BookingRow({
  booking,
  busy,
  onToggle,
  onCancel,
}: {
  booking: StaffBooking;
  busy: boolean;
  onToggle: () => void;
  onCancel: () => void;
}) {
  const attended = booking.status === "attended";

  return (
    <article className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[var(--text-main)]">{booking.client_name}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{subscriptionLabel(booking)}</p>
          {booking.client_phone ? <p className="mt-1 text-xs text-[var(--text-muted)]">{booking.client_phone}</p> : null}
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs ${attended ? "bg-[rgba(63,185,80,0.14)] text-[#9be7aa]" : "bg-[rgba(245,197,66,0.12)] text-[var(--warning)]"}`}>
          {attended ? "Пришел" : "Ждет"}
        </span>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className={`mt-4 h-11 w-full rounded-lg text-sm font-semibold transition disabled:opacity-60 ${
          attended
            ? "border border-[var(--line-soft)] text-[var(--text-main)]"
            : "bg-[var(--accent)] text-[var(--text-inverse)]"
        }`}
      >
        {attended ? "Снять отметку" : "Отметить пришел"}
      </button>
      {!attended ? (
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="mt-2 h-11 w-full rounded-lg border border-[rgba(255,116,57,0.35)] text-sm font-semibold text-[#ffb599] disabled:opacity-60"
        >
          Отменить запись
        </button>
      ) : null}
    </article>
  );
}

function HomeScreen({
  staff,
  slots,
  date,
  loading,
  onOpenSchedule,
  onOpenSlot,
}: {
  staff: StaffMe | null;
  slots: StaffSlot[];
  date: string;
  loading: boolean;
  onOpenSchedule: () => void;
  onOpenSlot: (slot: StaffSlot) => void;
}) {
  const totalBookings = slots.reduce(
    (sum, slot) => sum + Number(slot.confirmed_count || 0) + Number(slot.attended_count || 0),
    0
  );
  const totalAttended = slots.reduce((sum, slot) => sum + Number(slot.attended_count || 0), 0);
  const nextSlots = slots.slice(0, 3);

  return (
    <div className="space-y-4 px-4 pb-4 pt-3">
      <TrainerCard staff={staff} />

      <section className="grid grid-cols-3 gap-2">
        <Metric label="занятий" value={loading ? "..." : slots.length} />
        <Metric label="записаны" value={loading ? "..." : totalBookings} />
        <Metric label="пришли" value={loading ? "..." : totalAttended} />
      </section>

      <section className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Мои занятия</h2>
            <p className="text-xs text-[var(--text-muted)]">{date ? formatDateLabel(date) : "Сегодня"}</p>
          </div>
          <button type="button" onClick={onOpenSchedule} className="h-9 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 text-xs font-medium text-[var(--text-main)] active:bg-[rgba(255,255,255,0.08)]">
            Все
          </button>
        </div>

        {loading ? (
          <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5 text-sm text-[var(--text-muted)]">
            Загружаем занятия...
          </div>
        ) : nextSlots.length === 0 ? (
          <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5 text-center">
            <p className="font-semibold text-[var(--text-main)]">Занятий нет</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">На сегодня занятий не найдено</p>
            <button type="button" onClick={onOpenSchedule} className="mt-4 h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--text-inverse)]">
              Перейти в расписание
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {nextSlots.map((slot) => (
              <button
                key={slot.id}
                type="button"
                onClick={() => onOpenSlot(slot)}
                className="flex w-full items-center justify-between rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm text-[var(--accent)]">{formatTime(slot.start_time)}</p>
                  <p className="truncate font-semibold text-[var(--text-main)]">{slotTitle(slot)}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{slot.trainer_name || "Тренер не назначен"}</p>
                </div>
                <span className="text-2xl text-[var(--text-main)]">›</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ScheduleScreen({
  date,
  slots,
  loading,
  onDateChange,
  onOpenSlot,
}: {
  date: string;
  slots: StaffSlot[];
  loading: boolean;
  onDateChange: (date: string) => void;
  onOpenSlot: (slot: StaffSlot) => void;
}) {
  return (
    <div className="pb-4">
      <DateStrip selectedDate={date} onSelect={onDateChange} />
      <section className="mx-auto max-w-md px-4">
        {loading ? (
          <div className="py-12 text-center text-sm text-[var(--text-muted)]">Загружаем расписание...</div>
        ) : slots.length === 0 ? (
          <div className="mt-5 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-6 text-center">
            <p className="font-semibold text-[var(--text-main)]">На этот день занятий нет</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Можно выбрать другой день</p>
          </div>
        ) : (
          slots.map((slot) => <SlotListItem key={slot.id} slot={slot} onOpen={() => onOpenSlot(slot)} />)
        )}
      </section>
    </div>
  );
}

function LessonDetailsScreen({
  selected,
  busyId,
  query,
  results,
  searching,
  slotLoading,
  onBack,
  onQueryChange,
  onSearch,
  onBookClient,
  onToggleAttend,
  onCancelBooking,
}: {
  selected: StaffSlotBookings;
  busyId: string | null;
  query: string;
  results: StaffClientSearchResult[];
  searching: boolean;
  slotLoading: boolean;
  onBack: () => void;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onBookClient: (client: StaffClientSearchResult, allowUnpaid?: boolean) => void;
  onToggleAttend: (booking: StaffBooking) => void;
  onCancelBooking: (booking: StaffBooking) => void;
}) {
  const { slot, bookings } = selected;
  const bookingClientIds = new Set(bookings.map((booking) => String(booking.client_id)));
  const confirmed = Number(slot.confirmed_count || bookings.filter((booking) => booking.status === "confirmed").length);
  const attended = Number(slot.attended_count || bookings.filter((booking) => booking.status === "attended").length);
  const capacity = Number(slot.capacity || 0);
  const freePlaces = Math.max(0, capacity - confirmed - attended);

  return (
    <div className="px-4 pb-4 pt-4">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 h-10 rounded-lg border border-[var(--line-soft)] px-4 text-sm text-[var(--text-main)]"
      >
        Назад
      </button>

      <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
        <p className="text-sm text-[var(--accent)]">{formatDateLabel(String(slot.date))} · {formatTime(slot.start_time)}</p>
        <h2 className="mt-2 text-2xl font-semibold leading-tight text-[var(--text-main)]">{slotTitle(slot)}</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{slotKindLabel(slot)} · {slot.duration_minutes} мин</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{slot.trainer_name || "Тренер не назначен"}</p>
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="записаны" value={confirmed + attended} />
        <Metric label="пришли" value={attended} />
        <Metric label="места" value={freePlaces} />
      </section>

      <section className="mt-5 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
          placeholder="Имя, телефон, штрихкод"
          className="h-12 w-full rounded-lg border border-[var(--line-soft)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={searching}
          className="mt-2 h-11 w-full rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--text-inverse)] disabled:opacity-60"
        >
          {searching ? "Ищем..." : "Найти клиента"}
        </button>

        {results.length > 0 ? (
          <div className="mt-3 space-y-2">
            {results.map((client, index) => {
              const alreadyBooked = bookingClientIds.has(String(client.id));
              const eligible = client.is_eligible !== false;
              const showUnpaid = results.findIndex((item) => String(item.id) === String(client.id)) === index;
              return (
                <article key={`${client.id}-${client.subscription_id || "no-sub"}`} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
                  <p className="font-semibold text-[var(--text-main)]">{clientName(client)}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{subscriptionLabel(client)}</p>
                  {eligible ? (
                    <button
                      type="button"
                      disabled={alreadyBooked || busyId === `client-${client.id}`}
                      onClick={() => onBookClient(client)}
                      className="mt-3 h-10 w-full rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--text-inverse)] disabled:bg-[rgba(255,255,255,0.08)] disabled:text-[var(--text-muted)]"
                    >
                      {alreadyBooked ? "Уже записан" : "Записать по абонементу"}
                    </button>
                  ) : (
                    <p className="mt-2 text-xs text-[#ffb599]">Абонемент не подходит для этого занятия</p>
                  )}
                  {showUnpaid && !alreadyBooked ? (
                    <button
                      type="button"
                      disabled={busyId === `client-${client.id}`}
                      onClick={() => onBookClient(client, true)}
                      className="mt-2 h-10 w-full rounded-lg border border-[var(--line-soft)] text-sm font-semibold text-[var(--text-main)] disabled:opacity-60"
                    >
                      Записать к оплате
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--text-main)]">Клиенты</h3>
          {slotLoading ? <span className="text-xs text-[var(--text-muted)]">Обновляем...</span> : null}
        </div>
        {bookings.length === 0 ? (
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-muted)]">
            Записанных клиентов пока нет.
          </div>
        ) : (
          bookings.map((booking) => (
            <BookingRow
              key={booking.id}
              booking={booking}
              busy={busyId === booking.id}
              onToggle={() => onToggleAttend(booking)}
              onCancel={() => onCancelBooking(booking)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ClientsScreen({
  query,
  results,
  searching,
  onQueryChange,
  onSearch,
}: {
  query: string;
  results: StaffClientSearchResult[];
  searching: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="space-y-4 px-4 pb-4 pt-4">
      <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSearch();
          }}
          placeholder="Имя, телефон, штрихкод"
          className="h-12 w-full rounded-lg border border-[var(--line-soft)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={onSearch}
          disabled={searching}
          className="mt-2 h-11 w-full rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--text-inverse)] disabled:opacity-60"
        >
          {searching ? "Ищем..." : "Найти"}
        </button>
      </section>

      <section className="space-y-2">
        {results.length === 0 ? (
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-muted)]">
            Найдите клиента по имени, телефону или штрихкоду.
          </div>
        ) : (
          results.map((client) => (
            <article key={`${client.id}-${client.subscription_id || "no-sub"}`} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
              <p className="font-semibold text-[var(--text-main)]">{clientName(client)}</p>
              {client.phone ? <p className="mt-1 text-xs text-[var(--text-muted)]">{client.phone}</p> : null}
              <p className="mt-2 text-sm text-[var(--accent)]">{subscriptionLabel(client)}</p>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function ProfileScreen({ staff, onRefresh }: { staff: StaffMe | null; onRefresh: () => void }) {
  const trainerName = staff?.trainer_profile
    ? `${staff.trainer_profile.first_name} ${staff.trainer_profile.last_name}`
    : staff?.user.name || "Тренер HardZone";

  return (
    <div className="space-y-4 px-4 pb-4 pt-4">
      <TrainerCard staff={staff} />
      <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
        <h2 className="text-lg font-semibold text-[var(--text-main)]">{trainerName}</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-3 border-b border-[var(--line-soft)] pb-2">
            <span className="text-[var(--text-muted)]">Роль</span>
            <span className="text-right text-[var(--text-main)]">{staff?.user.role_title || staff?.user.role || "Тренер"}</span>
          </div>
          <div className="flex justify-between gap-3 border-b border-[var(--line-soft)] pb-2">
            <span className="text-[var(--text-muted)]">Телефон</span>
            <span className="text-right text-[var(--text-main)]">{staff?.trainer_profile?.phone || "Не указан"}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--text-muted)]">Telegram</span>
            <span className="text-right text-[var(--success)]">Привязан</span>
          </div>
        </div>
      </section>
      <button
        type="button"
        onClick={onRefresh}
        className="h-12 w-full rounded-lg border border-[var(--line-soft)] text-sm font-semibold text-[var(--text-main)]"
      >
        Обновить данные
      </button>
    </div>
  );
}

function TelegramAuthScreen({ error }: { error: string }) {
  return (
    <main className="flex min-h-screen items-center bg-[var(--bg-app)] px-4 py-8 text-[var(--text-main)]">
      <section className="mx-auto w-full max-w-md rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-5 shadow-[0_18px_42px_rgba(0,0,0,0.32)]">
        <div className="mb-6">
          <p className="font-[family:var(--font-mono)] text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">
            HardZone
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-[var(--text-main)]">Вход тренера</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Для безопасного входа вернитесь в чат-бот HardZone, нажмите /start и подтвердите свой номер кнопкой «Поделиться телефоном».
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-[rgba(255,116,57,0.32)] bg-[rgba(255,116,57,0.10)] p-3 text-sm text-[#ffb599]">
            {error}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function TrainerMiniApp() {
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("list");
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [slots, setSlots] = useState<StaffSlot[]>([]);
  const [selected, setSelected] = useState<StaffSlotBookings | null>(null);
  const [query, setQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [results, setResults] = useState<StaffClientSearchResult[]>([]);
  const [clientResults, setClientResults] = useState<StaffClientSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [clientSearching, setClientSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [authError, setAuthError] = useState("");

  const selectedSlotId = selected?.slot.id ?? null;

  async function authenticateTelegram() {
    const initData = await waitForTelegramInitData();

    const webApp = window.Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();

    if (!initData) {
      const sessionResponse = await fetch("/auth-api/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (sessionResponse.ok) {
        setAuthMode("linked");
        return true;
      }

      setAuthMode("telegram");
      setAuthError("Telegram не передал данные запуска. Откройте Mini App из кнопки в боте HardZone.");
      return false;
    }

    const response = await fetch("/auth-api/telegram-miniapp-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ init_data: initData }),
    });

    if (response.ok) {
      setAuthMode("linked");
      return true;
    }

    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    if (response.status === 403) {
      setAuthMode("telegram");
      setAuthError("Telegram ещё не привязан к сотруднику HardZone.");
      return false;
    }

    setAuthMode("telegram");
    setAuthError(data?.error || "Не удалось войти через Telegram");
    return false;
  }

  async function loadStaff() {
    setStaff(await fetchStaffMe());
  }

  async function loadSchedule(nextDate = date) {
    setLoading(true);
    setError("");
    try {
      const data = await fetchStaffToday(nextDate);
      setDate(data.date);
      setSlots(data.slots);
      setSelected(null);
      setScheduleMode("list");
      setQuery("");
      setResults([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить расписание");
    } finally {
      setLoading(false);
    }
  }

  async function openSlot(slot: StaffSlot) {
    setActiveTab("schedule");
    setScheduleMode("detail");
    setSlotLoading(true);
    setError("");
    setResults([]);
    setQuery("");
    try {
      setSelected(await fetchStaffBookings(slot.id));
    } catch (loadError) {
      setScheduleMode("list");
      setError(loadError instanceof Error ? loadError.message : "Не удалось открыть занятие");
    } finally {
      setSlotLoading(false);
    }
  }

  async function refreshSelected() {
    if (!selectedSlotId) return;
    setSelected(await fetchStaffBookings(selectedSlotId));
  }

  async function toggleAttend(booking: StaffBooking) {
    setBusyId(booking.id);
    setError("");
    try {
      const nextSelected = booking.status === "attended"
        ? await unattendStaffBooking(booking.id)
        : await attendStaffBooking(booking.id);
      setSelected(nextSelected);
      await loadSchedule(date);
      setScheduleMode("detail");
      setSelected(nextSelected);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось изменить посещение");
      await refreshSelected();
    } finally {
      setBusyId(null);
    }
  }

  async function runSearch() {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    setError("");
    try {
      setResults(await searchStaffClients(query.trim(), selectedSlotId || undefined));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Не удалось найти клиента");
    } finally {
      setSearching(false);
    }
  }

  async function runClientSearch() {
    if (clientQuery.trim().length < 2) {
      setClientResults([]);
      return;
    }

    setClientSearching(true);
    setError("");
    try {
      setClientResults(await searchStaffClients(clientQuery.trim()));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Не удалось найти клиента");
    } finally {
      setClientSearching(false);
    }
  }

  async function bookClient(client: StaffClientSearchResult, allowUnpaid = false) {
    if (!selectedSlotId) return;
    setBusyId(`client-${client.id}`);
    setError("");
    try {
      const nextSelected = await createStaffBooking({
        slot_id: selectedSlotId,
        client_id: client.id,
        subscription_id: allowUnpaid ? null : client.subscription_id || null,
        allow_unpaid: allowUnpaid,
        unpaid_reason: allowUnpaid ? "manual_without_subscription" : undefined,
      });
      setSelected(nextSelected);
      setQuery("");
      setResults([]);
      await loadSchedule(date);
      setScheduleMode("detail");
      setSelected(nextSelected);
    } catch (bookError) {
      setError(bookError instanceof Error ? bookError.message : "Не удалось записать клиента");
      await refreshSelected();
    } finally {
      setBusyId(null);
    }
  }

  async function cancelClientBooking(booking: StaffBooking) {
    if (!window.confirm(`Отменить запись клиента ${booking.client_name}?`)) return;

    setBusyId(booking.id);
    setError("");
    try {
      const nextSelected = await cancelStaffBooking(booking.id);
      setSelected(nextSelected);
      await loadSchedule(date);
      setScheduleMode("detail");
      setSelected(nextSelected);
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Не удалось отменить запись");
      await refreshSelected();
    } finally {
      setBusyId(null);
    }
  }

  function changeTab(tab: AppTab) {
    setActiveTab(tab);
    if (tab !== "schedule") {
      setScheduleMode("list");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        const authenticated = await authenticateTelegram();
        if (!authenticated || cancelled) {
          if (!cancelled) {
            setLoading(false);
          }
          return;
        }

        await Promise.all([loadStaff(), loadSchedule(date)]);
      } catch (initError) {
        if (!cancelled) {
          setError(initError instanceof Error ? initError.message : "Не удалось открыть Telegram Mini App");
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = activeTab === "schedule" && scheduleMode === "detail"
    ? "Занятие"
    : tabLabels[activeTab];

  if (authMode === "telegram") {
    return <TelegramAuthScreen error={authError} />;
  }

  return (
    <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)]">
      <AppHeader
        title={title}
        action={
          <button
            type="button"
            onClick={() => void Promise.all([loadStaff(), loadSchedule(date)])}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-sm text-[var(--text-main)]"
            aria-label="Обновить"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 11a8 8 0 1 0-2.3 5.7" />
              <path d="M20 5v6h-6" />
            </svg>
          </button>
        }
      />

      <div className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto">
        {error ? (
          <div className="mx-4 mt-4 rounded-lg border border-[rgba(255,116,57,0.32)] bg-[rgba(255,116,57,0.10)] p-3 text-sm text-[#ffb599]">
            {error}
          </div>
        ) : null}

        {activeTab === "home" ? (
          <HomeScreen
            staff={staff}
            slots={slots}
            date={date}
            loading={loading}
            onOpenSchedule={() => setActiveTab("schedule")}
            onOpenSlot={openSlot}
          />
        ) : null}

        {activeTab === "schedule" && scheduleMode === "list" ? (
          <ScheduleScreen
            date={date}
            slots={slots}
            loading={loading}
            onDateChange={(nextDate) => void loadSchedule(nextDate)}
            onOpenSlot={openSlot}
          />
        ) : null}

        {activeTab === "schedule" && scheduleMode === "detail" && selected ? (
          <LessonDetailsScreen
            selected={selected}
            busyId={busyId}
            query={query}
            results={results}
            searching={searching}
            slotLoading={slotLoading}
            onBack={() => setScheduleMode("list")}
            onQueryChange={setQuery}
            onSearch={() => void runSearch()}
            onBookClient={(client, allowUnpaid) => void bookClient(client, allowUnpaid)}
            onToggleAttend={(booking) => void toggleAttend(booking)}
            onCancelBooking={(booking) => void cancelClientBooking(booking)}
          />
        ) : null}

        {activeTab === "clients" ? (
          <ClientsScreen
            query={clientQuery}
            results={clientResults}
            searching={clientSearching}
            onQueryChange={setClientQuery}
            onSearch={() => void runClientSearch()}
          />
        ) : null}

        {activeTab === "profile" ? (
          <ProfileScreen staff={staff} onRefresh={() => void loadStaff()} />
        ) : null}
      </div>

      <BottomNav active={activeTab} onChange={changeTab} />
    </main>
  );
}
