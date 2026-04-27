"use client";

import { useEffect, useRef, useState } from "react";

const MONTH_NAMES = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const WEEK_DAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

export function DatePickerPopover({
  value,
  onChange,
  onClose,
}: {
  value: Date;
  onChange: (date: Date) => void;
  onClose: () => void;
}) {
  const [pickerMonth, setPickerMonth] = useState(new Date(value.getFullYear(), value.getMonth(), 1));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [onClose]);

  const year = pickerMonth.getFullYear();
  const month = pickerMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7; // Пн=0

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const today = new Date();
  const isSameDay = (d: number) =>
    value.getFullYear() === year && value.getMonth() === month && value.getDate() === d;
  const isToday = (d: number) =>
    today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  return (
    <div
      ref={containerRef}
      className="absolute left-1/2 top-[calc(100%+8px)] z-50 w-72 -translate-x-1/2 rounded-[1.5rem] border border-[var(--line-soft)] p-4 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
      style={{ background: "var(--bg-card)" }}
    >
      {/* Шапка с месяцем */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPickerMonth(new Date(year, month - 1, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-main)]"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path d="m12 5-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-[var(--text-main)]">
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={() => setPickerMonth(new Date(year, month + 1, 1))}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-main)]"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path d="m8 5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Дни недели */}
      <div className="mb-1 grid grid-cols-7">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {d}
          </div>
        ))}
      </div>

      {/* Сетка дней */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const selected = isSameDay(day);
          const todayMark = isToday(day);
          return (
            <button
              key={i}
              type="button"
              onClick={() => { onChange(new Date(year, month, day)); onClose(); }}
              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all ${
                selected
                  ? "font-semibold text-[#062b26]"
                  : todayMark
                  ? "font-medium text-[var(--accent)] ring-1 ring-[var(--accent)] ring-inset hover:bg-[rgba(94,244,216,0.15)]"
                  : "text-[var(--text-main)] hover:bg-[rgba(255,255,255,0.08)]"
              }`}
              style={selected ? { background: "var(--accent-grad)" } : {}}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Кнопка Сегодня */}
      <div className="mt-3 border-t border-[var(--line-soft)] pt-3">
        <button
          type="button"
          onClick={() => { onChange(new Date()); onClose(); }}
          className="w-full rounded-xl py-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-main)]"
        >
          Сегодня
        </button>
      </div>
    </div>
  );
}
