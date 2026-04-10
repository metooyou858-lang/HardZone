import { ScheduleSlot, SlotType } from "@/lib/api/schedule";

const PAGE_START_HOUR = 6;
const PAGE_END_HOUR = 22;
const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: PAGE_END_HOUR - PAGE_START_HOUR + 1 }, (_, index) => PAGE_START_HOUR + index);
const WEEKDAY_OPTIONS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 7, label: "Вс" },
];

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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const day = date.getDay() === 0 ? 7 : date.getDay();
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), 1 - day);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
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

function getDayOfWeek(date: Date) {
  return date.getDay() === 0 ? 7 : date.getDay();
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function roundTimeFromMinutes(minutes: number) {
  const rounded = Math.max(PAGE_START_HOUR * 60, Math.min(PAGE_END_HOUR * 60, Math.round(minutes / 15) * 15));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return `${pad(hours)}:${pad(mins)}`;
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function addMinutesToTime(value: string, minutesToAdd: number) {
  const totalMinutes = parseTimeToMinutes(value) + minutesToAdd;
  const safeMinutes = Math.max(0, totalMinutes);
  const hours = Math.floor(safeMinutes / 60) % 24;
  const minutes = safeMinutes % 60;
  return `${pad(hours)}:${pad(minutes)}`;
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

function formatWeekdayLong(date: Date) {
  return new Intl.DateTimeFormat("ru", {
    weekday: "long",
  }).format(date);
}

function getSlotColor(slot: Pick<ScheduleSlot, "training_type_color">) {
  return slot.training_type_color || "#00BCD4";
}

function withAlpha(color: string | null | undefined, alpha: string, fallback: string) {
  if (!color) {
    return fallback;
  }

  const normalized = color.trim();

  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return `${normalized}${alpha}`;
  }

  if (/^#[0-9A-Fa-f]{3}$/.test(normalized)) {
    const expanded = `#${normalized
      .slice(1)
      .split("")
      .map((chunk) => `${chunk}${chunk}`)
      .join("")}`;
    return `${expanded}${alpha}`;
  }

  return fallback;
}

function getSlotTypeLabel(slotType: SlotType) {
  return slotType === "personal" ? "Персональное" : "Групповое";
}

export function DayTimeline({
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

export function WeekBoard({
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

export function MonthBoard({
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
        {WEEKDAY_OPTIONS.map((day) => (
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
