"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DayTimeline, MonthBoard, WeekBoard } from "@/components/schedule/calendar-views";
import { GymSidebarBlock } from "@/components/schedule/gym-sidebar-block";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  type BannerState,
  formatTime,
  getBannerClass,
  getRangeForView,
  getViewTitle,
  groupSlotsByDate,
  parseIsoDate,
  parseTimeToMinutes,
  addMinutesToTime,
  PlusIcon,
  type CalendarView,
  shiftDateByView,
  type SlotEditorState,
  toIsoDate,
  viewOptions,
} from "@/components/schedule/schedule-shared";
import { DatePickerPopover } from "@/components/schedule/date-picker-popover";
import { SlotDetailsModal } from "@/components/schedule/slot-details-modal";
import { SlotEditorModal } from "@/components/schedule/slot-editor-modal";
import { hasModuleAccess, type AuthModulePermission } from "@/lib/access";
import { fetchProducts, type Product } from "@/lib/api/products";
import { fetchScheduleSlots, type ScheduleSlot } from "@/lib/api/schedule";
import { fetchTrainers, type Trainer } from "@/lib/api/trainers";
import { fetchTrainingTypes, type TrainingType } from "@/lib/api/training-types";

export default function SchedulePage() {
  const [currentModules, setCurrentModules] = useState<AuthModulePermission[]>([]);
  const [view, setView] = useState<CalendarView>("day");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);
  const [slotsReloadToken, setSlotsReloadToken] = useState(0);
  const silentSlotsReloadRef = useRef(false);

  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [services, setServices] = useState<Product[]>([]);
  const [supportLoading, setSupportLoading] = useState(true);

  const [slotEditorState, setSlotEditorState] = useState<SlotEditorState>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const range = useMemo(() => getRangeForView(view, currentDate), [currentDate, view]);
  const slotsByDate = useMemo(() => groupSlotsByDate(slots), [slots]);
  const selectedDayKey = toIsoDate(currentDate);
  const visibleDaySlots = slotsByDate.get(selectedDayKey) ?? [];

  // Занятие, идущее прямо сейчас (только для сегодня)
  const liveSlot = useMemo(() => {
    const todayKey = toIsoDate(new Date());
    const todaySlots = slotsByDate.get(todayKey) ?? [];
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return todaySlots.find((s) => {
      if (s.status === "cancelled") return false;
      const start = parseTimeToMinutes(s.start_time);
      const end = start + s.duration_minutes;
      return nowMin >= start && nowMin < end;
    }) ?? null;
  }, [slotsByDate]);

  const canManageSchedule =
    hasModuleAccess(currentModules, "schedule_edit_groups") ||
    hasModuleAccess(currentModules, "schedule_edit_personal");
  const canCancelSlot = hasModuleAccess(currentModules, "schedule_cancel");
  const canManageClients = hasModuleAccess(currentModules, "schedule_clients");
  const canManageAttendance = hasModuleAccess(currentModules, "schedule_attendance");
  const canGymAccess = hasModuleAccess(currentModules, "schedule_gym");

  useEffect(() => {
    let cancelled = false;

    fetch("/auth-api/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return [];
        const data = (await response.json()) as { data?: { user?: { modules?: AuthModulePermission[] } } };
        return data.data?.user?.modules ?? [];
      })
      .then((modules) => { if (!cancelled) setCurrentModules(modules); })
      .catch(() => { if (!cancelled) setCurrentModules([]); });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSupportLoading(true);

    Promise.all([fetchTrainingTypes(), fetchTrainers(), fetchProducts({ type: "service" })])
      .then(([loadedTrainingTypes, loadedTrainers, loadedServices]) => {
        if (cancelled) return;
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
      .finally(() => { if (!cancelled) setSupportLoading(false); });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const silentReload = silentSlotsReloadRef.current;
    silentSlotsReloadRef.current = false;

    if (!silentReload) {
      setSlotsLoading(true);
    }
    setError(null);

    fetchScheduleSlots({ date_from: range.from, date_to: range.to })
      .then((response) => { if (!cancelled) setSlots(response); })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить расписание");
        }
      })
      .finally(() => { if (!cancelled) setSlotsLoading(false); });

    return () => { cancelled = true; };
  }, [range.from, range.to, slotsReloadToken]);

  function refreshPage() {
    silentSlotsReloadRef.current = true;
    setSlotsReloadToken((value) => value + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">
          Расписание
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Календарь занятий, запись клиентов и посещаемость.
        </p>
      </div>

      {/* Live-баннер: идёт занятие прямо сейчас */}
      {liveSlot && (
        <div
          className="flex items-center gap-3 rounded-[0.75rem] px-[18px] py-[10px]"
          style={{ background: "rgba(255,116,57,0.08)" }}
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--energy)]"
            style={{ animation: "pulse-glow 2s infinite" }}
          />
          <span className="text-[13px] font-medium text-[var(--energy)]">
            Занятие идёт сейчас&nbsp;·&nbsp;
            {liveSlot.training_type_name || liveSlot.slot_type}&nbsp;
            {formatTime(liveSlot.start_time)}–{addMinutesToTime(liveSlot.start_time, liveSlot.duration_minutes)}
            {liveSlot.trainer_name ? `\u00a0·\u00a0${liveSlot.trainer_name}` : ""}
          </span>
        </div>
      )}

      {banner && (
        <div className={`rounded-[1.5rem] px-4 py-3 text-sm ${getBannerClass(banner.tone)}`}>
          {banner.text}
        </div>
      )}

      <section
        className="rounded-[2rem] p-5"
        style={{ background: "var(--bg-card)", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-flex rounded-full p-1" style={{ background: "var(--bg-card-soft)" }}>
            {viewOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setView(option.value)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  view === option.value
                    ? ""
                    : "text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.07)] hover:text-[var(--text-main)]"
                }`}
                style={
                  view === option.value
                    ? { background: "var(--accent-grad)", color: "var(--text-inverse)" }
                    : {}
                }
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
                className="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-main)]"
                aria-label="Назад"
              >
                <ChevronLeftIcon />
              </button>
              <button
                type="button"
                onClick={() => setCurrentDate(new Date())}
                className="rounded-[1rem] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-main)]"
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => setCurrentDate((value) => shiftDateByView(value, view, 1))}
                className="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-main)]"
                aria-label="Вперёд"
              >
                <ChevronRightIcon />
              </button>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setDatePickerOpen((v) => !v)}
                className={`group relative min-w-[230px] overflow-hidden rounded-[1.25rem] px-4 py-3 text-center text-sm font-medium transition-colors ${
                  datePickerOpen ? "text-[var(--accent)]" : "text-[var(--text-main)]"
                }`}
                style={{ background: "var(--bg-card-soft)" }}
              >
                <span className="absolute inset-0 bg-white/0 transition-colors group-hover:bg-white/[0.06]" />
                <span className="relative">{getViewTitle(view, currentDate)}</span>
              </button>
              {datePickerOpen && (
                <DatePickerPopover
                  value={currentDate}
                  onChange={(date) => setCurrentDate(date)}
                  onClose={() => setDatePickerOpen(false)}
                />
              )}
            </div>

            {canManageSchedule && (
              <button
                type="button"
                onClick={() => setSlotEditorState({ slot: null, defaultDate: currentDate, defaultTime: "09:00" })}
                className="inline-flex items-center justify-center gap-2 rounded-[1.25rem] px-5 py-3 text-sm font-semibold transition-all hover:brightness-110"
                style={{ background: "var(--accent-grad)", color: "var(--text-inverse)", boxShadow: "0 4px 16px rgba(94,244,216,0.25)" }}
              >
                <PlusIcon />
                Добавить
              </button>
            )}
          </div>
        </div>
      </section>

      <GymSidebarBlock canGymAccess={canGymAccess} onNotice={(notice) => setBanner(notice)} />

      <section className="space-y-4">
        {error && (
          <div className="rounded-[22px] border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        {slotsLoading || supportLoading ? (
          <div className="rounded-[2rem] px-6 py-20 text-center text-sm text-[var(--text-muted)]" style={{ background: "var(--bg-card)" }}>
            Загружаем расписание...
          </div>
        ) : view === "day" ? (
          <DayTimeline
            date={currentDate}
            slots={visibleDaySlots}
            onSlotClick={(slot) => setSelectedSlotId(slot.id)}
            onEmptyClick={(dateValue, startTime) => {
              if (!canManageSchedule) return;
              setSlotEditorState({ slot: null, defaultDate: dateValue, defaultTime: startTime });
            }}
          />
        ) : view === "week" ? (
          <WeekBoard
            anchorDate={currentDate}
            slotsByDate={slotsByDate}
            onSlotClick={(slot) => setSelectedSlotId(slot.id)}
            onDaySelect={(day) => { setCurrentDate(day); setView("day"); }}
            onCreate={(day) => {
              if (!canManageSchedule) return;
              setSlotEditorState({ slot: null, defaultDate: day, defaultTime: "09:00" });
            }}
          />
        ) : (
          <MonthBoard
            anchorDate={currentDate}
            slotsByDate={slotsByDate}
            onDaySelect={(day) => { setCurrentDate(day); setView("day"); }}
            onSlotClick={(slot) => setSelectedSlotId(slot.id)}
          />
        )}
      </section>

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

      <SlotDetailsModal
        slotId={selectedSlotId}
        canEditSchedule={canManageSchedule}
        canCancelSlot={canCancelSlot}
        canManageClients={canManageClients}
        canManageAttendance={canManageAttendance}
        onClose={() => setSelectedSlotId(null)}
        onEdit={(slot) => {
          setSelectedSlotId(null);
          setSlotEditorState({
            slot,
            defaultDate: parseIsoDate(slot.date),
            defaultTime: formatTime(slot.start_time),
          });
        }}
        onChanged={refreshPage}
        onNotice={(nextBanner) => setBanner(nextBanner)}
      />
    </div>
  );
}
