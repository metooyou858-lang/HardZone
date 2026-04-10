import type { ClientDetail } from "@/lib/api/clients";
import type { ScheduleBooking, ScheduleSlot, ScheduleSlotDetail, SlotType } from "@/lib/api/schedule";
export type PageTab = "schedule" | "gym" | "trainers";
export type CalendarView = "day" | "week" | "month";
export type EntryMode = "single" | "regular";
export type BannerTone = "info" | "success" | "error";

export type BannerState = {
  tone: BannerTone;
  text: string;
} | null;

export type SlotEditorState = {
  slot: ScheduleSlot | ScheduleSlotDetail | null;
  defaultDate: Date;
  defaultTime: string;
} | null;

const PAGE_START_HOUR = 6;
const PAGE_END_HOUR = 22;
const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: PAGE_END_HOUR - PAGE_START_HOUR + 1 }, (_, index) => PAGE_START_HOUR + index);

export const viewOptions: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Р”РµРЅСЊ" },
  { value: "week", label: "РќРµРґРµР»СЏ" },
  { value: "month", label: "РњРµСЃСЏС†" },
];

export const pageTabs: { value: PageTab; label: string }[] = [
  { value: "schedule", label: "Р Р°СЃРїРёСЃР°РЅРёРµ" },
  { value: "trainers", label: "РўСЂРµРЅРµСЂС‹" },
];

export const slotTypeOptions: { value: SlotType; label: string }[] = [
  { value: "group", label: "Р“СЂСѓРїРїРѕРІРѕРµ" },
  { value: "personal", label: "РџРµСЂСЃРѕРЅР°Р»СЊРЅРѕРµ" },
];

export const weekdayOptions = [
  { value: 1, label: "РџРЅ" },
  { value: 2, label: "Р’С‚" },
  { value: 3, label: "РЎСЂ" },
  { value: 4, label: "Р§С‚" },
  { value: 5, label: "РџС‚" },
  { value: 6, label: "РЎР±" },
  { value: 7, label: "Р’СЃ" },
];

const statusMeta = {
  confirmed: {
    label: "Р—Р°РїРёСЃР°РЅ",
    className: "border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.12)] text-[var(--accent)]",
  },
  attended: {
    label: "РџРѕСЃРµС‚РёР»",
    className: "border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]",
  },
  missed: {
    label: "РџСЂРѕРїСѓСЃС‚РёР»",
    className: "border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] text-[var(--warning)]",
  },
  cancelled: {
    label: "РћС‚РјРµРЅРµРЅР°",
    className: "border-[rgba(248,81,73,0.24)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]",
  },
} as const;

export function SearchIcon() {
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

export function CloseIcon() {
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

export function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="m12.5 15-5-5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="m7.5 5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon() {
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

export function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M10 4.167v11.666M4.167 10h11.666" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function normalizeDateValue(value: string) {
  return value.slice(0, 10);
}

export function parseIsoDate(value: string) {
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

export function getRangeForView(view: CalendarView, date: Date) {
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

export function getMonthBounds(date: Date) {
  return {
    from: toIsoDate(startOfMonth(date)),
    to: toIsoDate(endOfMonth(date)),
  };
}

export function getDayOfWeek(date: Date) {
  return date.getDay() === 0 ? 7 : date.getDay();
}

export function formatTime(value: string) {
  return value.slice(0, 5);
}

export function formatDateLabel(date: Date) {
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

export function getViewTitle(view: CalendarView, date: Date) {
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

export function shiftDateByView(date: Date, view: CalendarView, direction: -1 | 1) {
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

export function addMinutesToTime(value: string, minutesToAdd: number) {
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

export function getSlotColor(slot: Pick<ScheduleSlot, "training_type_color">) {
  return slot.training_type_color || "#00BCD4";
}

export function withAlpha(color: string | null | undefined, alpha: string, fallback: string) {
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

export function getBannerClass(tone: BannerTone) {
  if (tone === "success") {
    return "border-[rgba(63,185,80,0.35)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]";
  }

  if (tone === "error") {
    return "border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]";
  }

  return "border-[rgba(0,191,165,0.35)] bg-[rgba(0,191,165,0.12)] text-[var(--accent)]";
}

export function getSlotTypeLabel(slotType: SlotType) {
  if (slotType === "personal") {
    return "РџРµСЂСЃРѕРЅР°Р»СЊРЅРѕРµ";
  }

  if (slotType === "rental") {
    return "РђСЂРµРЅРґР°";
  }

  return "Р“СЂСѓРїРїРѕРІРѕРµ";
}

export function getBookingStatusMeta(status: ScheduleBooking["status"]) {
  return statusMeta[status] ?? statusMeta.confirmed;
}

export function getSubscriptionOptionLabel(subscription: ClientDetail["subscriptions"][number]) {
  const family = subscription.is_family ? " вЂў СЃРµРјРµР№РЅС‹Р№" : "";

  if (subscription.type === "single") {
    return `Р Р°Р·РѕРІРѕРµ${family}`;
  }

  if (subscription.type === "visits") {
    return `${subscription.visits_left ?? 0} Р·Р°РЅСЏС‚РёР№ РѕСЃС‚Р°Р»РѕСЃСЊ${family}`;
  }

  if (subscription.expires_at) {
    return `Р”Рѕ ${new Date(subscription.expires_at).toLocaleDateString("ru")}${family}`;
  }

  return `РђРєС‚РёРІРЅС‹Р№ Р°Р±РѕРЅРµРјРµРЅС‚${family}`;
}

export function groupSlotsByDate(slots: ScheduleSlot[]) {
  const grouped = new Map<string, ScheduleSlot[]>();

  for (const slot of slots) {
    const bucket = grouped.get(normalizeDateValue(slot.date)) ?? [];
    bucket.push(slot);
    bucket.sort((left, right) => parseTimeToMinutes(left.start_time) - parseTimeToMinutes(right.start_time));
    grouped.set(normalizeDateValue(slot.date), bucket);
  }

  return grouped;
}

