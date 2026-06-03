"use client";

import { useEffect, useMemo, useState } from "react";

import { formatTimeValue } from "@/components/schedule/gym-access-shared";
import { GymHoursSection } from "@/components/schedule/gym-hours-section";
import { TrainerFormModal } from "@/components/schedule/trainer-form-modal";
import { withAlpha, PlusIcon, type BannerState, getBannerClass } from "@/components/schedule/schedule-shared";
import { hasModuleAccess, type AuthModulePermission, type AuthUserRole } from "@/lib/access";
import { UsersPanel } from "@/components/admin/users-panel";
import { SystemStatusPanel } from "@/components/settings/system-status-panel";
import { fetchGymOverview, saveGymHours, type GymHour } from "@/lib/api/schedule";
import { deleteTrainer, fetchTrainers, type Trainer } from "@/lib/api/trainers";
import { fetchTrainingTypes, type TrainingType } from "@/lib/api/training-types";

type SettingsTab = "trainers" | "gym" | "users" | "system";

const weekdayLabels: Record<number, string> = {
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
  7: "Воскресенье",
};

const baseTabs: { value: SettingsTab; label: string }[] = [
  { value: "trainers", label: "Тренеры" },
  { value: "gym", label: "Часы работы зала" },
];

export function SettingsPage() {
  const [currentModules, setCurrentModules] = useState<AuthModulePermission[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number>(0);
  const [currentUserRole, setCurrentUserRole] = useState<AuthUserRole>("admin");
  const [tab, setTab] = useState<SettingsTab>("trainers");
  const [banner, setBanner] = useState<BannerState>(null);

  // Trainers state
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [trainersLoading, setTrainersLoading] = useState(false);
  const [trainerModalOpen, setTrainerModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const [deletingTrainerId, setDeletingTrainerId] = useState<string | null>(null);

  // Gym hours state
  const [hoursForm, setHoursForm] = useState<GymHour[]>([]);
  const [gymLoading, setGymLoading] = useState(false);
  const [savingHours, setSavingHours] = useState(false);

  useEffect(() => {
    fetch("/auth-api/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { data?: { user?: { id?: number; role?: AuthUserRole; modules?: AuthModulePermission[] } } };
        return data.data?.user ?? null;
      })
      .then((user) => {
        setCurrentModules(user?.modules ?? []);
        if (user?.id) setCurrentUserId(user.id);
        if (user?.role) setCurrentUserRole(user.role);
      })
      .catch(() => setCurrentModules([]));
  }, []);

  // Load trainers when tab selected
  useEffect(() => {
    if (tab !== "trainers") return;

    let cancelled = false;
    setTrainersLoading(true);

    Promise.all([fetchTrainers(), fetchTrainingTypes()])
      .then(([loadedTrainers, loadedTypes]) => {
        if (cancelled) return;
        setTrainers(loadedTrainers);
        setTrainingTypes(loadedTypes);
      })
      .catch((err) => {
        if (!cancelled) {
          setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось загрузить тренеров" });
        }
      })
      .finally(() => {
        if (!cancelled) setTrainersLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab]);

  // Load gym hours when tab selected
  useEffect(() => {
    if (tab !== "gym") return;

    let cancelled = false;
    setGymLoading(true);

    fetchGymOverview()
      .then((response) => {
        if (!cancelled) setHoursForm(response.hours);
      })
      .catch((err) => {
        if (!cancelled) {
          setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось загрузить часы работы" });
        }
      })
      .finally(() => {
        if (!cancelled) setGymLoading(false);
      });

    return () => { cancelled = true; };
  }, [tab]);

  const canManageUsers = hasModuleAccess(currentModules, "users_manage");
  const canViewSystem = canManageUsers;

  const tabs = [
    ...baseTabs,
    ...(canManageUsers ? [{ value: "users" as SettingsTab, label: "Сотрудники" }] : []),
    ...(canViewSystem ? [{ value: "system" as SettingsTab, label: "Система" }] : []),
  ];

  const canManageTrainers = hasModuleAccess(currentModules, "schedule") && hasModuleAccess(currentModules, "services");
  const canManageGymHours =
    hasModuleAccess(currentModules, "schedule_gym") ||
    hasModuleAccess(currentModules, "schedule");

  async function handleDeleteTrainer(id: string) {
    if (!window.confirm("Удалить тренера из активного списка?")) return;

    setDeletingTrainerId(id);

    try {
      await deleteTrainer(id);
      setTrainers((prev) => prev.filter((t) => t.id !== id));
      setBanner({ tone: "success", text: "Тренер скрыт из активного списка" });
    } catch (err) {
      setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось удалить тренера" });
    } finally {
      setDeletingTrainerId(null);
    }
  }

  async function handleSaveHours() {
    setSavingHours(true);

    try {
      const response = await saveGymHours(hoursForm);
      setHoursForm(response.hours);
      setBanner({ tone: "success", text: "Часы работы зала сохранены" });
    } catch (err) {
      setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось сохранить часы работы" });
    } finally {
      setSavingHours(false);
    }
  }

  function handleToggleOpen(dayOfWeek: number, isOpen: boolean) {
    setHoursForm((prev) =>
      prev.map((item) =>
        item.day_of_week === dayOfWeek
          ? {
              ...item,
              is_open: isOpen,
              open_time: isOpen ? item.open_time || "06:00:00" : null,
              close_time: isOpen ? item.close_time || "22:00:00" : null,
            }
          : item
      )
    );
  }

  function handleTimeChange(dayOfWeek: number, field: "open_time" | "close_time", value: string) {
    setHoursForm((prev) =>
      prev.map((item) =>
        item.day_of_week === dayOfWeek ? { ...item, [field]: value ? `${value}:00` : null } : item
      )
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">
            Настройки
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
            Разовая настройка клуба: тренерский состав, часы работы зала и другие параметры.
          </p>
        </div>

        <div className="inline-flex rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] p-1">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                tab === t.value
                  ? "bg-[var(--accent)] text-[#062b26]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {banner && (
        <div className={`rounded-[22px] border px-4 py-3 text-sm ${getBannerClass(banner.tone)}`}>
          {banner.text}
        </div>
      )}

      {tab === "trainers" && (
        <section className="space-y-4">
          <div className="flex flex-col gap-4 rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-lg font-semibold text-[var(--text-main)]">Тренеры</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Контакты, описание и привязка к видам тренировок</p>
            </div>

            {canManageTrainers && (
              <button
                type="button"
                onClick={() => { setEditingTrainer(null); setTrainerModalOpen(true); }}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110"
              >
                <PlusIcon />
                Новый тренер
              </button>
            )}
          </div>

          {trainersLoading ? (
            <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
              Загружаем тренеров...
            </div>
          ) : trainers.length === 0 ? (
            <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
              Тренеров пока нет
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {trainers.map((trainer) => (
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

                    {canManageTrainers && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingTrainer(trainer); setTrainerModalOpen(true); }}
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
                    )}
                  </div>

                  <p className="mt-4 text-sm text-[var(--text-muted)]">
                    {trainer.bio || "Описание пока не добавлено"}
                  </p>

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
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "gym" && (
        <section>
          {gymLoading ? (
            <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
              Загружаем часы работы...
            </div>
          ) : (
            <GymHoursSection
              title="Часы работы зала"
              subtitle="Настройка открытых дней и времени для свободного посещения"
              saveLabel={savingHours ? "Сохраняем..." : "Сохранить"}
              helperText={canManageGymHours ? null : "Недостаточно прав для изменения часов работы."}
              openLabel="Открыто"
              openTimeLabel="Открытие"
              closeTimeLabel="Закрытие"
              closedLabel="Выходной"
              weekdayLabels={weekdayLabels}
              hours={hoursForm}
              canManageHours={canManageGymHours}
              savingHours={savingHours}
              formatTimeValue={formatTimeValue}
              onSave={handleSaveHours}
              onToggleOpen={handleToggleOpen}
              onTimeChange={handleTimeChange}
            />
          )}
        </section>
      )}

      {tab === "users" && canManageUsers && (
        <UsersPanel currentUserId={currentUserId} currentUserRole={currentUserRole} />
      )}

      {tab === "system" && canViewSystem && (
        <SystemStatusPanel />
      )}

      {trainerModalOpen && (
        <TrainerFormModal
          trainer={editingTrainer}
          trainingTypes={trainingTypes}
          onClose={() => { setTrainerModalOpen(false); setEditingTrainer(null); }}
          onSaved={(message) => {
            setTrainerModalOpen(false);
            setEditingTrainer(null);
            setBanner({ tone: "success", text: message });
            // Перезагружаем список тренеров
            fetchTrainers().then(setTrainers).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
