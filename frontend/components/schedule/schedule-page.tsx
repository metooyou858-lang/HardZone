"use client";

import { useEffect, useMemo, useState } from "react";

import { DayTimeline, MonthBoard, WeekBoard } from "@/components/schedule/calendar-views";
import { GymAccessPanel } from "@/components/schedule/gym-access-panel";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  type BannerState,
  formatTime,
  getBannerClass,
  getRangeForView,
  getViewTitle,
  groupSlotsByDate,
  pageTabs,
  parseIsoDate,
  PlusIcon,
  type CalendarView,
  type PageTab,
  shiftDateByView,
  type SlotEditorState,
  toIsoDate,
  viewOptions,
  withAlpha,
} from "@/components/schedule/schedule-shared";
import { SlotDetailsModal } from "@/components/schedule/slot-details-modal";
import { SlotEditorModal } from "@/components/schedule/slot-editor-modal";
import { TrainerFormModal } from "@/components/schedule/trainer-form-modal";
import { hasModuleAccess, type AuthModulePermission } from "@/lib/access";
import { fetchProducts, type Product } from "@/lib/api/products";
import { fetchScheduleSlots, type ScheduleSlot } from "@/lib/api/schedule";
import { deleteTrainer, fetchTrainers, type Trainer } from "@/lib/api/trainers";
import { fetchTrainingTypes, type TrainingType } from "@/lib/api/training-types";
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
            text: loadError instanceof Error ? loadError.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРїСЂР°РІРѕС‡РЅРёРєРё СЂР°СЃРїРёСЃР°РЅРёСЏ",
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
          setError(loadError instanceof Error ? loadError.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЂР°СЃРїРёСЃР°РЅРёРµ");
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
    if (!window.confirm("РЈРґР°Р»РёС‚СЊ С‚СЂРµРЅРµСЂР° РёР· Р°РєС‚РёРІРЅРѕРіРѕ СЃРїРёСЃРєР°?")) {
      return;
    }

    setDeletingTrainerId(id);

    try {
      await deleteTrainer(id);
      refreshPage();
      setBanner({ tone: "success", text: "РўСЂРµРЅРµСЂ СЃРєСЂС‹С‚ РёР· Р°РєС‚РёРІРЅРѕРіРѕ СЃРїРёСЃРєР°" });
    } catch (deleteError) {
      setBanner({
        tone: "error",
        text: deleteError instanceof Error ? deleteError.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ С‚СЂРµРЅРµСЂР°",
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
            Р Р°СЃРїРёСЃР°РЅРёРµ
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            РљР°Р»РµРЅРґР°СЂСЊ Р·Р°РЅСЏС‚РёР№, Р·Р°РїРёСЃСЊ РєР»РёРµРЅС‚РѕРІ, РїРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ Рё СѓРїСЂР°РІР»РµРЅРёРµ С‚СЂРµРЅРµСЂСЃРєРёРј СЃРѕСЃС‚Р°РІРѕРј.
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
            Р—Р°Р»
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
                    aria-label="РќР°Р·Р°Рґ"
                  >
                    <ChevronLeftIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentDate(new Date())}
                    className="rounded-[18px] border border-[var(--line-soft)] px-4 py-2.5 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                  >
                    РЎРµРіРѕРґРЅСЏ
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentDate((value) => shiftDateByView(value, view, 1))}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--line-soft)] text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                    aria-label="Р’РїРµСЂС‘Рґ"
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
                  Р”РѕР±Р°РІРёС‚СЊ
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
                  Р—Р°РіСЂСѓР¶Р°РµРј СЂР°СЃРїРёСЃР°РЅРёРµ...
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
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">РљРѕРЅС‚СЂРѕР»СЊ</p>
                <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">{slots.length}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Р·Р°РЅСЏС‚РёР№ РІ С‚РµРєСѓС‰РµРј РґРёР°РїР°Р·РѕРЅРµ</p>
              </div>

              <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
                <p className="text-sm font-semibold text-[var(--text-main)]">РЎРїСЂР°РІРѕС‡РЅРёРєРё</p>
                <div className="mt-4 space-y-3 text-sm text-[var(--text-main)]">
                  <div className="flex items-center justify-between rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3">
                    <span>Р’РёРґС‹ С‚СЂРµРЅРёСЂРѕРІРѕРє</span>
                    <span className="text-[var(--accent)]">{trainingTypes.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3">
                    <span>РђРєС‚РёРІРЅС‹Рµ С‚СЂРµРЅРµСЂС‹</span>
                    <span className="text-[var(--accent)]">{trainers.length}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3">
                    <span>РЈСЃР»СѓРіРё РґР»СЏ СЃРїРёСЃР°РЅРёСЏ</span>
                    <span className="text-[var(--accent)]">{services.length}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
                <p className="text-sm font-semibold text-[var(--text-main)]">РџРѕРґСЃРєР°Р·РєРё</p>
                <ul className="mt-4 space-y-3 text-sm text-[var(--text-muted)]">
                  <li>Р’ РґРЅРµРІРЅРѕРј РІРёРґРµ РјРѕР¶РЅРѕ РєР»РёРєРЅСѓС‚СЊ РїРѕ СЃРІРѕР±РѕРґРЅРѕРјСѓ РІСЂРµРјРµРЅРё Рё СЃСЂР°Р·Сѓ СЃРѕР·РґР°С‚СЊ СЃР»РѕС‚.</li>
                  <li>Р—Р°РїРёСЃСЊ РєР»РёРµРЅС‚Р° РЅРµ СЃРїРёСЃС‹РІР°РµС‚ Р°Р±РѕРЅРµРјРµРЅС‚. РЎРїРёСЃР°РЅРёРµ РїСЂРѕРёСЃС…РѕРґРёС‚ С‚РѕР»СЊРєРѕ РїСЂРё РѕС‚РјРµС‚РєРµ РїРѕСЃРµС‰РµРЅРёСЏ.</li>
                  <li>РќРµРѕС‚РјРµС‡РµРЅРЅС‹Рµ Р·Р°РїРёСЃРё РїРѕСЃР»Рµ РѕРєРѕРЅС‡Р°РЅРёСЏ Р·Р°РЅСЏС‚РёСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РїРµСЂРµС…РѕРґСЏС‚ РІ СЃС‚Р°С‚СѓСЃ вЂњРџСЂРѕРїСѓСЃС‚РёР»вЂќ.</li>
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
              <p className="text-lg font-semibold text-[var(--text-main)]">РўСЂРµРЅРµСЂС‹</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">РљРѕРЅС‚Р°РєС‚С‹, Р±РёРѕ Рё РїСЂРёРІСЏР·РєР° Рє РІРёРґР°Рј С‚СЂРµРЅРёСЂРѕРІРѕРє</p>
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
              РќРѕРІС‹Р№ С‚СЂРµРЅРµСЂ
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {trainers.length === 0 ? (
              <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
                РўСЂРµРЅРµСЂРѕРІ РїРѕРєР° РЅРµС‚
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
                        <span>{trainer.phone || "РўРµР»РµС„РѕРЅ РЅРµ СѓРєР°Р·Р°РЅ"}</span>
                        {trainer.email && (
                          <>
                            <span>вЂў</span>
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
                        Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTrainer(trainer.id)}
                        disabled={deletingTrainerId === trainer.id}
                        className="rounded-[16px] border border-[rgba(248,81,73,0.24)] px-3 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.12)] disabled:opacity-50"
                      >
                        {deletingTrainerId === trainer.id ? "РЈРґР°Р»СЏРµРј..." : "РЈРґР°Р»РёС‚СЊ"}
                      </button>
                      </div>
                    ) : null}
                  </div>

                  <p className="mt-4 text-sm text-[var(--text-muted)]">{trainer.bio || "РћРїРёСЃР°РЅРёРµ РїРѕРєР° РЅРµ РґРѕР±Р°РІР»РµРЅРѕ"}</p>

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
                      <span className="text-sm text-[var(--text-muted)]">Р’РёРґС‹ С‚СЂРµРЅРёСЂРѕРІРѕРє РЅРµ РІС‹Р±СЂР°РЅС‹</span>
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

