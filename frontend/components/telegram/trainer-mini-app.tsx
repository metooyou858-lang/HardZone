"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import {
  attendStaffBooking,
  cancelStaffBooking,
  cancelStaffSlot,
  createStaffSlot,
  createStaffBooking,
  fetchStaffBookings,
  fetchStaffMe,
  fetchStaffScheduleOptions,
  fetchStaffToday,
  searchStaffClients,
  type StaffBooking,
  type StaffClientSearchResult,
  type StaffMe,
  type StaffScheduleOptions,
  type StaffSlot,
  type StaffSlotInput,
  type StaffSlotBookings,
  unattendStaffBooking,
  updateStaffSlot,
} from "@/lib/api/staff";

import { waitForTelegramInitData } from "./telegram-web-app-script";
import type { IScannerControls } from "@zxing/browser";
import { getBannerClass, formatMoney, type BannerState } from "@/components/sales/sales-shared";
import { useSalesCatalog } from "@/components/sales/use-sales-catalog";
import { useSalesOrder } from "@/components/sales/use-sales-order";
import { findByBarcode, type Product } from "@/lib/api/products";
import { fetchClient, type ClientListItem } from "@/lib/api/clients";
import { attachEligibleSubscriptionToBooking } from "@/lib/api/schedule";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        viewportHeight?: number;
        viewportStableHeight?: number;
        ready?: () => void;
        expand?: () => void;
        disableVerticalSwipes?: () => void;
        onEvent?: (eventType: "viewportChanged", eventHandler: (eventData: { isStateStable?: boolean }) => void) => void;
        offEvent?: (eventType: "viewportChanged", eventHandler: (eventData: { isStateStable?: boolean }) => void) => void;
      };
    };
  }
}

type AppTab = "home" | "schedule" | "sales" | "profile";
type ScheduleMode = "list" | "detail" | "editor";
type AuthMode = "checking" | "linked" | "telegram";
type SlotEditorMode = "create" | "edit";

type SlotEditorState = {
  mode: SlotEditorMode;
  slotId: string | null;
  draft: StaffSlotInput;
};

function getTelegramStableViewportHeight() {
  if (typeof window === "undefined") return null;
  const webApp = window.Telegram?.WebApp;
  return webApp?.viewportStableHeight || webApp?.viewportHeight || window.innerHeight;
}

function useTelegramStableViewportHeight() {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    const applyHeight = () => setHeight(getTelegramStableViewportHeight());
    const handleViewportChange = (eventData: { isStateStable?: boolean }) => {
      if (eventData.isStateStable) applyHeight();
    };

    applyHeight();
    webApp?.onEvent?.("viewportChanged", handleViewportChange);
    return () => webApp?.offEvent?.("viewportChanged", handleViewportChange);
  }, []);

  return height;
}

function useLockedMiniAppBody() {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, []);
}

function usePreventMiniAppRubberBand(scrollRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scrollRoot = scrollRef.current;
    if (!scrollRoot) return;
    const root = scrollRoot;
    let startY = 0;

    function findScrollableElement(target: EventTarget | null) {
      let element = target instanceof HTMLElement ? target : null;
      while (element && root.contains(element)) {
        const style = window.getComputedStyle(element);
        if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) return element;
        element = element.parentElement;
      }
      return root;
    }

    function handleTouchStart(event: TouchEvent) {
      startY = event.touches[0]?.clientY || 0;
    }

    function handleTouchMove(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      const deltaY = (event.touches[0]?.clientY || 0) - startY;
      const scrollable = findScrollableElement(event.target);
      if (scrollable.scrollHeight <= scrollable.clientHeight) {
        event.preventDefault();
        return;
      }
      const atTop = scrollable.scrollTop <= 0;
      const atBottom = Math.ceil(scrollable.scrollTop + scrollable.clientHeight) >= scrollable.scrollHeight;
      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) event.preventDefault();
    }

    root.addEventListener("touchstart", handleTouchStart, { passive: true });
    root.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      root.removeEventListener("touchstart", handleTouchStart);
      root.removeEventListener("touchmove", handleTouchMove);
    };
  });
}

const tabLabels: Record<AppTab, string> = {
  home: "Главная",
  schedule: "Расписание",
  sales: "Продажа",
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
  const dateKey = String(value || "").slice(0, 10);
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return longDateFormatter.format(date);
}

function formatMonth(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return monthFormatter.format(date);
}

function slotToEditorDraft(slot: StaffSlot): StaffSlotInput {
  return {
    slot_type: slot.slot_type || "group",
    training_type_id: slot.training_type_id ? String(slot.training_type_id) : null,
    trainer_id: slot.trainer_id ? String(slot.trainer_id) : null,
    date: String(slot.date || "").slice(0, 10),
    start_time: formatTime(slot.start_time),
    duration_minutes: Number(slot.duration_minutes || 60),
    capacity: Number(slot.capacity || 20),
    is_free: Boolean(slot.is_free),
    comment: slot.comment || null,
  };
}

function createEmptySlotDraft(date: string, slotType = "group"): StaffSlotInput {
  return {
    slot_type: slotType,
    training_type_id: null,
    trainer_id: null,
    date,
    start_time: "09:00",
    duration_minutes: 60,
    capacity: slotType === "personal" ? 1 : 20,
    is_free: false,
    comment: null,
  };
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

  if (tab === "sales") {
    return (
      <svg {...common}>
        <path d="M4 6h2l1.5 9h9l2-6H7" />
        <circle cx="9" cy="19" r="1" />
        <circle cx="17" cy="19" r="1" />
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
  const tabs: AppTab[] = ["home", "schedule", "sales", "profile"];

  return (
    <nav className="z-30 shrink-0 border-t border-[rgba(255,255,255,0.08)] bg-[rgba(8,11,16,0.96)] px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const activeTab = active === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onChange(tab)}
              className={`flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium transition [&_svg]:h-[22px] [&_svg]:w-[22px] ${
                activeTab
                  ? "bg-[rgba(94,244,216,0.12)] text-[var(--text-main)]"
                  : "text-[var(--text-muted)] active:bg-[rgba(255,255,255,0.04)]"
              }`}
            >
              {tabIcon(tab, activeTab)}
              <span className="block whitespace-nowrap text-center leading-none">{tabLabels[tab]}</span>
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
  const occupied = Number(slot.occupied_count ?? slot.booked_count ?? 0);
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
            {occupied}/{capacity}
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
  onResolvePayment,
}: {
  booking: StaffBooking;
  busy: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onResolvePayment: () => void;
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
      {booking.coverage_status === "unpaid" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onResolvePayment}
          className="mt-2 h-11 w-full rounded-lg border border-[rgba(248,191,0,0.4)] bg-[rgba(248,191,0,0.12)] text-sm font-semibold text-[#f8bf00] disabled:opacity-60"
        >
          Перейти к оплате
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
  const trainerId = staff?.trainer_profile?.id ? String(staff.trainer_profile.id) : null;
  const mySlots = trainerId ? slots.filter((slot) => String(slot.trainer_id || "") === trainerId) : [];
  const totalBookings = mySlots.reduce(
    (sum, slot) => sum + Number(slot.confirmed_count || 0) + Number(slot.attended_count || 0),
    0
  );
  const totalAttended = mySlots.reduce((sum, slot) => sum + Number(slot.attended_count || 0), 0);

  return (
    <div className="space-y-4 px-4 pb-4 pt-3">
      <TrainerCard staff={staff} />

      <section className="grid grid-cols-3 gap-2">
        <Metric label="занятий" value={loading ? "..." : mySlots.length} />
        <Metric label="записаны" value={loading ? "..." : totalBookings} />
        <Metric label="пришли" value={loading ? "..." : totalAttended} />
      </section>

      <section className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.025)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-main)]">Мои занятия сегодня</h2>
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
        ) : mySlots.length === 0 ? (
          <div className="rounded-md border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] p-5 text-center">
            <p className="font-semibold text-[var(--text-main)]">Занятий нет</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{trainerId ? "На сегодня у вас занятий не найдено" : "Карточка сотрудника не связана с тренером"}</p>
            <button type="button" onClick={onOpenSchedule} className="mt-4 h-11 rounded-md bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--text-inverse)]">
              Перейти в расписание
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {mySlots.map((slot) => (
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
  canCreate,
  onCreate,
}: {
  date: string;
  slots: StaffSlot[];
  loading: boolean;
  onDateChange: (date: string) => void;
  onOpenSlot: (slot: StaffSlot) => void;
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="pb-4">
      <DateStrip selectedDate={date} onSelect={onDateChange} />
      <section className="mx-auto max-w-md px-4">
        {canCreate ? (
          <button type="button" onClick={onCreate} className="mt-4 h-12 w-full rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--text-inverse)]">
            + Добавить тренировку
          </button>
        ) : null}
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

function SlotEditor({
  editor,
  options,
  saving,
  canEditGroups,
  canEditPersonal,
  onChange,
  onCancel,
  onSave,
}: {
  editor: SlotEditorState;
  options: StaffScheduleOptions;
  saving: boolean;
  canEditGroups: boolean;
  canEditPersonal: boolean;
  onChange: (draft: StaffSlotInput) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { draft } = editor;
  const trainingTypes = options.training_types.filter((item) => item.slot_type === draft.slot_type);
  const fieldClass = "mt-1 h-12 w-full rounded-lg border border-[var(--line-soft)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]";

  function patch(next: Partial<StaffSlotInput>) {
    onChange({ ...draft, ...next });
  }

  return (
    <div className="space-y-4 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onCancel} className="h-10 rounded-lg border border-[var(--line-soft)] px-4 text-sm text-[var(--text-main)]">
          Назад
        </button>
        <h2 className="text-lg font-semibold text-[var(--text-main)]">{editor.mode === "create" ? "Новая тренировка" : "Редактирование"}</h2>
      </div>

      <section className="space-y-4 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
        <label className="block text-xs text-[var(--text-muted)]">
          Формат
          <select
            value={draft.slot_type}
            onChange={(event) => {
              const slotType = event.target.value;
              patch({ slot_type: slotType, training_type_id: null, capacity: slotType === "personal" ? 1 : draft.capacity });
            }}
            className={fieldClass}
          >
            {canEditGroups ? <option value="group">Групповая</option> : null}
            {canEditPersonal ? <option value="personal">Персональная</option> : null}
            {canEditGroups ? <option value="rental">Аренда зала</option> : null}
          </select>
        </label>

        <label className="block text-xs text-[var(--text-muted)]">
          Вид тренировки
          <select value={draft.training_type_id || ""} onChange={(event) => patch({ training_type_id: event.target.value || null })} className={fieldClass}>
            <option value="">Не выбран</option>
            {trainingTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <label className="block text-xs text-[var(--text-muted)]">
          Тренер
          <select value={draft.trainer_id || ""} onChange={(event) => patch({ trainer_id: event.target.value || null })} className={fieldClass}>
            <option value="">Не назначен</option>
            {options.trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.last_name} {trainer.first_name}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-[var(--text-muted)]">Дата<input type="date" value={draft.date} onChange={(event) => patch({ date: event.target.value })} className={fieldClass} /></label>
          <label className="block text-xs text-[var(--text-muted)]">Время<input type="time" value={draft.start_time} onChange={(event) => patch({ start_time: event.target.value })} className={fieldClass} /></label>
          <label className="block text-xs text-[var(--text-muted)]">Длительность, мин<input type="number" min="15" max="480" step="5" value={draft.duration_minutes} onChange={(event) => patch({ duration_minutes: Number(event.target.value) })} className={fieldClass} /></label>
          <label className="block text-xs text-[var(--text-muted)]">Количество мест<input type="number" min="1" max="200" value={draft.capacity} onChange={(event) => patch({ capacity: Number(event.target.value) })} className={fieldClass} /></label>
        </div>

        <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-[var(--line-soft)] px-3 text-sm text-[var(--text-main)]">
          Бесплатное занятие
          <input type="checkbox" checked={draft.is_free} onChange={(event) => patch({ is_free: event.target.checked })} className="h-5 w-5 accent-[var(--accent)]" />
        </label>

        <label className="block text-xs text-[var(--text-muted)]">
          Комментарий
          <textarea value={draft.comment || ""} onChange={(event) => patch({ comment: event.target.value || null })} rows={3} className="mt-1 w-full rounded-lg border border-[var(--line-soft)] bg-[rgba(255,255,255,0.04)] p-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]" />
        </label>
      </section>

      <button type="button" disabled={saving || !draft.date || !draft.start_time} onClick={onSave} className="h-12 w-full rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--text-inverse)] disabled:opacity-50">
        {saving ? "Сохраняем..." : editor.mode === "create" ? "Добавить в расписание" : "Сохранить изменения"}
      </button>
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
  onScan,
  onBookClient,
  onToggleAttend,
  onCancelBooking,
  onResolvePayment,
  canEdit,
  onEdit,
  canCancel,
  onCancelSlot,
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
  onScan: () => void;
  onBookClient: (client: StaffClientSearchResult, allowUnpaid?: boolean) => void;
  onToggleAttend: (booking: StaffBooking) => void;
  onCancelBooking: (booking: StaffBooking) => void;
  onResolvePayment: (booking: StaffBooking) => void;
  canEdit: boolean;
  onEdit: () => void;
  canCancel: boolean;
  onCancelSlot: () => void;
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
        {canEdit ? (
          <button type="button" onClick={onEdit} className="mt-4 h-11 w-full rounded-lg border border-[var(--line-soft)] text-sm font-semibold text-[var(--text-main)]">
            Редактировать тренировку
          </button>
        ) : null}
        {canCancel ? (
          <button type="button" onClick={onCancelSlot} className="mt-2 h-11 w-full rounded-lg border border-[rgba(255,116,57,0.38)] text-sm font-semibold text-[#ffb599]">
            Удалить тренировку
          </button>
        ) : null}
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
        <button
          type="button"
          onClick={onScan}
          disabled={searching}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--line-soft)] text-sm font-semibold text-[var(--text-main)] disabled:opacity-60"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 9v6M10 9v6M14 9v6M17 9v6" />
          </svg>
          Сканировать штрихкод
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
              onResolvePayment={() => onResolvePayment(booking)}
            />
          ))
        )}
      </section>
    </div>
  );
}

async function requestCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Камера недоступна в этой версии Telegram");
  }

  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
}

function BarcodeScanner({ stream, onDetected, onClose }: { stream: MediaStream; onDetected: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const [scannerError, setScannerError] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
    onCloseRef.current = onClose;
  }, [onClose, onDetected]);

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let cancelled = false;

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromStream(
          stream,
          videoRef.current,
          (result, _error, activeControls) => {
            const value = result?.getText().trim();
            if (!value) return;
            activeControls.stop();
            onDetectedRef.current(value);
          }
        );
      } catch (error) {
        if (!cancelled) {
          setScannerError(error instanceof Error ? error.message : "Не удалось открыть камеру");
        }
      }
    }

    void startScanner();
    return () => {
      cancelled = true;
      controls?.stop();
      stream.getTracks().forEach((track) => track.stop());
    };
  }, [stream]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 pb-3 pt-[max(16px,env(safe-area-inset-top))]">
        <div>
          <h2 className="text-lg font-semibold">Сканирование штрихкода</h2>
          <p className="mt-1 text-xs text-white/65">Наведите камеру на штрихкод карты</p>
        </div>
        <button type="button" onClick={() => onCloseRef.current()} className="h-10 rounded-lg border border-white/20 px-4 text-sm font-semibold">
          Закрыть
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[linear-gradient(to_bottom,rgba(0,0,0,.42),transparent_25%,transparent_75%,rgba(0,0,0,.42))]">
          <div className="h-36 w-[84%] rounded-xl border-2 border-[var(--accent)] shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
        </div>
        {scannerError ? (
          <div className="absolute inset-x-4 bottom-6 rounded-lg bg-[#2a1111] p-4 text-sm text-[#ffb599]">
            Не удалось запустить камеру. Разрешите Telegram доступ к камере и попробуйте снова.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SalesScreen({ modules, initialClientId }: { modules: string[]; initialClientId: string | null }) {
  const [banner, setBanner] = useState<BannerState>(null);
  const [scannerMode, setScannerMode] = useState<{ type: "product" } | { type: "marking"; lineKey: string } | null>(null);
  const canCreateSales = modules.includes("sales_create");
  const canPaySales = modules.includes("sales_pay");
  const canRecoverSalesAqsi = modules.includes("sales_aqsi_recovery");
  const catalogApi = useSalesCatalog({ enabled: true, setBanner });
  const orderApi = useSalesOrder({
    cashViewActive: true,
    canCreateSales,
    canPaySales,
    canRecoverSalesAqsi,
    setBanner,
    onHistoryChanged: catalogApi.reloadCatalog,
  });
  const [scanBusy, setScanBusy] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!initialClientId) return;

    fetchClient(initialClientId)
      .then((client) => orderApi.setSelectedClient(client as unknown as ClientListItem))
      .catch((loadError) => {
        setBanner({ tone: "error", text: loadError instanceof Error ? loadError.message : "Не удалось выбрать клиента" });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialClientId]);

  async function openScanner(mode: { type: "product" } | { type: "marking"; lineKey: string }) {
    try {
      const stream = await requestCameraStream();
      setScannerMode(mode);
      setCameraStream(stream);
    } catch (cameraError) {
      setBanner({ tone: "error", text: cameraError instanceof Error ? cameraError.message : "Не удалось открыть камеру" });
    }
  }

  async function addProduct(product: Product) {
    if (!canCreateSales || orderApi.orderLocked) return;
    await orderApi.addCatalogProduct(product);
  }

  async function handleScannedValue(value: string) {
    const mode = scannerMode;
    setScannerMode(null);
    if (!mode) return;
    if (mode.type === "marking") {
      orderApi.setMarkingDraftValue(mode.lineKey, value);
      setBanner({ tone: "success", text: "Код маркировки считан" });
      return;
    }

    setScanBusy(true);
    setBanner(null);
    try {
      const product = await findByBarcode(value);
      await addProduct(product);
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : "Товар не найден" });
    } finally {
      setScanBusy(false);
    }
  }

  if (!modules.includes("sales")) {
    return <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">Нет доступа к продажам.</div>;
  }

  return (
    <div className="space-y-4 px-4 pb-5 pt-4">
      {banner ? <div className={`rounded-lg border p-3 text-sm ${getBannerClass(banner.tone)}`}>{banner.text}</div> : null}

      {!canCreateSales || !canPaySales ? (
        <div className="rounded-lg border border-[rgba(255,160,0,0.3)] bg-[rgba(255,160,0,0.08)] p-3 text-sm text-[var(--warning)]">
          Для полной продажи нужны права «Создание продаж» и «Оплата продаж».
        </div>
      ) : null}

      <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3">
        <div className="flex gap-2">
          <input
            value={catalogApi.query}
            onChange={(event) => catalogApi.setQuery(event.target.value)}
            placeholder="Название, артикул, штрихкод"
            className="h-11 min-w-0 flex-1 rounded-lg border border-[var(--line-soft)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => void openScanner({ type: "product" })}
            disabled={!canCreateSales || scanBusy || orderApi.orderLocked}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--line-soft)] text-[var(--text-main)] disabled:opacity-40"
            aria-label="Сканировать товар"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 9v6M10 9v6M14 9v6M17 9v6" />
            </svg>
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {catalogApi.catalogGroups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => { catalogApi.setQuery(""); catalogApi.setSelectedCatalogGroup(group.id); }}
              className={`h-9 shrink-0 rounded-full px-3 text-xs ${catalogApi.selectedCatalogGroup === group.id && !catalogApi.query ? "bg-[var(--accent)] text-[var(--text-inverse)]" : "border border-[var(--line-soft)] text-[var(--text-muted)]"}`}
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {catalogApi.catalogLoading ? <p className="col-span-2 py-5 text-center text-sm text-[var(--text-muted)]">Загружаем товары...</p> : null}
          {!catalogApi.catalogLoading && catalogApi.catalog.length === 0 ? <p className="col-span-2 py-5 text-center text-sm text-[var(--text-muted)]">Товары не найдены</p> : null}
          {catalogApi.catalog.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => void addProduct(product)}
              disabled={!canCreateSales || orderApi.orderLocked || (product.has_stock && product.stock <= 0)}
              className="min-h-24 rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-3 text-left disabled:opacity-40"
            >
              <p className="line-clamp-2 text-sm font-semibold text-[var(--text-main)]">{product.name}</p>
              <p className="mt-2 text-sm text-[var(--accent)]">{formatMoney(product.sale_price || 0)}</p>
              {product.has_stock ? <p className="mt-1 text-[10px] text-[var(--text-muted)]">Остаток: {product.stock}</p> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-panel)] p-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-[var(--text-main)]">Корзина</h2>
          <span className="text-xs text-[var(--text-muted)]">{orderApi.basketLines.reduce((sum, line) => sum + line.quantity, 0)} шт.</span>
        </div>
        {orderApi.basketLines.length === 0 ? <p className="py-6 text-center text-sm text-[var(--text-muted)]">Добавьте товар</p> : null}
        <div className="mt-2 space-y-2">
          {orderApi.basketLines.map((line) => (
            <article key={line.key} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
              <div className="flex justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--text-main)]">{line.name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{formatMoney(line.salePrice)} × {line.quantity}</p></div>
                <p className="shrink-0 text-sm font-semibold text-[var(--text-main)]">{formatMoney(line.total)}</p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={() => void orderApi.decrementLine(line)} disabled={orderApi.orderLocked} className="h-9 w-10 rounded-lg border border-[var(--line-soft)]">−</button>
                <span className="min-w-8 text-center text-sm">{line.quantity}</span>
                <button type="button" onClick={() => void orderApi.incrementLine(line)} disabled={orderApi.orderLocked} className="h-9 w-10 rounded-lg border border-[var(--line-soft)]">+</button>
                <button type="button" onClick={() => void orderApi.removeLine(line)} disabled={orderApi.orderLocked} className="ml-auto h-9 px-3 text-xs text-[#ffb599]">Удалить</button>
              </div>
              {line.markingRequired ? (
                <button type="button" onClick={() => void openScanner({ type: "marking", lineKey: line.key })} disabled={orderApi.orderLocked} className={`mt-2 h-10 w-full rounded-lg border text-xs font-semibold ${orderApi.markingDrafts[line.key] ? "border-[rgba(63,185,80,0.35)] text-[var(--success)]" : "border-[rgba(255,160,0,0.35)] text-[var(--warning)]"}`}>
                  {orderApi.markingDrafts[line.key] ? "Маркировка считана ✓" : "Сканировать маркировку"}
                </button>
              ) : null}
            </article>
          ))}
        </div>

        {orderApi.serviceRequiresClient ? (
          <div className="mt-3 rounded-lg border border-[var(--line-soft)] p-3">
            <p className="mb-2 text-xs text-[var(--text-muted)]">Клиент для услуги</p>
            {orderApi.selectedClient ? (
              <div className="flex items-center justify-between gap-2"><span className="text-sm">{clientName(orderApi.selectedClient)}</span><button type="button" onClick={() => orderApi.setSelectedClient(null)} className="text-xs text-[#ffb599]">Сменить</button></div>
            ) : (
              <>
                <input value={orderApi.clientQuery} onChange={(event) => orderApi.setClientQuery(event.target.value)} onKeyDown={orderApi.handleClientSearchKeyDown} placeholder="Введите клиента и нажмите Enter" className="h-10 w-full rounded-lg border border-[var(--line-soft)] bg-transparent px-3 text-sm outline-none" />
                <div className="mt-2 space-y-1">{orderApi.clientResults.map((client) => <button key={client.id} type="button" onClick={() => void orderApi.applyClientSelection(client)} className="w-full rounded-lg border border-[var(--line-soft)] p-2 text-left text-sm">{clientName(client)}</button>)}</div>
              </>
            )}
          </div>
        ) : null}

        <div className="mt-4 flex items-end justify-between"><span className="text-xs uppercase tracking-wider text-[var(--text-muted)]">Итого</span><span className="text-2xl font-semibold text-[var(--text-main)]">{formatMoney(orderApi.order?.total_amount || 0)}</span></div>
        {orderApi.paymentBusy ? <div className="mt-3 rounded-lg bg-[rgba(94,244,216,0.08)] p-3 text-center text-sm text-[var(--accent)]">Ожидаем операцию на кассе...</div> : null}
        <button type="button" onClick={() => void orderApi.handleInitiatePayment()} disabled={!canPaySales || orderApi.orderLocked || orderApi.basketLines.length === 0 || orderApi.sendBlockedByClient || orderApi.sendBlockedByMarking} className="mt-3 h-12 w-full rounded-lg bg-[var(--accent)] text-sm font-semibold text-[var(--text-inverse)] disabled:opacity-40">Оплата картой</button>
        <button type="button" onClick={() => { if (window.confirm("Подтвердить оплату наличными и отправить чек на кассу?")) void orderApi.handleConfirmCash(); }} disabled={!canPaySales || orderApi.orderLocked || orderApi.basketLines.length === 0 || orderApi.sendBlockedByClient || orderApi.sendBlockedByMarking} className="mt-2 h-11 w-full rounded-lg border border-[var(--line-soft)] text-sm font-semibold disabled:opacity-40">Оплата наличными</button>
        {orderApi.receiptError && canRecoverSalesAqsi ? <button type="button" onClick={() => void orderApi.handleSyncV4()} className="mt-2 h-11 w-full rounded-lg border border-[var(--warning)] text-sm text-[var(--warning)]">Восстановить фискализацию</button> : null}
      </section>

      {scannerMode && cameraStream ? <BarcodeScanner stream={cameraStream} onClose={() => { setScannerMode(null); setCameraStream(null); }} onDetected={(value) => { setCameraStream(null); void handleScannedValue(value); }} /> : null}
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
  const viewportHeight = useTelegramStableViewportHeight();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("list");
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [date, setDate] = useState(toDateInputValue(new Date()));
  const [slots, setSlots] = useState<StaffSlot[]>([]);
  const [selected, setSelected] = useState<StaffSlotBookings | null>(null);
  const [scheduleOptions, setScheduleOptions] = useState<StaffScheduleOptions>({ training_types: [], trainers: [] });
  const [slotEditor, setSlotEditor] = useState<SlotEditorState | null>(null);
  const [slotSaving, setSlotSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffClientSearchResult[]>([]);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [salesClientId, setSalesClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("checking");
  const [authError, setAuthError] = useState("");

  const selectedSlotId = selected?.slot.id ?? null;
  const modules = staff?.user.modules || [];
  const canEditGroups = modules.includes("schedule_edit_groups");
  const canEditPersonal = modules.includes("schedule_edit_personal");
  const canCreateSlot = canEditGroups || canEditPersonal;
  const canCancelSlot = modules.includes("schedule_cancel");

  useLockedMiniAppBody();
  usePreventMiniAppRubberBand(scrollRef);

  function canEditSlot(slot: StaffSlot | null | undefined) {
    if (!slot) return false;
    return slot.slot_type === "personal" ? canEditPersonal : canEditGroups;
  }

  async function authenticateTelegram() {
    const initData = await waitForTelegramInitData();

    const webApp = window.Telegram?.WebApp;
    webApp?.ready?.();
    webApp?.expand?.();
    webApp?.disableVerticalSwipes?.();

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

  async function openClientScanner() {
    try {
      const stream = await requestCameraStream();
      setCameraStream(stream);
      setBarcodeScannerOpen(true);
    } catch (cameraError) {
      setError(cameraError instanceof Error ? cameraError.message : "Не удалось открыть камеру");
    }
  }

  async function resolveBookingPayment(booking: StaffBooking) {
    setBusyId(booking.id);
    setError("");
    try {
      const result = await attachEligibleSubscriptionToBooking(booking.id);
      if (result.attached) {
        if (selectedSlotId) await refreshSelected();
        return;
      }

      setSalesClientId(String(booking.client_id));
      setActiveTab("sales");
      setScheduleMode("list");
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Не удалось перейти к оплате");
    } finally {
      setBusyId(null);
    }
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

  async function ensureScheduleOptions() {
    if (scheduleOptions.training_types.length || scheduleOptions.trainers.length) return scheduleOptions;
    const next = await fetchStaffScheduleOptions();
    setScheduleOptions(next);
    return next;
  }

  async function openCreateSlot() {
    try {
      await ensureScheduleOptions();
      const slotType = canEditGroups ? "group" : "personal";
      setSlotEditor({ mode: "create", slotId: null, draft: createEmptySlotDraft(date, slotType) });
      setScheduleMode("editor");
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные для тренировки");
    }
  }

  async function openEditSlot() {
    if (!selected || !canEditSlot(selected.slot)) return;
    try {
      await ensureScheduleOptions();
      setSlotEditor({ mode: "edit", slotId: String(selected.slot.id), draft: slotToEditorDraft(selected.slot) });
      setScheduleMode("editor");
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить данные для тренировки");
    }
  }

  async function saveSlot() {
    if (!slotEditor) return;
    setSlotSaving(true);
    setError("");
    try {
      const saved = slotEditor.mode === "create"
        ? await createStaffSlot(slotEditor.draft)
        : await updateStaffSlot(slotEditor.slotId as string, slotEditor.draft);
      setSlotEditor(null);
      await loadSchedule(slotEditor.draft.date);
      if (slotEditor.mode === "edit") await openSlot({ ...saved, id: saved.id || slotEditor.slotId } as StaffSlot);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить тренировку");
    } finally {
      setSlotSaving(false);
    }
  }

  async function cancelTrainingSlot() {
    if (!selected || !canCancelSlot) return;
    const bookingCount = selected.bookings.length;
    const warning = bookingCount > 0
      ? `Удалить тренировку? Записи клиентов (${bookingCount}) будут отменены.`
      : "Удалить тренировку из расписания?";
    if (!window.confirm(warning)) return;

    setSlotSaving(true);
    setError("");
    try {
      await cancelStaffSlot(selected.slot.id);
      await loadSchedule(String(selected.slot.date).slice(0, 10));
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Не удалось удалить тренировку");
    } finally {
      setSlotSaving(false);
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

  async function runSearch(searchValue = query) {
    const normalizedQuery = searchValue.trim();
    if (normalizedQuery.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    setError("");
    try {
      setQuery(normalizedQuery);
      setResults(await searchStaffClients(normalizedQuery, selectedSlotId || undefined));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Не удалось найти клиента");
    } finally {
      setSearching(false);
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
    if (tab === "home") {
      void loadSchedule(toDateInputValue(new Date()));
    }
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
    : activeTab === "schedule" && scheduleMode === "editor"
      ? slotEditor?.mode === "create" ? "Новая тренировка" : "Редактирование"
    : tabLabels[activeTab];

  if (authMode === "telegram") {
    return <TelegramAuthScreen error={authError} />;
  }

  return (
    <main
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-[var(--text-main)]"
      style={viewportHeight ? { height: `${viewportHeight}px` } : undefined}
    >
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

      <div ref={scrollRef} className="mx-auto min-h-0 w-full max-w-md flex-1 overflow-y-auto">
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
            canCreate={canCreateSlot}
            onCreate={() => void openCreateSlot()}
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
            onScan={() => void openClientScanner()}
            onBookClient={(client, allowUnpaid) => void bookClient(client, allowUnpaid)}
            onToggleAttend={(booking) => void toggleAttend(booking)}
            onCancelBooking={(booking) => void cancelClientBooking(booking)}
            onResolvePayment={(booking) => void resolveBookingPayment(booking)}
            canEdit={canEditSlot(selected.slot)}
            onEdit={() => void openEditSlot()}
            canCancel={canCancelSlot && !slotSaving}
            onCancelSlot={() => void cancelTrainingSlot()}
          />
        ) : null}

        {activeTab === "schedule" && scheduleMode === "editor" && slotEditor ? (
          <SlotEditor
            editor={slotEditor}
            options={scheduleOptions}
            saving={slotSaving}
            canEditGroups={canEditGroups}
            canEditPersonal={canEditPersonal}
            onChange={(draft) => setSlotEditor((current) => current ? { ...current, draft } : current)}
            onCancel={() => setScheduleMode(slotEditor.mode === "edit" ? "detail" : "list")}
            onSave={() => void saveSlot()}
          />
        ) : null}

        {activeTab === "sales" ? (
          <SalesScreen modules={modules} initialClientId={salesClientId} />
        ) : null}

        {activeTab === "profile" ? (
          <ProfileScreen staff={staff} onRefresh={() => void loadStaff()} />
        ) : null}
      </div>

      <BottomNav active={activeTab} onChange={changeTab} />
      {barcodeScannerOpen && cameraStream ? (
        <BarcodeScanner
          stream={cameraStream}
          onClose={() => { setBarcodeScannerOpen(false); setCameraStream(null); }}
          onDetected={(value) => {
            setBarcodeScannerOpen(false);
            setCameraStream(null);
            void runSearch(value);
          }}
        />
      ) : null}
    </main>
  );
}
