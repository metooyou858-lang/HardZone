"use client";

import { useEffect, useState } from "react";

import {
  addDays,
  addMinutesToTime as addMin,
  formatDateLabel as fmtDateLong,
  formatTime as fmtTime,
  getDayOfWeek as getDow,
  getMonthGrid,
  getSlotColor as slotColor,
  getSlotTypeLabel as slotTypeLabel,
  PAGE_END_HOUR,
  PAGE_START_HOUR,
  parseTimeToMinutes as parseMin,
  startOfWeek,
  toIsoDate,
  withAlpha,
} from "@/components/schedule/schedule-shared";
import { ScheduleSlot } from "@/lib/api/schedule";

// ─── Константы (специфичные для календарных видов) ───────────────────────────
const DAY_HOUR_H = 56;   // px на час в дневном виде
const WEEK_HOUR_H = 72;  // px на час в недельном виде
const HOURS = Array.from({ length: PAGE_END_HOUR - PAGE_START_HOUR }, (_, i) => PAGE_START_HOUR + i);
const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

// ─── Утилита (локальная, только для сетки) ───────────────────────────────────
function pad(n: number) { return String(n).padStart(2, "0"); }
function roundMin(min: number) {
  const r = Math.max(PAGE_START_HOUR * 60, Math.min(PAGE_END_HOUR * 60, Math.round(min / 15) * 15));
  return `${pad(Math.floor(r / 60))}:${pad(r % 60)}`;
}

// ─── Хук: позиция текущего времени ───────────────────────────────────────────
function useNowTop(date: Date, pxPerMin: number) {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    function calc() {
      const now = new Date();
      const same = now.getFullYear() === date.getFullYear() && now.getMonth() === date.getMonth() && now.getDate() === date.getDate();
      if (!same) { setTop(null); return; }
      setTop((now.getHours() * 60 + now.getMinutes() - PAGE_START_HOUR * 60) * pxPerMin);
    }
    calc();
    const id = setInterval(calc, 60_000);
    return () => clearInterval(id);
  }, [date, pxPerMin]);
  return top;
}

// ─── Shared: карточка слота ───────────────────────────────────────────────────
function SlotCard({
  slot,
  height,
  hovered = false,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  slot: ScheduleSlot;
  height?: number;
  hovered?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClick: () => void;
}) {
  const color = slotColor(slot);
  const compact = height !== undefined && height < 52;
  const showBottom = height === undefined || height >= 72;
  const cancelled = slot.status === "cancelled";

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="group relative w-full overflow-hidden text-left transition-all"
      style={{
        borderRadius: "0.75rem",
        background: hovered
          ? withAlpha(color, "30", "rgba(94,244,216,0.20)")
          : withAlpha(color, "18", "rgba(94,244,216,0.11)"),
        opacity: cancelled ? 0.5 : 1,
        padding: compact ? "4px 8px 4px 12px" : "8px 10px 8px 12px",
        transform: hovered ? "translateY(-1px)" : undefined,
        boxShadow: hovered ? `0 8px 24px ${withAlpha(color, "40", "rgba(94,244,216,0.25)")}` : undefined,
      }}
    >
      {/* лезвие */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 top-0 w-1"
        style={{ backgroundColor: color, borderRadius: "0.75rem 0 0 0.75rem", opacity: hovered ? 1 : 0.8 }}
      />
      {/* категория */}
      <p className="truncate text-[8px] font-black uppercase tracking-[0.18em]" style={{ color }}>
        {cancelled ? "ОТМЕНЕНО · " : ""}{slot.training_type_name || slotTypeLabel(slot.slot_type)}
      </p>
      {/* время */}
      {!compact && (
        <p className="mt-0.5 truncate text-xs font-bold text-[var(--text-main)]" style={{ fontFamily: "var(--font-heading)" }}>
          {fmtTime(slot.start_time)}
          {height !== undefined && height >= 56 ? ` — ${addMin(slot.start_time, slot.duration_minutes)}` : ""}
        </p>
      )}
      {/* тренер + счётчик */}
      {showBottom && (
        <div className="mt-1 flex items-center justify-between gap-1">
          <span className="truncate text-[9px] text-[var(--text-muted)]">{slot.trainer_name || "Без тренера"}</span>
          <span className="shrink-0 text-[9px] font-bold" style={{ color }}>{slot.booked_count}/{slot.capacity}</span>
        </div>
      )}
    </button>
  );
}

// ─── Сетка часов (фон) ───────────────────────────────────────────────────────
function HourLines({ hourH }: { hourH: number }) {
  return (
    <>
      {HOURS.map((_, i) => (
        <div
          key={i}
          className="pointer-events-none absolute inset-x-0"
          style={{ top: `${i * hourH}px`, borderTop: "1px solid rgba(255,255,255,0.05)" }}
        />
      ))}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DayTimeline
// ════════════════════════════════════════════════════════════════════════════
export function DayTimeline({
  date,
  slots,
  onSlotClick,
  onEmptyClick,
}: {
  date: Date;
  slots: ScheduleSlot[];
  onSlotClick: (slot: ScheduleSlot) => void;
  onEmptyClick: (date: Date, startTime: string) => void;
}) {
  const totalH = HOURS.length * DAY_HOUR_H;
  const pxPerMin = DAY_HOUR_H / 60;
  const nowTop = useNowTop(date, pxPerMin);
  const [hoverRow, setHoverRow] = useState<number | null>(null);  // полчаса-строка
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);

  const hoveredSlot = hoveredSlotId ? slots.find(s => s.id === hoveredSlotId) ?? null : null;
  const hoverTop    = hoveredSlot ? (parseMin(hoveredSlot.start_time) - PAGE_START_HOUR * 60) * pxPerMin : null;
  const hoverH      = hoveredSlot ? hoveredSlot.duration_minutes * pxPerMin : null;
  const hoverColor  = hoveredSlot ? slotColor(hoveredSlot) : null;

  return (
    <div className="overflow-hidden rounded-[2rem]" style={{ background: "var(--bg-card)", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
      {/* Заголовок */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <p className="text-sm font-semibold text-[var(--text-main)]" style={{ fontFamily: "var(--font-heading)" }}>
            {fmtDateLong(date)}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">Клик по сетке создаёт занятие</p>
        </div>
        <div className="rounded-full px-3 py-1 text-xs text-[var(--text-muted)]" style={{ background: "var(--bg-card-soft)" }}>
          {slots.length} занятий
        </div>
      </div>

      {/* Сетка */}
      <div className="grid" style={{ gridTemplateColumns: "56px minmax(0,1fr)" }}>

        {/* Колонка меток времени */}
        <div className="relative select-none" style={{ height: `${totalH}px` }}>
          {/* часы */}
          {HOURS.map((hour, i) => (
            <div key={hour} className="absolute inset-x-0 flex items-center justify-center"
              style={{ top: `${i * DAY_HOUR_H}px`, height: `${DAY_HOUR_H / 2}px` }}>
              <span className="text-[10px] font-bold tabular-nums"
                style={{ color: hoveredSlot && parseMin(hoveredSlot.start_time) <= hour * 60 && hour * 60 < parseMin(hoveredSlot.start_time) + hoveredSlot.duration_minutes ? "var(--accent)" : "var(--text-muted)" }}>
                {pad(hour)}:00
              </span>
            </div>
          ))}
          {/* полчаса */}
          {HOURS.map((hour, i) => (
            <div key={`h-${hour}`} className="absolute inset-x-0 flex items-center justify-center"
              style={{ top: `${i * DAY_HOUR_H + DAY_HOUR_H / 2}px`, height: `${DAY_HOUR_H / 2}px` }}>
              <span className="text-[9px] tabular-nums text-[var(--text-muted)] opacity-50">{pad(hour)}:30</span>
            </div>
          ))}

          {/* Подсветка диапазона при ховере на слот */}
          {hoverTop !== null && hoverH !== null && hoverColor && (
            <div
              className="pointer-events-none absolute left-1 right-0 rounded-l transition-all"
              style={{ top: `${hoverTop}px`, height: `${hoverH}px`, background: `${hoverColor}22` }}
            />
          )}

          {/* Линия "сейчас" — маркер */}
          {nowTop !== null && nowTop >= 0 && nowTop <= totalH && (
            <span className="absolute right-1 text-[9px] font-bold text-[var(--accent)]" style={{ top: `${nowTop - 6}px` }}>●</span>
          )}
        </div>

        {/* Область кликов + слоты */}
        <div
          className="relative overflow-hidden"
          style={{ height: `${totalH}px`, background: "var(--bg-card-soft)", borderRadius: "0 0 2rem 0" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onEmptyClick(date, roundMin(PAGE_START_HOUR * 60 + (e.clientY - rect.top) / pxPerMin));
          }}
          onMouseMove={(e) => {
            if (hoveredSlotId) return;
            const rect = e.currentTarget.getBoundingClientRect();
            setHoverRow(Math.floor((e.clientY - rect.top) / (DAY_HOUR_H / 2)));
          }}
          onMouseLeave={() => { setHoverRow(null); }}
        >
          {/* Линии часов */}
          {HOURS.map((_, i) => (
            <div key={i} className="pointer-events-none absolute inset-x-0"
              style={{ top: `${i * DAY_HOUR_H}px`, borderTop: "1px solid rgba(255,255,255,0.07)" }} />
          ))}
          {/* Линии полчаса */}
          {HOURS.map((_, i) => (
            <div key={`hh-${i}`} className="pointer-events-none absolute inset-x-0"
              style={{ top: `${i * DAY_HOUR_H + DAY_HOUR_H / 2}px`, borderTop: "1px dashed rgba(255,255,255,0.04)" }} />
          ))}

          {/* hover-полоска по сетке (только когда нет ховера на слот) */}
          {!hoveredSlotId && hoverRow !== null && (
            <div
              className="pointer-events-none absolute inset-x-0"
              style={{ top: `${hoverRow * (DAY_HOUR_H / 2)}px`, height: `${DAY_HOUR_H / 2}px`, background: "rgba(94,244,216,0.04)" }}
            />
          )}

          {/* Линия "сейчас" */}
          {nowTop !== null && nowTop >= 0 && nowTop <= totalH && (
            <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: `${nowTop}px` }}>
              <div className="relative">
                <div className="absolute left-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_3px_rgba(94,244,216,0.45)]" />
                <div className="ml-2.5 h-px" style={{ background: "linear-gradient(90deg,rgba(94,244,216,0.8),rgba(94,244,216,0.05))" }} />
              </div>
            </div>
          )}

          {/* Слоты */}
          {slots.map((slot) => {
            const top = (parseMin(slot.start_time) - PAGE_START_HOUR * 60) * pxPerMin;
            const h = slot.duration_minutes * pxPerMin;
            const isHovered = hoveredSlotId === slot.id;
            const color = slotColor(slot);
            return (
              <div
                key={slot.id}
                className="absolute z-10 transition-transform"
                style={{
                  top: `${top + 2}px`,
                  height: `${Math.max(h - 4, 24)}px`,
                  left: 8,
                  right: 8,
                  transform: isHovered ? "scaleX(1.01)" : undefined,
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseEnter={() => { setHoveredSlotId(slot.id); setHoverRow(null); }}
                onMouseLeave={() => setHoveredSlotId(null)}
              >
                <SlotCard slot={slot} height={Math.max(h - 4, 24)} hovered={isHovered} onClick={() => onSlotClick(slot)} />

                {/* Метки времени при ховере */}
                {isHovered && (
                  <>
                    <div
                      className="pointer-events-none absolute -left-[62px] flex items-center justify-end pr-2 text-[10px] font-bold tabular-nums"
                      style={{ top: 0, height: 20, color }}
                    >
                      {fmtTime(slot.start_time)}
                    </div>
                    <div
                      className="pointer-events-none absolute -left-[62px] flex items-center justify-end pr-2 text-[10px] font-bold tabular-nums"
                      style={{ bottom: 0, height: 20, color }}
                    >
                      {addMin(slot.start_time, slot.duration_minutes)}
                    </div>
                    {/* боковая полоса */}
                    <div
                      className="pointer-events-none absolute -left-[3px] top-0 bottom-0 w-0.5 rounded-full"
                      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// WeekBoard — тайм-грид
// ════════════════════════════════════════════════════════════════════════════
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
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchorDate), i));
  const todayKey = toIsoDate(new Date());
  const totalH = HOURS.length * WEEK_HOUR_H;
  const pxPerMin = WEEK_HOUR_H / 60;
  const COLS = "56px repeat(7, minmax(0,1fr))";
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);
  const allSlots = days.flatMap(d => slotsByDate.get(toIsoDate(d)) ?? []);
  const hoveredSlot = hoveredSlotId ? allSlots.find(s => s.id === hoveredSlotId) ?? null : null;
  const hoverTop  = hoveredSlot ? (parseMin(hoveredSlot.start_time) - PAGE_START_HOUR * 60) * pxPerMin : null;
  const hoverH    = hoveredSlot ? hoveredSlot.duration_minutes * pxPerMin : null;
  const hoverColor = hoveredSlot ? slotColor(hoveredSlot) : null;

  return (
    <div className="overflow-hidden rounded-[2rem]" style={{ background: "var(--bg-card)", boxShadow: "0 20px 60px rgba(0,0,0,0.35)" }}>

      {/* Всё в одном скроллируемом контейнере — шапка sticky */}
      <div className="overflow-y-auto" style={{ maxHeight: 660 }}>
        <div className="grid" style={{ gridTemplateColumns: COLS }}>

          {/* sticky-шапка: угловая ячейка */}
          <div
            className="sticky top-0 z-20"
            style={{
              background: "var(--bg-card)",
              borderRight: "1px solid rgba(255,255,255,0.07)",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}
          />

          {/* sticky-шапка: дни */}
          {days.map((day) => {
            const key = toIsoDate(day);
            const isToday = key === todayKey;
            const isWeekend = getDow(day) >= 6;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onDaySelect(day)}
                className="sticky top-0 z-20 relative py-4 text-center transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                style={{
                  borderLeft: "1px solid rgba(255,255,255,0.07)",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                  background: isToday ? "rgba(94,244,216,0.09)" : "var(--bg-card)",
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: isToday ? "var(--accent)" : isWeekend ? "var(--atmos)" : "var(--text-muted)" }}>
                  {WEEKDAY_SHORT[getDow(day) - 1]}
                </p>
                <p className="mt-0.5 text-xl font-bold"
                  style={{ fontFamily: "var(--font-heading)", color: isToday ? "var(--accent)" : "var(--text-main)" }}>
                  {day.getDate()}
                </p>
                {isToday && (
                  <div className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-[var(--accent)]" />
                )}
              </button>
            );
          })}


          {/* Метки времени */}
          <div className="relative select-none" style={{ height: `${totalH}px`, borderRight: "1px solid rgba(255,255,255,0.07)" }}>
            {/* подсветка диапазона при ховере */}
            {hoverTop !== null && hoverH !== null && hoverColor && (
              <div className="pointer-events-none absolute left-1 right-0 rounded-l transition-all"
                style={{ top: `${hoverTop}px`, height: `${hoverH}px`, background: `${hoverColor}22` }} />
            )}
            {HOURS.map((hour, i) => {
              const inRange = hoveredSlot
                && hour * 60 >= parseMin(hoveredSlot.start_time)
                && hour * 60 < parseMin(hoveredSlot.start_time) + hoveredSlot.duration_minutes;
              return (
                <div key={hour} className="absolute inset-x-0 flex items-center justify-center"
                  style={{ top: `${i * WEEK_HOUR_H}px`, height: `${WEEK_HOUR_H}px` }}>
                  <span className="text-[10px] font-bold tabular-nums transition-colors"
                    style={{ color: inRange ? hoverColor! : "var(--text-muted)" }}>
                    {pad(hour)}:00
                  </span>
                </div>
              );
            })}
            {/* точные метки начала/конца — только если время не совпадает с целым часом */}
            {hoveredSlot && hoverTop !== null && hoverH !== null && hoverColor && (() => {
              const startMin = parseMin(hoveredSlot.start_time) % 60;
              const endMin = parseMin(addMin(hoveredSlot.start_time, hoveredSlot.duration_minutes)) % 60;
              return (
                <>
                  {startMin !== 0 && (
                    <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center text-[10px] font-bold tabular-nums"
                      style={{ top: hoverTop, height: 20, color: hoverColor }}>
                      {fmtTime(hoveredSlot.start_time)}
                    </div>
                  )}
                  {endMin !== 0 && (
                    <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center text-[10px] font-bold tabular-nums"
                      style={{ top: hoverTop + hoverH - 20, height: 20, color: hoverColor }}>
                      {addMin(hoveredSlot.start_time, hoveredSlot.duration_minutes)}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Колонки */}
          {days.map((day) => {
            const key = toIsoDate(day);
            const isToday = key === todayKey;
            const isWeekend = getDow(day) >= 6;
            const slots = slotsByDate.get(key) ?? [];

            return (
              <div
                key={key}
                className="relative cursor-pointer"
                style={{
                  height: `${totalH}px`,
                  borderLeft: "1px solid rgba(255,255,255,0.07)",
                  background: isToday ? "rgba(94,244,216,0.03)" : isWeekend ? "rgba(144,147,255,0.025)" : undefined,
                }}
                onClick={() => onCreate(day)}
              >
                <HourLines hourH={WEEK_HOUR_H} />

                {slots.map((slot) => {
                  const top = (parseMin(slot.start_time) - PAGE_START_HOUR * 60) * pxPerMin;
                  const h = Math.max(slot.duration_minutes * pxPerMin, 28);
                  return (
                    <div
                      key={slot.id}
                      className="absolute"
                      style={{ top: `${top + 2}px`, height: `${h - 4}px`, left: 4, right: 4 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SlotCard
                        slot={slot}
                        height={h - 4}
                        hovered={hoveredSlotId === slot.id}
                        onMouseEnter={() => setHoveredSlotId(slot.id)}
                        onMouseLeave={() => setHoveredSlotId(null)}
                        onClick={() => onSlotClick(slot)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MonthBoard
// ════════════════════════════════════════════════════════════════════════════
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
  const [hoveredDayKey, setHoveredDayKey] = useState<string | null>(null);
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-[2rem]" style={{ background: "var(--bg-card)", boxShadow: "0 20px 40px rgba(0,0,0,0.25)" }}>
      {/* Заголовки дней */}
      <div className="grid grid-cols-7" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        {WEEKDAY_SHORT.map((d, i) => (
          <div key={i} className="py-3 text-center text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{
              color: i >= 5 ? "var(--atmos)" : "var(--text-muted)",
              borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.07)" : undefined,
            }}>
            {d}
          </div>
        ))}
      </div>

      {/* Ячейки */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          const key = toIsoDate(day);
          const slots = slotsByDate.get(key) ?? [];
          const isCurrentMonth = day.getMonth() === activeMonth;
          const isToday = key === todayKey;
          const isWeekend = getDow(day) >= 6;
          const isDayHovered = hoveredDayKey === key && !hoveredSlotId;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onDaySelect(day)}
              onMouseEnter={() => setHoveredDayKey(key)}
              onMouseLeave={() => setHoveredDayKey(null)}
              className="min-h-[120px] p-2.5 text-left transition-all"
              style={{
                borderLeft: idx % 7 !== 0 ? "1px solid rgba(255,255,255,0.07)" : undefined,
                borderTop: "1px solid rgba(255,255,255,0.07)",
                background: isToday
                  ? isDayHovered ? "rgba(94,244,216,0.12)" : "rgba(94,244,216,0.07)"
                  : isDayHovered
                    ? "rgba(255,255,255,0.06)"
                    : !isCurrentMonth
                      ? "rgba(0,0,0,0.15)"
                      : isWeekend
                        ? "rgba(144,147,255,0.025)"
                        : undefined,
                transform: isDayHovered ? "scale(0.99)" : undefined,
              }}
            >
              {/* Число */}
              <div
                className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold transition-all"
                style={{
                  fontFamily: "var(--font-heading)",
                  background: isToday ? "var(--accent)" : isDayHovered ? "rgba(255,255,255,0.1)" : "transparent",
                  color: isToday ? "var(--text-inverse)" : isCurrentMonth ? "var(--text-main)" : "var(--text-muted)",
                  opacity: isCurrentMonth ? 1 : 0.4,
                }}
              >
                {day.getDate()}
              </div>

              {/* Превью слотов */}
              <div className="space-y-1">
                {slots.slice(0, 3).map((slot) => {
                  const color = slotColor(slot);
                  const isSlotHovered = hoveredSlotId === slot.id;
                  return (
                    <div
                      key={slot.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onSlotClick(slot); }}
                      onMouseEnter={(e) => { e.stopPropagation(); setHoveredSlotId(slot.id); }}
                      onMouseLeave={() => setHoveredSlotId(null)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onSlotClick(slot); } }}
                      className="relative overflow-hidden pl-2.5 pr-2 py-1 transition-all"
                      style={{
                        borderRadius: "0.5rem",
                        background: isSlotHovered
                          ? withAlpha(color, "32", "rgba(94,244,216,0.22)")
                          : withAlpha(color, "18", "rgba(94,244,216,0.11)"),
                        transform: isSlotHovered ? "translateX(2px)" : undefined,
                        boxShadow: isSlotHovered ? `0 4px 12px ${withAlpha(color, "30", "rgba(94,244,216,0.2)")}` : undefined,
                      }}
                    >
                      <div className="pointer-events-none absolute bottom-0 left-0 top-0 w-0.5" style={{ backgroundColor: color }} />
                      <span className="text-[9px] font-bold" style={{ color }}>
                        {fmtTime(slot.start_time)}
                      </span>
                      <span className="ml-1 text-[9px] truncate" style={{ color: isSlotHovered ? "var(--text-main)" : "var(--text-muted)" }}>
                        {slot.training_type_name || slotTypeLabel(slot.slot_type)}
                      </span>
                    </div>
                  );
                })}
                {slots.length > 3 && (
                  <p className="text-[9px] font-medium text-[var(--text-muted)] pl-1">+{slots.length - 3} ещё</p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
