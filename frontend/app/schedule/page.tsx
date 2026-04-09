"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { describeSubscription, formatClientName } from "@/components/clients/shared";
import { GymAccessPanel } from "@/components/schedule/gym-access-panel";
import { inputCls, labelCls } from "@/components/warehouse/shared";
import { ClientDetail, ClientListItem, fetchClient, fetchClients, findClientByBarcode } from "@/lib/api/clients";
import { fetchProducts, Product } from "@/lib/api/products";
import {
  hasModuleAccess,
  type AuthModulePermission,
} from "@/lib/access";
import {
  attendBooking,
  cancelScheduleSlot,
  createBooking,
  createScheduleSlot,
  createScheduleTemplate,
  fetchScheduleSlot,
  fetchScheduleSlots,
  generateScheduleTemplates,
  ScheduleBooking,
  ScheduleSlot,
  ScheduleSlotDetail,
  SlotType,
  updateScheduleSlot,
} from "@/lib/api/schedule";
import { createTrainer, deleteTrainer, fetchTrainers, Trainer, updateTrainer } from "@/lib/api/trainers";
import { fetchTrainingTypes, TrainingType } from "@/lib/api/training-types";

type PageTab = "schedule" | "gym" | "trainers";
type CalendarView = "day" | "week" | "month";
type EntryMode = "single" | "regular";
type BannerTone = "info" | "success" | "error";

type BannerState = {
  tone: BannerTone;
  text: string;
} | null;

type SlotEditorState = {
  slot: ScheduleSlot | ScheduleSlotDetail | null;
  defaultDate: Date;
  defaultTime: string;
} | null;

const PAGE_START_HOUR = 6;
const PAGE_END_HOUR = 22;
const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: PAGE_END_HOUR - PAGE_START_HOUR + 1 }, (_, index) => PAGE_START_HOUR + index);

const viewOptions: { value: CalendarView; label: string }[] = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
];

const pageTabs: { value: PageTab; label: string }[] = [
  { value: "schedule", label: "Расписание" },
  { value: "trainers", label: "Тренеры" },
];

const slotTypeOptions: { value: SlotType; label: string }[] = [
  { value: "group", label: "Групповое" },
  { value: "personal", label: "Персональное" },
];

const weekdayOptions = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

const statusMeta = {
  confirmed: {
    label: "Записан",
    className: "border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.12)] text-[var(--accent)]",
  },
  attended: {
    label: "Посетил",
    className: "border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]",
  },
  missed: {
    label: "Пропустил",
    className: "border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] text-[var(--warning)]",
  },
  cancelled: {
    label: "Отменена",
    className: "border-[rgba(248,81,73,0.24)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]",
  },
} as const;

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M8.75 15a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM17.5 17.5l-4.375-4.375"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="m6.25 6.25 7.5 7.5m0-7.5-7.5 7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="m12.5 15-5-5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="m7.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="m4.583 10 3.333 3.333 7.5-7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M10 4.167v11.666M4.167 10h11.666" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeDateValue(value: string) {
  return value.slice(0, 10);
}

function parseIsoDate(value: string) {
  const [year, month, day] = normalizeDateValue(value).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function parseTime(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return {
    hours: Number.isFinite(hours) ? hours : 0,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const day = date.getDay() === 0 ? 7 : date.getDay();
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), 1 - day);
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getMonthGrid(date: Date) {
  const start = startOfWeek(startOfMonth(date));
  const end = endOfWeek(endOfMonth(date));
  const days: Date[] = [];

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(new Date(cursor));
  }

  return days;
}

function getRangeForView(view: CalendarView, date: Date) {
  if (view === "day") {
    const iso = toIsoDate(date);
    return { from: iso, to: iso };
  }

  if (view === "week") {
    return { from: toIsoDate(startOfWeek(date)), to: toIsoDate(endOfWeek(date)) };
  }

  const days = getMonthGrid(date);
  return { from: toIsoDate(days[0]), to: toIsoDate(days[days.length - 1]) };
}

function getMonthBounds(date: Date) {
  return {
    from: toIsoDate(startOfMonth(date)),
    to: toIsoDate(endOfMonth(date)),
  };
}

function getDayOfWeek(date: Date) {
  return date.getDay() === 0 ? 7 : date.getDay();
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(date);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("ru", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatWeekdayLong(date: Date) {
  return new Intl.DateTimeFormat("ru", {
    weekday: "long",
  }).format(date);
}

function getViewTitle(view: CalendarView, date: Date) {
  if (view === "day") {
    return formatDateLabel(date);
  }

  if (view === "week") {
    const weekStart = startOfWeek(date);
    const weekEnd = endOfWeek(date);
    return `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;
  }

  return formatMonthTitle(date);
}

function shiftDateByView(date: Date, view: CalendarView, direction: -1 | 1) {
  if (view === "day") {
    return addDays(date, direction);
  }

  if (view === "week") {
    return addDays(date, direction * 7);
  }

  return new Date(date.getFullYear(), date.getMonth() + direction, 1);
}

function parseTimeToMinutes(value: string) {
  const { hours, minutes } = parseTime(value);
  return hours * 60 + minutes;
}

function addMinutesToTime(value: string, minutesToAdd: number) {
  const minutes = parseTimeToMinutes(value) + minutesToAdd;
  const safeMinutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${pad(hours)}:${pad(mins)}`;
}

function roundTimeFromMinutes(minutes: number) {
  const rounded = Math.max(PAGE_START_HOUR * 60, Math.round(minutes / 15) * 15);
  const capped = Math.min(PAGE_END_HOUR * 60 - 15, rounded);
  return `${pad(Math.floor(capped / 60))}:${pad(capped % 60)}`;
}

function getSlotColor(slot: Pick<ScheduleSlot, "training_type_color">) {
  return slot.training_type_color || "#00BCD4";
}

function withAlpha(color: string | null | undefined, alpha: string, fallback: string) {
  if (!color) {
    return fallback;
  }

  if (/^#[0-9a-fA-F]{6}$/.test(color)) {
    return `${color}${alpha}`;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    const expanded = `#${color
      .slice(1)
      .split("")
      .map((chunk) => `${chunk}${chunk}`)
      .join("")}`;
    return `${expanded}${alpha}`;
  }

  return fallback;
}

function getBannerClass(tone: BannerTone) {
  if (tone === "success") {
    return "border-[rgba(63,185,80,0.35)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]";
  }

  if (tone === "error") {
    return "border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]";
  }

  return "border-[rgba(0,191,165,0.35)] bg-[rgba(0,191,165,0.12)] text-[var(--accent)]";
}

function getSlotTypeLabel(slotType: SlotType) {
  if (slotType === "personal") {
    return "Персональное";
  }

  if (slotType === "rental") {
    return "Аренда";
  }

  return "Групповое";
}

function getBookingStatusMeta(status: ScheduleBooking["status"]) {
  return statusMeta[status] ?? statusMeta.confirmed;
}

function getSubscriptionOptionLabel(subscription: ClientDetail["subscriptions"][number]) {
  const family = subscription.is_family ? " • семейный" : "";

  if (subscription.type === "single") {
    return `Разовое${family}`;
  }

  if (subscription.type === "visits") {
    return `${subscription.visits_left ?? 0} занятий осталось${family}`;
  }

  if (subscription.expires_at) {
    return `До ${new Date(subscription.expires_at).toLocaleDateString("ru")}${family}`;
  }

  return `Активный абонемент${family}`;
}

function groupSlotsByDate(slots: ScheduleSlot[]) {
  const grouped = new Map<string, ScheduleSlot[]>();

  for (const slot of slots) {
    const bucket = grouped.get(normalizeDateValue(slot.date)) ?? [];
    bucket.push(slot);
    bucket.sort((left, right) => parseTimeToMinutes(left.start_time) - parseTimeToMinutes(right.start_time));
    grouped.set(normalizeDateValue(slot.date), bucket);
  }

  return grouped;
}

function DayTimeline({
  date,
  slots,
  onSlotClick,
  onEmptyClick,
}: {
  date: Date;
  slots: ScheduleSlot[];
  onSlotClick: (slot: ScheduleSlot) => void;
  onEmptyClick: (dateValue: Date, startTime: string) => void;
}) {
  const containerHeight = (PAGE_END_HOUR - PAGE_START_HOUR) * HOUR_HEIGHT;
  const pixelsPerMinute = HOUR_HEIGHT / 60;

  return (
    <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-main)]">{formatDateLabel(date)}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Клик по свободному месту создаёт новое занятие</p>
        </div>
        <div className="rounded-full border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-3 py-1 text-xs text-[var(--text-muted)]">
          {slots.length} занятий
        </div>
      </div>

      <div className="grid grid-cols-[54px_minmax(0,1fr)] gap-3">
        <div className="relative" style={{ height: `${containerHeight}px` }}>
          {HOURS.map((hour, index) => (
            <span
              key={hour}
              className="absolute -translate-y-1/2 text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]"
              style={{ top: `${index * HOUR_HEIGHT}px` }}
            >
              {pad(hour)}:00
            </span>
          ))}
        </div>

        <div
          className="relative overflow-hidden rounded-[24px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]"
          style={{ height: `${containerHeight}px` }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const clickY = event.clientY - rect.top;
            const minutes = PAGE_START_HOUR * 60 + clickY / pixelsPerMinute;
            onEmptyClick(date, roundTimeFromMinutes(minutes));
          }}
        >
          {HOURS.map((hour, index) => (
            <div
              key={hour}
              className="absolute inset-x-0 border-t border-dashed border-[var(--line-soft)]"
              style={{ top: `${index * HOUR_HEIGHT}px` }}
            />
          ))}

          {slots.map((slot) => {
            const slotTop = (parseTimeToMinutes(slot.start_time) - PAGE_START_HOUR * 60) * pixelsPerMinute;
            const slotHeight = Math.max(slot.duration_minutes * pixelsPerMinute, 72);
            const slotColor = getSlotColor(slot);

            return (
              <button
                key={slot.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSlotClick(slot);
                }}
                className="absolute left-3 right-3 overflow-hidden rounded-[22px] border p-4 text-left shadow-[0_18px_48px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-0.5"
                style={{
                  top: `${slotTop}px`,
                  minHeight: `${slotHeight}px`,
                  borderColor: withAlpha(slotColor, "66", "rgba(0,191,165,0.36)"),
                  backgroundColor: withAlpha(slotColor, "1c", "rgba(0,191,165,0.12)"),
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      {formatTime(slot.start_time)} - {addMinutesToTime(slot.start_time, slot.duration_minutes)}
                    </p>
                    <p className="mt-2 truncate text-sm font-semibold text-[var(--text-main)]">
                      {slot.training_type_name || getSlotTypeLabel(slot.slot_type)}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: withAlpha(slotColor, "24", "rgba(0,191,165,0.12)"),
                      color: slotColor,
                    }}
                  >
                    {slot.booked_count}/{slot.capacity}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                  <span>{slot.trainer_name || "Тренер не назначен"}</span>
                  {slot.product_name && <span>• {slot.product_name}</span>}
                  {slot.is_free && <span>• бесплатно</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekBoard({
  anchorDate,
  slotsByDate,
  onSlotClick,
  onDaySelect,
  onCreate,
}: {
  anchorDate: Date;
  slotsByDate: Map<string, ScheduleSlot[]>;
  onSlotClick: (slot: ScheduleSlot) => void;
  onDaySelect: (day: Date) => void;
  onCreate: (day: Date) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchorDate), index));

  return (
    <div className="grid gap-4 xl:grid-cols-7">
      {days.map((day) => {
        const dayKey = toIsoDate(day);
        const slots = slotsByDate.get(dayKey) ?? [];
        const isToday = dayKey === toIsoDate(new Date());
        const isWeekend = getDayOfWeek(day) >= 6;

        return (
          <div
            key={dayKey}
            className={`flex min-h-[360px] flex-col rounded-[28px] border p-4 ${
              isToday
                ? "border-[rgba(0,191,165,0.34)] bg-[linear-gradient(180deg,rgba(0,191,165,0.08),rgba(28,35,51,0.96))] shadow-[0_0_0_1px_rgba(0,191,165,0.12)]"
                : isWeekend
                ? "border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))]"
                : "border-[var(--line-soft)] bg-[var(--bg-card)]"
            }`}
          >
            <button
              type="button"
              onClick={() => onDaySelect(day)}
              className={`rounded-[20px] px-3 py-3 text-left transition-colors ${
                isToday
                  ? "border border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.16)]"
                  : "bg-[var(--bg-card-soft)] hover:bg-[rgba(255,255,255,0.04)]"
              }`}
            >
              <p className={`text-[11px] uppercase tracking-[0.18em] ${isToday ? "text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                {formatWeekdayLong(day)}
              </p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{formatShortDate(day)}</p>
            </button>

            <button
              type="button"
              onClick={() => onCreate(day)}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-[18px] border border-dashed border-[rgba(0,191,165,0.22)] bg-[rgba(0,191,165,0.08)] px-3 py-2 text-xs font-medium text-[var(--accent)] transition-all hover:border-[var(--accent)] hover:bg-[rgba(0,191,165,0.14)] hover:brightness-110"
            >
              <PlusIcon />
              Добавить
            </button>

            <div className="mt-4 space-y-3">
              {slots.length === 0 ? (
                <div className={`rounded-[20px] border border-dashed px-4 py-8 text-center text-sm ${
                  isWeekend
                    ? "border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-slate-400"
                    : "border-[var(--line-soft)] text-[var(--text-muted)]"
                }`}>
                  <p className="text-sm font-medium text-[var(--text-main)]">Свободно</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">Можно добавить занятие</p>
                </div>
              ) : (
                slots.map((slot) => {
                  const slotColor = getSlotColor(slot);

                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => onSlotClick(slot)}
                      className="w-full rounded-[22px] border px-4 py-3 text-left transition-transform hover:-translate-y-0.5"
                      style={{
                        borderColor: withAlpha(slotColor, "66", "rgba(0,191,165,0.36)"),
                        backgroundColor: withAlpha(slotColor, "14", "rgba(0,191,165,0.12)"),
                      }}
                    >
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        {formatTime(slot.start_time)} - {addMinutesToTime(slot.start_time, slot.duration_minutes)}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--text-main)]">
                        {slot.training_type_name || getSlotTypeLabel(slot.slot_type)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                        <span>{slot.booked_count}/{slot.capacity}</span>
                        <span>•</span>
                        <span>{slot.trainer_name || "Без тренера"}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthBoard({
  anchorDate,
  slotsByDate,
  onDaySelect,
  onSlotClick,
}: {
  anchorDate: Date;
  slotsByDate: Map<string, ScheduleSlot[]>;
  onDaySelect: (day: Date) => void;
  onSlotClick: (slot: ScheduleSlot) => void;
}) {
  const days = getMonthGrid(anchorDate);
  const activeMonth = anchorDate.getMonth();
  const todayKey = toIsoDate(new Date());

  return (
    <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 sm:p-5">
      <div className="mb-4 grid grid-cols-7 gap-3 px-1 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
        {weekdayOptions.map((day) => (
          <span key={day.value}>{day.label}</span>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-7">
        {days.map((day) => {
          const dayKey = toIsoDate(day);
          const slots = slotsByDate.get(dayKey) ?? [];
          const isCurrentMonth = day.getMonth() === activeMonth;
          const isToday = dayKey === todayKey;

          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => onDaySelect(day)}
              className={`min-h-[152px] rounded-[24px] border p-3 text-left transition-colors ${
                isToday
                  ? "border-[rgba(0,191,165,0.34)] bg-[linear-gradient(180deg,rgba(0,191,165,0.1),rgba(34,43,61,0.96))] shadow-[0_0_0_1px_rgba(0,191,165,0.12)]"
                  : isCurrentMonth
                  ? "border-[var(--line-soft)] bg-[var(--bg-card-soft)] hover:border-[var(--accent)]"
                  : "border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] text-[var(--text-muted)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold ${
                    isToday ? "bg-[var(--accent)] text-[#062b26]" : "text-[var(--text-main)]"
                  }`}
                >
                  {day.getDate()}
                </span>
                <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  {slots.length}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {slots.slice(0, 3).map((slot) => {
                  const slotColor = getSlotColor(slot);

                  return (
                    <div
                      key={slot.id}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSlotClick(slot);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          onSlotClick(slot);
                        }
                      }}
                      className="rounded-[16px] border px-3 py-2 text-left"
                      style={{
                        borderColor: withAlpha(slotColor, "66", "rgba(0,191,165,0.36)"),
                        backgroundColor: withAlpha(slotColor, "12", "rgba(0,191,165,0.12)"),
                      }}
                    >
                      <p className="truncate text-xs font-medium text-[var(--text-main)]">
                        {formatTime(slot.start_time)} • {slot.training_type_name || getSlotTypeLabel(slot.slot_type)}
                      </p>
                    </div>
                  );
                })}

                {slots.length > 3 && <p className="text-xs text-[var(--text-muted)]">+{slots.length - 3} ещё</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SlotEditorModal({
  state,
  trainingTypes,
  trainers,
  services,
  onClose,
  onSaved,
}: {
  state: SlotEditorState;
  trainingTypes: TrainingType[];
  trainers: Trainer[];
  services: Product[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [slotType, setSlotType] = useState<SlotType>("group");
  const [trainingTypeId, setTrainingTypeId] = useState("");
  const [trainerId, setTrainerId] = useState("");
  const [productId, setProductId] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [capacity, setCapacity] = useState("20");
  const [isFree, setIsFree] = useState(false);
  const [blockIfEmptyHours, setBlockIfEmptyHours] = useState("");
  const [comment, setComment] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("single");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) {
      return;
    }

    const slot = state.slot;
    const defaultDay = slot ? parseIsoDate(slot.date) : state.defaultDate;
    const defaultTime = slot ? formatTime(slot.start_time) : state.defaultTime;

    setSlotType(slot?.slot_type === "personal" ? "personal" : "group");
    setTrainingTypeId(slot?.training_type_id ?? "");
    setTrainerId(slot?.trainer_id ?? "");
    setProductId(slot?.product_id ?? "");
    setDateValue(slot ? normalizeDateValue(slot.date) : toIsoDate(defaultDay));
    setStartTime(defaultTime);
    setDurationMinutes(String(slot?.duration_minutes ?? 60));
    setCapacity(String(slot?.capacity ?? 20));
    setIsFree(Boolean(slot?.is_free));
    setBlockIfEmptyHours(slot?.block_if_empty_hours ? String(slot.block_if_empty_hours) : "");
    setComment(slot?.comment ?? "");
    setEntryMode("single");
    setRepeatDays([getDayOfWeek(defaultDay)]);
    setError(null);
  }, [state]);

  if (!state) {
    return null;
  }

  const editorState = state;
  const availableTrainingTypes = trainingTypes.filter(
    (item) => item.slot_type === slotType && (item.is_active || item.id === trainingTypeId)
  );

  async function handleSubmit() {
    if (!dateValue || !startTime) {
      setError("Укажите дату и время начала");
      return;
    }

    if (!trainingTypeId) {
      setError("Выберите вид тренировки");
      return;
    }

    if (!durationMinutes.trim()) {
      setError("Укажите длительность");
      return;
    }

    if (!capacity.trim()) {
      setError("Для выбранного вида тренировки не указана вместимость");
      return;
    }

    if (entryMode === "regular" && repeatDays.length === 0) {
      setError("Выберите хотя бы один день недели");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      slot_type: slotType,
      training_type_id: trainingTypeId ? Number.parseInt(trainingTypeId, 10) : null,
      trainer_id: trainerId ? Number.parseInt(trainerId, 10) : null,
      product_id: productId ? Number.parseInt(productId, 10) : null,
      date: dateValue,
      start_time: startTime,
      duration_minutes: Number.parseInt(durationMinutes, 10),
      capacity: Number.parseInt(capacity, 10),
      is_free: isFree,
      block_if_empty_hours: blockIfEmptyHours.trim() ? Number.parseInt(blockIfEmptyHours, 10) : null,
      comment: comment.trim() || null,
    };

    try {
      if (editorState.slot) {
        await updateScheduleSlot(editorState.slot.id, payload);
        onSaved("Занятие обновлено");
        return;
      }

      if (entryMode === "single") {
        await createScheduleSlot(payload);
        onSaved("Занятие создано");
        return;
      }

      const monthBounds = getMonthBounds(parseIsoDate(dateValue));

      for (const dayOfWeek of repeatDays) {
        await createScheduleTemplate({
          slot_type: payload.slot_type,
          training_type_id: payload.training_type_id,
          trainer_id: payload.trainer_id,
          product_id: payload.product_id,
          day_of_week: dayOfWeek,
          start_time: payload.start_time,
          duration_minutes: payload.duration_minutes,
          capacity: payload.capacity,
          block_if_empty_hours: payload.block_if_empty_hours,
        });
      }

      await generateScheduleTemplates({
        date_from: monthBounds.from,
        date_to: monthBounds.to,
      });

      onSaved("Регулярные занятия созданы на текущий месяц");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить занятие");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.78)] px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="font-[family:var(--font-heading)] text-[1.9rem] font-semibold leading-none text-[var(--text-main)]">
              {editorState.slot ? "Редактирование занятия" : "Новое занятие"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {editorState.slot ? "Измените параметры существующего слота" : "Создайте разовое или регулярное занятие"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--bg-card-soft)] text-[var(--text-muted)] shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-all hover:border-[rgba(255,255,255,0.14)] hover:text-[var(--text-main)]"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {!editorState.slot && (
          <div className="mt-6 rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
            <p className={labelCls}>Вид занятия</p>
            <div className="mt-3 inline-flex rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] p-1">
              {([
                { value: "single", label: "Разовое" },
                { value: "regular", label: "Регулярное" },
              ] as const).map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setEntryMode(item.value)}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    entryMode === item.value
                      ? "bg-[var(--accent)] text-[#062b26]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
            <p className={labelCls}>Тип занятия</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {slotTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSlotType(option.value);
                    setTrainingTypeId("");
                    setCapacity("");
                  }}
                  className={`rounded-[18px] border px-3 py-3 text-sm transition-colors ${
                    slotType === option.value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--line-soft)] text-[var(--text-main)] hover:border-[var(--accent)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label className={labelCls}>Вид тренировки</label>
              <select
                value={trainingTypeId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setTrainingTypeId(nextId);

                  const nextType = trainingTypes.find((item) => item.id === nextId);
                  if (nextType?.duration) {
                    setDurationMinutes(String(nextType.duration));
                  }

                  if (nextType?.capacity) {
                    setCapacity(String(nextType.capacity));
                  } else {
                    setCapacity("");
                  }
                }}
                className={`mt-2 ${inputCls}`}
              >
                <option value="">Не выбран</option>
                {availableTrainingTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className={labelCls}>Тренер</label>
              <select
                value={trainerId}
                onChange={(event) => setTrainerId(event.target.value)}
                className={`mt-2 ${inputCls}`}
              >
                <option value="">Не назначен</option>
                {trainers.map((trainer) => (
                  <option key={trainer.id} value={trainer.id}>
                    {trainer.last_name} {trainer.first_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className={labelCls}>Услуга для списания</label>
              <select
                value={productId}
                onChange={(event) => setProductId(event.target.value)}
                className={`mt-2 ${inputCls}`}
              >
                <option value="">Без услуги</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Дата</label>
                <input
                  type="date"
                  value={dateValue}
                  onChange={(event) => setDateValue(event.target.value)}
                  className={`mt-2 ${inputCls}`}
                />
              </div>
              <div>
                <label className={labelCls}>Время начала</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className={`mt-2 ${inputCls}`}
                />
              </div>
              <div>
                <label className={labelCls}>Длительность, мин</label>
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(event.target.value)}
                  className={`mt-2 ${inputCls}`}
                />
              </div>
              <div>
                <label className={labelCls}>Вместимость</label>
                <input
                  type="number"
                  min="1"
                  value={capacity}
                  readOnly
                  className={`mt-2 ${inputCls} cursor-not-allowed opacity-80`}
                />
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Вместимость берётся из выбранного вида тренировки.
                </p>
              </div>
              <div>
                <label className={labelCls}>Блокировка записи, часы</label>
                <input
                  type="number"
                  min="0"
                  value={blockIfEmptyHours}
                  onChange={(event) => setBlockIfEmptyHours(event.target.value)}
                  className={`mt-2 ${inputCls}`}
                  placeholder="Например 6"
                />
              </div>
              <label className="flex items-center gap-3 rounded-[18px] border border-[var(--line-soft)] px-4 py-3 text-sm text-[var(--text-main)]">
                <input
                  type="checkbox"
                  checked={isFree}
                  onChange={(event) => setIsFree(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                Бесплатное занятие
              </label>
            </div>

            {!editorState.slot && entryMode === "regular" && (
              <div className="mt-4 rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
                <p className={labelCls}>Дни недели</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {weekdayOptions.map((day) => {
                    const active = repeatDays.includes(day.value);

                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() =>
                          setRepeatDays((current) =>
                            active
                              ? current.filter((value) => value !== day.value)
                              : [...current, day.value].sort((left, right) => left - right)
                          )
                        }
                        className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--line-soft)] text-[var(--text-main)] hover:border-[var(--accent)]"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  После сохранения шаблоны будут сгенерированы на месяц выбранной даты.
                </p>
              </div>
            )}

            <div className="mt-4">
              <label className={labelCls}>Комментарий</label>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={4}
                className={`mt-2 ${inputCls} resize-none`}
                placeholder="Например: первый вводный класс для новичков"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
          >
            <PlusIcon />
            {saving ? "Сохраняем..." : editorState.slot ? "Сохранить" : "Создать"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[18px] border border-[var(--line-soft)] px-5 py-3 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function TrainerFormModal({
  trainer,
  trainingTypes,
  onClose,
  onSaved,
}: {
  trainer: Trainer | null;
  trainingTypes: TrainingType[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [firstName, setFirstName] = useState(trainer?.first_name ?? "");
  const [lastName, setLastName] = useState(trainer?.last_name ?? "");
  const [phone, setPhone] = useState(trainer?.phone ?? "");
  const [email, setEmail] = useState(trainer?.email ?? "");
  const [bio, setBio] = useState(trainer?.bio ?? "");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(trainer?.training_types.map((item) => item.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFirstName(trainer?.first_name ?? "");
    setLastName(trainer?.last_name ?? "");
    setPhone(trainer?.phone ?? "");
    setEmail(trainer?.email ?? "");
    setBio(trainer?.bio ?? "");
    setSelectedTypes(trainer?.training_types.map((item) => item.id) ?? []);
    setError(null);
  }, [trainer]);

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Укажите имя и фамилию тренера");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        bio: bio.trim() || null,
        training_type_ids: selectedTypes.map((value) => Number.parseInt(value, 10)),
      };

      if (trainer) {
        await updateTrainer(trainer.id, payload);
        onSaved("Тренер обновлён");
      } else {
        await createTrainer(payload);
        onSaved("Тренер создан");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить тренера");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.78)] px-4 py-8">
      <div className="w-full max-w-3xl rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="font-[family:var(--font-heading)] text-[1.9rem] font-semibold leading-none text-[var(--text-main)]">
              {trainer ? "Редактирование тренера" : "Новый тренер"}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Контакты, био и виды тренировок</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--bg-card-soft)] text-[var(--text-muted)] shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-all hover:border-[rgba(255,255,255,0.14)] hover:text-[var(--text-main)]"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        {error && (
          <div className="mt-5 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="max-w-2xl">
            <label className={labelCls}>Имя</label>
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className={`mt-2 ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>Фамилия</label>
            <input value={lastName} onChange={(event) => setLastName(event.target.value)} className={`mt-2 ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>Телефон</label>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} className={`mt-2 ${inputCls}`} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input value={email} onChange={(event) => setEmail(event.target.value)} className={`mt-2 ${inputCls}`} />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelCls}>Bio</label>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={4}
            className={`mt-2 ${inputCls} resize-none`}
          />
        </div>

        <div className="mt-4 rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
          <p className={labelCls}>Виды тренировок</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {trainingTypes.map((type) => {
              const selected = selectedTypes.includes(type.id);

              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() =>
                    setSelectedTypes((current) =>
                      selected ? current.filter((value) => value !== type.id) : [...current, type.id]
                    )
                  }
                  className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--line-soft)] text-[var(--text-main)] hover:border-[var(--accent)]"
                  }`}
                >
                  {type.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Сохраняем..." : trainer ? "Сохранить" : "Создать"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[18px] border border-[var(--line-soft)] px-5 py-3 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function SlotDetailsModal({
  slotId,
  onClose,
  onEdit,
  onChanged,
  onNotice,
  canManageSchedule,
}: {
  slotId: string | null;
  onClose: () => void;
  onEdit: (slot: ScheduleSlotDetail) => void;
  onChanged: () => void;
  onNotice: (banner: BannerState) => void;
  canManageSchedule: boolean;
}) {
  const [detail, setDetail] = useState<ScheduleSlotDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientListItem[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(null);
  const [selectedClientDetail, setSelectedClientDetail] = useState<ClientDetail | null>(null);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState("");
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingActionId, setBookingActionId] = useState<string | null>(null);
  const [cancellingSlot, setCancellingSlot] = useState(false);

  const clientScannerBufferRef = useRef("");
  const clientScannerLastTsRef = useRef(0);

  async function loadDetail(nextId: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchScheduleSlot(nextId);
      setDetail(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить занятие");
    } finally {
      setLoading(false);
    }
  }

  async function selectClient(client: ClientListItem) {
    setSelectedClient(client);
    setClientError(null);

    try {
      const detailResponse = await fetchClient(client.id);
      const activeSubscriptions = detailResponse.subscriptions.filter((item) => item.status === "active");
      setSelectedClientDetail(detailResponse);
      setSelectedSubscriptionId(activeSubscriptions[0]?.id ?? "");
    } catch (loadError) {
      setClientError(loadError instanceof Error ? loadError.message : "Не удалось загрузить абонементы клиента");
      setSelectedClientDetail(null);
      setSelectedSubscriptionId("");
    }
  }

  async function handleClientBarcode(barcode: string) {
    setClientLoading(true);
    setClientError(null);

    try {
      const client = await findClientByBarcode(barcode);
      await selectClient(client);
    } catch (scanError) {
      setClientError(scanError instanceof Error ? scanError.message : "Клиент по штрихкоду не найден");
    } finally {
      setClientLoading(false);
    }
  }

  useEffect(() => {
    if (!slotId) {
      setDetail(null);
      setClientQuery("");
      setClientResults([]);
      setSelectedClient(null);
      setSelectedClientDetail(null);
      setSelectedSubscriptionId("");
      return;
    }

    void loadDetail(slotId);
  }, [slotId]);

  useEffect(() => {
    if (!slotId) {
      return;
    }

    const trimmedQuery = clientQuery.trim();

    if (trimmedQuery.length < 2) {
      setClientResults([]);
      return;
    }

    let cancelled = false;
    setClientLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const results = await fetchClients({ search: trimmedQuery, limit: 20, offset: 0 });
        if (!cancelled) {
          setClientResults(results);
        }
      } catch (loadError) {
        if (!cancelled) {
          setClientError(loadError instanceof Error ? loadError.message : "Не удалось найти клиентов");
        }
      } finally {
        if (!cancelled) {
          setClientLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientQuery, slotId]);

  if (!slotId) {
    return null;
  }

  const activeSubscriptions = selectedClientDetail?.subscriptions.filter((item) => item.status === "active") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(5,8,12,0.82)] px-4 py-8">
      <div className="my-4 w-full max-w-4xl rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="font-[family:var(--font-heading)] text-[1.9rem] font-semibold leading-none text-[var(--text-main)]">
              Детали занятия
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Записи, посещаемость и действия по слоту</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--bg-card-soft)] text-[var(--text-muted)] shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-all hover:border-[rgba(255,255,255,0.14)] hover:text-[var(--text-main)]"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-[var(--text-muted)]">Загружаем занятие...</div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : detail ? (
          <div className="mt-6">
            <div className="space-y-5">
              <section className="rounded-[28px] border border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,rgba(40,50,78,0.92),rgba(23,30,47,0.98))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--text-muted)]">
                      {formatTime(detail.start_time)} - {addMinutesToTime(detail.start_time, detail.duration_minutes)}
                    </p>
                    <p className="mt-3 text-[1.75rem] font-semibold leading-tight text-[var(--text-main)]">
                      {detail.training_type_name || getSlotTypeLabel(detail.slot_type)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-[var(--text-muted)]">
                        {formatDateLabel(parseIsoDate(detail.date))}
                      </span>
                      <span>•</span>
                      <span>{detail.trainer_name || "Тренер не назначен"}</span>
                      <span>•</span>
                      <span>{detail.booked_count}/{detail.capacity} мест</span>
                    </div>
                  </div>
                  <span
                    className="rounded-full border px-3 py-1.5 text-xs font-medium shadow-[0_10px_24px_rgba(0,0,0,0.16)]"
                    style={{
                      borderColor: withAlpha(getSlotColor(detail), "66", "rgba(0,191,165,0.36)"),
                      backgroundColor: withAlpha(getSlotColor(detail), "1a", "rgba(0,191,165,0.12)"),
                      color: getSlotColor(detail),
                    }}
                  >
                    {getSlotTypeLabel(detail.slot_type)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-[var(--text-main)] sm:grid-cols-2">
                  <div className="rounded-[20px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,15,25,0.35)] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Услуга</p>
                    <p className="mt-2">{detail.product_name || "Без услуги"}</p>
                  </div>
                  <div className="rounded-[20px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,15,25,0.35)] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Запись</p>
                    <p className="mt-2">
                      {detail.block_if_empty_hours
                        ? `Закрывается за ${detail.block_if_empty_hours} ч. при пустом слоте`
                        : "Без ограничений"}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,15,25,0.35)] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Бесплатное</p>
                    <p className="mt-2">{detail.is_free ? "Да" : "Нет"}</p>
                  </div>
                  <div className="rounded-[20px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,15,25,0.35)] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Комментарий</p>
                    <p className="mt-2">{detail.comment || "—"}</p>
                  </div>
                </div>

                {canManageSchedule ? (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[rgba(255,255,255,0.07)] pt-5">
                  <button
                    type="button"
                    onClick={() => onEdit(detail)}
                    className="rounded-[18px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-2.5 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.07)]"
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("Отменить это занятие и все подтверждённые записи?")) {
                        return;
                      }

                      setCancellingSlot(true);

                      try {
                        await cancelScheduleSlot(detail.id);
                        onChanged();
                        onNotice({ tone: "success", text: "Занятие отменено" });
                        onClose();
                      } catch (cancelError) {
                        onNotice({
                          tone: "error",
                          text: cancelError instanceof Error ? cancelError.message : "Не удалось отменить занятие",
                        });
                      } finally {
                        setCancellingSlot(false);
                      }
                    }}
                    disabled={cancellingSlot}
                    className="rounded-[18px] border border-[rgba(248,81,73,0.24)] px-4 py-2.5 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.12)] disabled:opacity-50"
                  >
                    {cancellingSlot ? "Отменяем..." : "Отменить занятие"}
                  </button>
                </div>
                ) : null}
              </section>

              <section className="rounded-[26px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <SearchIcon />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-[var(--text-main)]">Записать клиента</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Поиск по имени или быстрое сканирование штрихкода клиента
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="relative block">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--text-muted)]">
                      <SearchIcon />
                    </span>
                    <input
                      type="text"
                      value={clientQuery}
                      onChange={(event) => {
                        setClientError(null);
                        setClientQuery(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
                          return;
                        }

                        const now = Date.now();

                        if (event.key === "Enter") {
                          const barcode = clientScannerBufferRef.current.trim();
                          const isScannerInput = barcode.length >= 6 && now - clientScannerLastTsRef.current <= 100;
                          clientScannerBufferRef.current = "";
                          clientScannerLastTsRef.current = 0;

                          if (isScannerInput) {
                            event.preventDefault();
                            void handleClientBarcode(barcode);
                          }
                          return;
                        }

                        if (event.key.length === 1) {
                          if (now - clientScannerLastTsRef.current > 100) {
                            clientScannerBufferRef.current = "";
                          }

                          clientScannerBufferRef.current += event.key;
                          clientScannerLastTsRef.current = now;
                        }
                      }}
                      placeholder="Введите ФИО клиента или сканируйте штрихкод..."
                      className={`${inputCls} pl-12`}
                    />
                  </label>
                </div>

                {clientError && (
                  <div className="mt-4 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
                    {clientError}
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  {clientLoading ? (
                    <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                      Ищем клиентов...
                    </div>
                  ) : clientResults.length > 0 ? (
                    clientResults.slice(0, 5).map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => void selectClient(client)}
                        className="w-full rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)] hover:bg-[rgba(0,191,165,0.08)]"
                      >
                        <p className="text-sm font-semibold text-[var(--text-main)]">{formatClientName(client)}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {client.phone || "Телефон не указан"} • {describeSubscription(client)}
                        </p>
                      </button>
                    ))
                  ) : null}
                </div>

                {selectedClient && (
                  <div className="mt-4 rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-main)]">{formatClientName(selectedClient)}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">{selectedClient.phone || "Телефон не указан"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClient(null);
                          setSelectedClientDetail(null);
                          setSelectedSubscriptionId("");
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--line-soft)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
                        aria-label="Очистить клиента"
                      >
                        <CloseIcon />
                      </button>
                    </div>

                    <div className="mt-4">
                      <label className={labelCls}>Абонемент для списания</label>
                      <select
                        value={selectedSubscriptionId}
                        onChange={(event) => setSelectedSubscriptionId(event.target.value)}
                        className={`mt-2 ${inputCls}`}
                      >
                        <option value="">Без списания</option>
                        {activeSubscriptions.map((subscription) => (
                          <option key={subscription.id} value={subscription.id}>
                            {getSubscriptionOptionLabel(subscription)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedClient) {
                          return;
                        }

                        setBookingSaving(true);

                        try {
                          await createBooking({
                            slot_id: detail.id,
                            client_id: selectedClient.id,
                            subscription_id: selectedSubscriptionId || null,
                            booked_by: "admin",
                          });
                          setClientQuery("");
                          setClientResults([]);
                          setSelectedClient(null);
                          setSelectedClientDetail(null);
                          setSelectedSubscriptionId("");
                          await loadDetail(detail.id);
                          onChanged();
                          onNotice({ tone: "success", text: "Клиент записан на занятие" });
                        } catch (bookingError) {
                          setClientError(bookingError instanceof Error ? bookingError.message : "Не удалось записать клиента");
                        } finally {
                          setBookingSaving(false);
                        }
                      }}
                      disabled={bookingSaving}
                      className="mt-4 rounded-[18px] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      {bookingSaving ? "Записываем..." : "Записать клиента"}
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-[26px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[var(--text-main)]">Записанные клиенты</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Все брони по занятию и фиксация посещения прямо по строке клиента
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-1 text-xs text-[var(--text-muted)]">
                    {detail.bookings.length} записей
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {detail.bookings.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-[var(--line-soft)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                      Пока никто не записан
                    </div>
                  ) : (
                    detail.bookings.map((booking) => {
                      const meta = getBookingStatusMeta(booking.status);

                      return (
                        <div
                          key={booking.id}
                          className="rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text-main)]">
                                {booking.client_name || `Клиент #${booking.client_id}`}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                                <span>{booking.client_phone || "Телефон не указан"}</span>
                                <span>•</span>
                                <span>{booking.places_count} мест</span>
                                {booking.client_barcode && (
                                  <>
                                    <span>•</span>
                                    <span>{booking.client_barcode}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-3 py-1 text-xs ${meta.className}`}>{meta.label}</span>
                              {booking.status === "confirmed" && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setBookingActionId(booking.id);

                                    try {
                                      await attendBooking(booking.id);
                                      await loadDetail(detail.id);
                                      onChanged();
                                      onNotice({ tone: "success", text: "Посещение отмечено" });
                                    } catch (attendError) {
                                      onNotice({
                                        tone: "error",
                                        text: attendError instanceof Error ? attendError.message : "Не удалось отметить посещение",
                                      });
                                    } finally {
                                      setBookingActionId(null);
                                    }
                                  }}
                                  disabled={bookingActionId === booking.id}
                                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.1)] px-3 py-1.5 text-xs font-medium text-[var(--success)] transition-colors hover:bg-[rgba(63,185,80,0.16)] disabled:opacity-50"
                                >
                                  <CheckIcon />
                                  {bookingActionId === booking.id ? "Фиксируем..." : "Зафиксировать посещение"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const [currentModules, setCurrentModules] = useState<AuthModulePermission[]>([]);
  const [pageTab, setPageTab] = useState<PageTab>("schedule");
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [services, setServices] = useState<Product[]>([]);
  const [supportLoading, setSupportLoading] = useState(true);

  const [slotEditorState, setSlotEditorState] = useState<SlotEditorState>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [trainerModalOpen, setTrainerModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const [deletingTrainerId, setDeletingTrainerId] = useState<string | null>(null);

  const range = useMemo(() => getRangeForView(view, currentDate), [currentDate, view]);
  const slotsByDate = useMemo(() => groupSlotsByDate(slots), [slots]);
  const selectedDayKey = toIsoDate(currentDate);
  const visibleDaySlots = slotsByDate.get(selectedDayKey) ?? [];
  const canManageSchedule =
    hasModuleAccess(currentModules, "schedule") &&
    (
      hasModuleAccess(currentModules, "clients") ||
      hasModuleAccess(currentModules, "warehouse") ||
      hasModuleAccess(currentModules, "services") ||
      hasModuleAccess(currentModules, "users_manage")
    );
  const canManageTrainers = hasModuleAccess(currentModules, "schedule") && hasModuleAccess(currentModules, "services");
  const canManageGymHours = canManageSchedule;
  const availableTabs = pageTabs.filter((tab) => (tab.value === "trainers" ? canManageTrainers : true));

  useEffect(() => {
    let cancelled = false;

    fetch("/auth-api/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) {
          return [];
        }

        const data = (await response.json()) as { data?: { user?: { modules?: AuthModulePermission[] } } };
        return data.data?.user?.modules ?? [];
      })
      .then((modules) => {
        if (!cancelled) {
          setCurrentModules(modules);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentModules([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pageTab === "trainers" && !canManageTrainers) {
      setPageTab("schedule");
    }
  }, [canManageTrainers, pageTab]);

  useEffect(() => {
    let cancelled = false;

    setSupportLoading(true);

    Promise.all([fetchTrainingTypes(), fetchTrainers(), fetchProducts({ type: "service" })])
      .then(([loadedTrainingTypes, loadedTrainers, loadedServices]) => {
        if (cancelled) {
          return;
        }

        setTrainingTypes(loadedTrainingTypes);
        setTrainers(loadedTrainers);
        setServices(loadedServices);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setBanner({
            tone: "error",
            text: loadError instanceof Error ? loadError.message : "Не удалось загрузить справочники расписания",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSupportLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (pageTab !== "schedule") {
      return;
    }

    let cancelled = false;
    setSlotsLoading(true);
    setError(null);

    fetchScheduleSlots({
      date_from: range.from,
      date_to: range.to,
    })
      .then((response) => {
        if (!cancelled) {
          setSlots(response);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить расписание");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSlotsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pageTab, range.from, range.to, reloadToken]);

  function refreshPage() {
    setReloadToken((value) => value + 1);
  }

  async function handleDeleteTrainer(id: string) {
    if (!window.confirm("Удалить тренера из активного списка?")) {
      return;
    }

    setDeletingTrainerId(id);

    try {
      await deleteTrainer(id);
      refreshPage();
      setBanner({ tone: "success", text: "Тренер скрыт из активного списка" });
    } catch (deleteError) {
      setBanner({
        tone: "error",
        text: deleteError instanceof Error ? deleteError.message : "Не удалось удалить тренера",
      });
    } finally {
      setDeletingTrainerId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">
            Расписание
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Календарь занятий, запись клиентов, посещаемость и управление тренерским составом.
          </p>
        </div>

        <div className="inline-flex rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] p-1">
          {availableTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setPageTab(tab.value)}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                pageTab === tab.value
                  ? "bg-[var(--accent)] text-[#062b26]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPageTab("gym")}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              pageTab === "gym"
                ? "bg-[var(--accent)] text-[#062b26]"
                : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            Зал
          </button>
        </div>
      </div>

      {banner && (
        <div className={`rounded-[22px] border px-4 py-3 text-sm ${getBannerClass(banner.tone)}`}>{banner.text}</div>
      )}

      {pageTab === "schedule" ? (
        <>
          <section className="rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="inline-flex rounded-full border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-1">
                {viewOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setView(option.value)}
                    className={`rounded-full px-4 py-2 text-sm transition-colors ${
                      view === option.value
                        ? "bg-[var(--accent)] text-[#062b26]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentDate((value) => shiftDateByView(value, view, -1))}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--line-soft)] text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                    aria-label="Назад"
                  >
                    <ChevronLeftIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentDate(new Date())}
                    className="rounded-[18px] border border-[var(--line-soft)] px-4 py-2.5 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    Сегодня
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentDate((value) => shiftDateByView(value, view, 1))}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--line-soft)] text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                    aria-label="Вперёд"
                  >
                    <ChevronRightIcon />
                  </button>
                </div>

                <div className="min-w-[230px] rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm font-medium text-[var(--text-main)]">
                  {getViewTitle(view, currentDate)}
                </div>

                {canManageSchedule ? (
                  <button
                  type="button"
                  onClick={() =>
                    setSlotEditorState({
                      slot: null,
                      defaultDate: currentDate,
                      defaultTime: "09:00",
                    })
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110"
                >
                  <PlusIcon />
                  Добавить
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              {error && (
                <div className="rounded-[22px] border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
                  {error}
                </div>
              )}

              {slotsLoading || supportLoading ? (
                <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-20 text-center text-sm text-[var(--text-muted)]">
                  Загружаем расписание...
                </div>
              ) : view === "day" ? (
                <DayTimeline
                  date={currentDate}
                  slots={visibleDaySlots}
                  onSlotClick={(slot) => setSelectedSlotId(slot.id)}
                  onEmptyClick={(dateValue, startTime) => {
                    if (!canManageSchedule) {
                      return;
                    }

                    setSlotEditorState({
                      slot: null,
                      defaultDate: dateValue,
                      defaultTime: startTime,
                    });
                  }}
                />
              ) : view === "week" ? (
                <WeekBoard
                  anchorDate={currentDate}
                  slotsByDate={slotsByDate}
                  onSlotClick={(slot) => setSelectedSlotId(slot.id)}
                  onDaySelect={(day) => {
                    setCurrentDate(day);
                    setView("day");
                  }}
                  onCreate={(day) => {
                    if (!canManageSchedule) {
                      return;
                    }

                    setSlotEditorState({
                      slot: null,
                      defaultDate: day,
                      defaultTime: "09:00",
                    });
                  }}
                />
              ) : (
                <MonthBoard
                  anchorDate={currentDate}
                  slotsByDate={slotsByDate}
                  onDaySelect={(day) => {
                    setCurrentDate(day);
                    setView("day");
                  }}
                  onSlotClick={(slot) => setSelectedSlotId(slot.id)}
                />
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-[28px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(0,191,165,0.16),rgba(13,17,23,0.18))] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Контроль</p>
                <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">{slots.length}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">занятий в текущем диапазоне</p>
              </div>

              <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
                <p className="text-sm font-semibold text-[var(--text-main)]">Справочники</p>
                <div className="mt-4 space-y-3 text-sm text-[var(--text-main)]">
                  <div className="flex items-center justify-between rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3">
                    <span>Виды тренировок</span>
                    <span className="text-[var(--accent)]">{trainingTypes.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3">
                    <span>Активные тренеры</span>
                    <span className="text-[var(--accent)]">{trainers.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3">
                    <span>Услуги для списания</span>
                    <span className="text-[var(--accent)]">{services.length}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
                <p className="text-sm font-semibold text-[var(--text-main)]">Подсказки</p>
                <ul className="mt-4 space-y-3 text-sm text-[var(--text-muted)]">
                  <li>В дневном виде можно кликнуть по свободному времени и сразу создать слот.</li>
                  <li>Запись клиента не списывает абонемент. Списание происходит только при отметке посещения.</li>
                  <li>Неотмеченные записи после окончания занятия автоматически переходят в статус “Пропустил”.</li>
                </ul>
              </div>
            </aside>
          </section>
        </>
      ) : pageTab === "gym" ? (
        <GymAccessPanel canManageHours={canManageGymHours} onNotice={(nextBanner) => setBanner(nextBanner)} />
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col gap-4 rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-lg font-semibold text-[var(--text-main)]">Тренеры</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Контакты, био и привязка к видам тренировок</p>
            </div>

            {canManageTrainers ? (
              <button
              type="button"
              onClick={() => {
                setEditingTrainer(null);
                setTrainerModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110"
            >
              <PlusIcon />
              Новый тренер
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {trainers.length === 0 ? (
              <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
                Тренеров пока нет
              </div>
            ) : (
              trainers.map((trainer) => (
                <div key={trainer.id} className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xl font-semibold text-[var(--text-main)]">
                        {trainer.last_name} {trainer.first_name}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-muted)]">
                        <span>{trainer.phone || "Телефон не указан"}</span>
                        {trainer.email && (
                          <>
                            <span>•</span>
                            <span>{trainer.email}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {canManageTrainers ? (
                      <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTrainer(trainer);
                          setTrainerModalOpen(true);
                        }}
                        className="rounded-[16px] border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTrainer(trainer.id)}
                        disabled={deletingTrainerId === trainer.id}
                        className="rounded-[16px] border border-[rgba(248,81,73,0.24)] px-3 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.12)] disabled:opacity-50"
                      >
                        {deletingTrainerId === trainer.id ? "Удаляем..." : "Удалить"}
                      </button>
                      </div>
                    ) : null}
                  </div>

                  <p className="mt-4 text-sm text-[var(--text-muted)]">{trainer.bio || "Описание пока не добавлено"}</p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {trainer.training_types.length > 0 ? (
                      trainer.training_types.map((type) => (
                        <span
                          key={type.id}
                          className="rounded-full border px-3 py-1 text-xs"
                          style={{
                            borderColor: withAlpha(type.color || "#00BCD4", "66", "rgba(0,191,165,0.36)"),
                            backgroundColor: withAlpha(type.color || "#00BCD4", "18", "rgba(0,191,165,0.12)"),
                            color: type.color || "#00BCD4",
                          }}
                        >
                          {type.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-[var(--text-muted)]">Виды тренировок не выбраны</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <SlotEditorModal
        state={slotEditorState}
        trainingTypes={trainingTypes}
        trainers={trainers}
        services={services}
        onClose={() => setSlotEditorState(null)}
        onSaved={(message) => {
          setSlotEditorState(null);
          refreshPage();
          setBanner({ tone: "success", text: message });
        }}
      />

      {trainerModalOpen && (
        <TrainerFormModal
          trainer={editingTrainer}
          trainingTypes={trainingTypes}
          onClose={() => {
            setTrainerModalOpen(false);
            setEditingTrainer(null);
          }}
          onSaved={(message) => {
            setTrainerModalOpen(false);
            setEditingTrainer(null);
            refreshPage();
            setBanner({ tone: "success", text: message });
          }}
        />
      )}

      <SlotDetailsModal
        slotId={selectedSlotId}
        canManageSchedule={canManageSchedule}
        onClose={() => setSelectedSlotId(null)}
        onEdit={(slot) => {
          setSelectedSlotId(null);
          setSlotEditorState({
            slot,
            defaultDate: parseIsoDate(slot.date),
            defaultTime: formatTime(slot.start_time),
          });
        }}
        onChanged={() => {
          refreshPage();
        }}
        onNotice={(nextBanner) => setBanner(nextBanner)}
      />
    </div>
  );
}

