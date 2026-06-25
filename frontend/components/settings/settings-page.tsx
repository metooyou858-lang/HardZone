"use client";

import { useEffect, useMemo, useState } from "react";

import { formatTimeValue } from "@/components/schedule/gym-access-shared";
import { GymHoursSection } from "@/components/schedule/gym-hours-section";
import { TrainerFormModal } from "@/components/schedule/trainer-form-modal";
import { withAlpha, PlusIcon, type BannerState, getBannerClass } from "@/components/schedule/schedule-shared";
import { hasModuleAccess, type AuthModulePermission, type AuthUserRole } from "@/lib/access";
import { UsersPanel } from "@/components/admin/users-panel";
import { SystemStatusPanel } from "@/components/settings/system-status-panel";
import {
  createAthleteProfileField,
  createAthleteProfileSection,
  deleteAthleteProfileField,
  deleteAthleteProfileSection,
  fetchAthleteProfileFields,
  fetchAthleteProfileSections,
  updateAthleteProfileField,
  updateAthleteProfileSection,
  type AthleteProfileField,
  type AthleteProfileFieldType,
  type AthleteProfileRole,
  type AthleteProfileSection,
} from "@/lib/api/clients";
import { fetchGymOverview, saveGymHours, type GymHour } from "@/lib/api/schedule";
import { deleteTrainer, fetchTrainerStaffUsers, fetchTrainers, type Trainer, type TrainerStaffUser } from "@/lib/api/trainers";
import { fetchTrainingTypes, type TrainingType } from "@/lib/api/training-types";

type SettingsTab = "trainers" | "gym" | "athlete" | "users" | "system";

type AthleteFieldForm = {
  id: string | null;
  section_id: string;
  label: string;
  field_key: string;
  field_type: AthleteProfileFieldType;
  unit: string;
  options: string;
  sort_order: string;
  visible_to: AthleteProfileRole[];
  editable_by: AthleteProfileRole[];
  is_required: boolean;
  is_active: boolean;
};

type AthleteSectionForm = {
  id: string | null;
  name: string;
  sort_order: string;
  is_active: boolean;
};

const emptyAthleteFieldForm: AthleteFieldForm = {
  id: null,
  section_id: "",
  label: "",
  field_key: "",
  field_type: "text",
  unit: "",
  options: "",
  sort_order: "0",
  visible_to: ["admin", "trainer"],
  editable_by: ["admin", "trainer"],
  is_required: false,
  is_active: true,
};

const emptyAthleteSectionForm: AthleteSectionForm = {
  id: null,
  name: "",
  sort_order: "0",
  is_active: true,
};

const athleteFieldTypes: { value: AthleteProfileFieldType; label: string }[] = [
  { value: "text", label: "Текст" },
  { value: "textarea", label: "Большой текст" },
  { value: "number", label: "Число" },
  { value: "date", label: "Дата" },
  { value: "boolean", label: "Да/нет" },
  { value: "select", label: "Список" },
  { value: "multiselect", label: "Мультивыбор" },
];

const athleteProfileRoles: { value: AthleteProfileRole; label: string }[] = [
  { value: "admin", label: "Админ" },
  { value: "trainer", label: "Тренер" },
  { value: "client", label: "Клиент" },
];

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
  { value: "athlete", label: "Профиль атлета" },
];

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function SettingsPage() {
  const [currentModules, setCurrentModules] = useState<AuthModulePermission[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number>(0);
  const [currentUserRole, setCurrentUserRole] = useState<AuthUserRole>("admin");
  const [tab, setTab] = useState<SettingsTab>("trainers");
  const [banner, setBanner] = useState<BannerState>(null);

  // Trainers state
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [trainerStaffUsers, setTrainerStaffUsers] = useState<TrainerStaffUser[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [trainersLoading, setTrainersLoading] = useState(false);
  const [trainerModalOpen, setTrainerModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const [deletingTrainerId, setDeletingTrainerId] = useState<string | null>(null);

  // Gym hours state
  const [hoursForm, setHoursForm] = useState<GymHour[]>([]);
  const [gymLoading, setGymLoading] = useState(false);
  const [savingHours, setSavingHours] = useState(false);

  // Athlete profile fields state
  const [athleteSections, setAthleteSections] = useState<AthleteProfileSection[]>([]);
  const [athleteFields, setAthleteFields] = useState<AthleteProfileField[]>([]);
  const [athleteFieldsLoading, setAthleteFieldsLoading] = useState(false);
  const [savingAthleteSection, setSavingAthleteSection] = useState(false);
  const [savingAthleteField, setSavingAthleteField] = useState(false);
  const [showAthleteSectionEditor, setShowAthleteSectionEditor] = useState(false);
  const [showAthleteFieldEditor, setShowAthleteFieldEditor] = useState(false);
  const [athleteSectionForm, setAthleteSectionForm] = useState<AthleteSectionForm>(emptyAthleteSectionForm);
  const [athleteFieldForm, setAthleteFieldForm] = useState<AthleteFieldForm>(emptyAthleteFieldForm);

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

    Promise.all([fetchTrainers(), fetchTrainingTypes(), fetchTrainerStaffUsers()])
      .then(([loadedTrainers, loadedTypes, loadedStaffUsers]) => {
        if (cancelled) return;
        setTrainers(loadedTrainers);
        setTrainingTypes(loadedTypes);
        setTrainerStaffUsers(loadedStaffUsers);
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

  useEffect(() => {
    if (tab !== "athlete") return;

    let cancelled = false;
    setAthleteFieldsLoading(true);

    Promise.all([
      fetchAthleteProfileSections({ includeInactive: true }),
      fetchAthleteProfileFields({ includeInactive: true }),
    ])
      .then(([sections, fields]) => {
        if (cancelled) return;
        setAthleteSections(sections);
        setAthleteFields(fields);
      })
      .catch((err) => {
        if (!cancelled) {
          setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось загрузить профиль атлета" });
        }
      })
      .finally(() => {
        if (!cancelled) setAthleteFieldsLoading(false);
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
  const canManageAthleteFields = currentUserRole === "owner" || currentUserRole === "admin";

  function fieldToForm(field: AthleteProfileField): AthleteFieldForm {
    return {
      id: field.id,
      section_id: field.section_id,
      label: field.label,
      field_key: field.field_key,
      field_type: field.field_type,
      unit: field.unit ?? "",
      options: field.options.join("\n"),
      sort_order: String(field.sort_order ?? 0),
      visible_to: field.visible_to,
      editable_by: field.editable_by,
      is_required: field.is_required,
      is_active: field.is_active,
    };
  }

  function sectionToForm(section: AthleteProfileSection): AthleteSectionForm {
    return {
      id: section.id,
      name: section.name,
      sort_order: String(section.sort_order ?? 0),
      is_active: section.is_active,
    };
  }

  function toggleAthleteRole(target: "visible_to" | "editable_by", role: AthleteProfileRole) {
    setAthleteFieldForm((prev) => {
      const nextRoles = prev[target].includes(role)
        ? prev[target].filter((item) => item !== role)
        : [...prev[target], role];
      return { ...prev, [target]: nextRoles };
    });
  }

  async function handleSaveAthleteField() {
    setSavingAthleteField(true);

    try {
      const payload = {
        section_id: athleteFieldForm.section_id,
        label: athleteFieldForm.label.trim(),
        field_key: athleteFieldForm.field_key.trim() || undefined,
        field_type: athleteFieldForm.field_type,
        unit: athleteFieldForm.unit.trim() || null,
        options: athleteFieldForm.options
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        sort_order: Number.parseInt(athleteFieldForm.sort_order, 10) || 0,
        visible_to: athleteFieldForm.visible_to,
        editable_by: athleteFieldForm.editable_by,
        is_required: athleteFieldForm.is_required,
        is_active: athleteFieldForm.is_active,
      };

      const saved = athleteFieldForm.id
        ? await updateAthleteProfileField(athleteFieldForm.id, payload)
        : await createAthleteProfileField(payload);

      setAthleteFields((prev) => {
        const exists = prev.some((field) => field.id === saved.id);
        const next = exists ? prev.map((field) => (field.id === saved.id ? saved : field)) : [...prev, saved];
        return next.sort((a, b) => a.sort_order - b.sort_order || Number(a.id) - Number(b.id));
      });
      setAthleteFieldForm(emptyAthleteFieldForm);
      setShowAthleteFieldEditor(false);
      setBanner({ tone: "success", text: "Поле профиля атлета сохранено" });
    } catch (err) {
      setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось сохранить поле профиля" });
    } finally {
      setSavingAthleteField(false);
    }
  }

  async function handleSaveAthleteSection() {
    setSavingAthleteSection(true);

    try {
      const payload = {
        name: athleteSectionForm.name.trim(),
        sort_order: Number.parseInt(athleteSectionForm.sort_order, 10) || 0,
        is_active: athleteSectionForm.is_active,
      };
      const saved = athleteSectionForm.id
        ? await updateAthleteProfileSection(athleteSectionForm.id, payload)
        : await createAthleteProfileSection(payload);

      setAthleteSections((prev) => {
        const exists = prev.some((section) => section.id === saved.id);
        const next = exists
          ? prev.map((section) => (section.id === saved.id ? saved : section))
          : [...prev, saved];
        return next.sort((a, b) => a.sort_order - b.sort_order || Number(a.id) - Number(b.id));
      });
      setAthleteFields((prev) =>
        prev.map((field) => (field.section_id === saved.id ? { ...field, section: saved.name } : field))
      );
      setAthleteSectionForm(emptyAthleteSectionForm);
      setShowAthleteSectionEditor(false);
      setAthleteFieldForm((prev) => (prev.section_id ? prev : { ...prev, section_id: saved.id }));
      setBanner({ tone: "success", text: "Раздел профиля атлета сохранен" });
    } catch (err) {
      setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось сохранить раздел" });
    } finally {
      setSavingAthleteSection(false);
    }
  }

  async function handleToggleAthleteField(field: AthleteProfileField) {
    try {
      const saved = await updateAthleteProfileField(field.id, { is_active: !field.is_active });
      setAthleteFields((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setBanner({ tone: "success", text: saved.is_active ? "Поле включено" : "Поле скрыто из карточки клиента" });
    } catch (err) {
      setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось изменить поле" });
    }
  }

  async function handleDeleteAthleteField(field: AthleteProfileField) {
    if (!window.confirm(`Удалить поле "${field.label}"? Значения этого показателя у клиентов тоже будут удалены.`)) return;

    try {
      await deleteAthleteProfileField(field.id);
      setAthleteFields((prev) => prev.filter((item) => item.id !== field.id));
      if (athleteFieldForm.id === field.id) {
        setAthleteFieldForm(emptyAthleteFieldForm);
      }
      setBanner({ tone: "success", text: "Поле профиля удалено" });
    } catch (err) {
      setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось удалить поле" });
    }
  }

  async function handleToggleAthleteSection(section: AthleteProfileSection) {
    try {
      const saved = await updateAthleteProfileSection(section.id, { is_active: !section.is_active });
      setAthleteSections((prev) => prev.map((item) => (item.id === saved.id ? saved : item)));
      setBanner({ tone: "success", text: saved.is_active ? "Раздел включен" : "Раздел скрыт из карточки клиента" });
    } catch (err) {
      setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось изменить раздел" });
    }
  }

  async function handleDeleteAthleteSection(section: AthleteProfileSection) {
    if (!window.confirm(`Удалить раздел "${section.name}"? Это возможно только если в нем нет полей.`)) return;

    try {
      await deleteAthleteProfileSection(section.id);
      setAthleteSections((prev) => prev.filter((item) => item.id !== section.id));
      if (athleteSectionForm.id === section.id) {
        setAthleteSectionForm(emptyAthleteSectionForm);
      }
      setBanner({ tone: "success", text: "Раздел профиля удален" });
    } catch (err) {
      setBanner({ tone: "error", text: err instanceof Error ? err.message : "Не удалось удалить раздел" });
    }
  }

  function renderAthleteSectionEditor() {
    return (
      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Название</label>
          <input
            type="text"
            value={athleteSectionForm.name}
            onChange={(event) => setAthleteSectionForm((prev) => ({ ...prev, name: event.target.value }))}
            className="mt-2 w-full rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            placeholder="Силовые показатели"
            disabled={!canManageAthleteFields}
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Порядок</label>
          <input
            type="number"
            value={athleteSectionForm.sort_order}
            onChange={(event) => setAthleteSectionForm((prev) => ({ ...prev, sort_order: event.target.value }))}
            className="mt-2 w-full rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            disabled={!canManageAthleteFields}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--text-main)]">
          <input
            type="checkbox"
            checked={athleteSectionForm.is_active}
            onChange={(event) => setAthleteSectionForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            disabled={!canManageAthleteFields}
          />
          Активный
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSaveAthleteSection()}
            disabled={!canManageAthleteFields || savingAthleteSection}
            className="rounded-[16px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
          >
            {savingAthleteSection ? "Сохраняем..." : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAthleteSectionForm(emptyAthleteSectionForm);
              setShowAthleteSectionEditor(false);
            }}
            className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)]"
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

  function renderAthleteFieldEditor() {
    return (
      <div className="mt-4 space-y-4 rounded-[20px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] p-4">
        <div>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Раздел</label>
          <select
            value={athleteFieldForm.section_id}
            onChange={(event) => setAthleteFieldForm((prev) => ({ ...prev, section_id: event.target.value }))}
            className="mt-2 w-full rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            disabled={!canManageAthleteFields}
          >
            <option value="">Выберите раздел</option>
            {athleteSections.map((section) => (
              <option key={section.id} value={section.id}>{section.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Название поля</label>
          <input
            type="text"
            value={athleteFieldForm.label}
            onChange={(event) => setAthleteFieldForm((prev) => ({ ...prev, label: event.target.value }))}
            className="mt-2 w-full rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            placeholder="Становая тяга"
            disabled={!canManageAthleteFields}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Тип</label>
            <select
              value={athleteFieldForm.field_type}
              onChange={(event) => setAthleteFieldForm((prev) => ({ ...prev, field_type: event.target.value as AthleteProfileFieldType }))}
              className="mt-2 w-full rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
              disabled={!canManageAthleteFields}
            >
              {athleteFieldTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Порядок</label>
            <input
              type="number"
              value={athleteFieldForm.sort_order}
              onChange={(event) => setAthleteFieldForm((prev) => ({ ...prev, sort_order: event.target.value }))}
              className="mt-2 w-full rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
              disabled={!canManageAthleteFields}
            />
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Единица</label>
          <input
            type="text"
            value={athleteFieldForm.unit}
            onChange={(event) => setAthleteFieldForm((prev) => ({ ...prev, unit: event.target.value }))}
            className="mt-2 w-full rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
            placeholder="кг, см, мин"
            disabled={!canManageAthleteFields}
          />
        </div>

        {(athleteFieldForm.field_type === "select" || athleteFieldForm.field_type === "multiselect") && (
          <div>
            <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">Варианты</label>
            <textarea
              rows={4}
              value={athleteFieldForm.options}
              onChange={(event) => setAthleteFieldForm((prev) => ({ ...prev, options: event.target.value }))}
              className="mt-2 w-full resize-none rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
              placeholder={"Новичок\nСредний\nПродвинутый"}
              disabled={!canManageAthleteFields}
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {(["visible_to", "editable_by"] as const).map((target) => (
            <div key={target} className="rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {target === "visible_to" ? "Кто видит" : "Кто редактирует"}
              </p>
              <div className="mt-3 space-y-2">
                {athleteProfileRoles.map((role) => (
                  <label key={role.value} className="flex items-center gap-2 text-sm text-[var(--text-main)]">
                    <input
                      type="checkbox"
                      checked={athleteFieldForm[target].includes(role.value)}
                      onChange={() => toggleAthleteRole(target, role.value)}
                      disabled={!canManageAthleteFields}
                    />
                    {role.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-[var(--text-main)]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={athleteFieldForm.is_required}
              onChange={(event) => setAthleteFieldForm((prev) => ({ ...prev, is_required: event.target.checked }))}
              disabled={!canManageAthleteFields}
            />
            Обязательное
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={athleteFieldForm.is_active}
              onChange={(event) => setAthleteFieldForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              disabled={!canManageAthleteFields}
            />
            Активное
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleSaveAthleteField()}
            disabled={!canManageAthleteFields || savingAthleteField || athleteSections.length === 0}
            className="rounded-[16px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
          >
            {savingAthleteField ? "Сохраняем..." : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAthleteFieldForm(emptyAthleteFieldForm);
              setShowAthleteFieldEditor(false);
            }}
            className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)]"
          >
            Отмена
          </button>
        </div>
      </div>
    );
  }

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

                  <div className="mt-4 rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm">
                    <span className="text-[var(--text-muted)]">Связанный пользователь: </span>
                    {trainer.linked_user ? (
                      <span className="font-medium text-[var(--text-main)]">
                        {trainer.linked_user.name}
                        {trainer.linked_user.email ? ` · ${trainer.linked_user.email}` : ""}
                      </span>
                    ) : (
                      <span className="text-[var(--text-muted)]">не привязан</span>
                    )}
                  </div>

                  <div className="mt-4 rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-[var(--text-main)]">Отзывы</span>
                      <span className="text-[var(--text-muted)]">
                        {trainer.reviews_count > 0 ? `★ ${trainer.rating} · ${trainer.reviews_count}` : "Нет отзывов"}
                      </span>
                    </div>
                    {(trainer.reviews || []).length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {(trainer.reviews || []).map((review) => (
                          <div key={review.id} className="rounded-[14px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium text-[var(--text-main)]">{review.client_name || "Клиент"}</span>
                              <span className="text-xs text-[var(--text-muted)]">★ {review.rating} · {formatShortDate(review.created_at)}</span>
                            </div>
                            {review.comment ? (
                              <p className="mt-2 whitespace-pre-line text-[var(--text-muted)]">{review.comment}</p>
                            ) : (
                              <p className="mt-2 text-[var(--text-muted)]">Без текста</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

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

      {tab === "athlete" && (
        <section className="grid gap-5 xl:grid-cols-[minmax(300px,0.48fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold text-[var(--text-main)]">Разделы</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Разделы группируют показатели в карточке клиента.</p>
              </div>
              {canManageAthleteFields && (
                <button
                  type="button"
                  onClick={() => {
                    setAthleteSectionForm(emptyAthleteSectionForm);
                    setShowAthleteSectionEditor(true);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110"
                >
                  <PlusIcon />
                  Раздел
                </button>
              )}
            </div>

            {showAthleteSectionEditor && !athleteSectionForm.id && (
              <div className="rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
                <p className="font-medium text-[var(--text-main)]">Новый раздел</p>
                {renderAthleteSectionEditor()}
              </div>
            )}

            <div className="space-y-3">
              {athleteSections.map((section) => {
                const editingThisSection = showAthleteSectionEditor && athleteSectionForm.id === section.id;

                return (
                  <div
                    key={section.id}
                    className={`rounded-[22px] border p-4 ${
                      section.is_active
                        ? "border-[var(--line-soft)] bg-[var(--bg-card)]"
                        : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.015)] opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--text-main)]">{section.name}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Порядок: {section.sort_order}</p>
                      </div>
                      {!section.is_active && (
                        <span className="rounded-full border border-[var(--line-soft)] px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                          скрыт
                        </span>
                      )}
                    </div>

                    {editingThisSection ? (
                      renderAthleteSectionEditor()
                    ) : canManageAthleteFields ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAthleteSectionForm(sectionToForm(section));
                            setShowAthleteSectionEditor(true);
                          }}
                          className="rounded-[14px] border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--text-main)]"
                        >
                          Редактировать
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleAthleteSection(section)}
                          className="rounded-[14px] border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--text-muted)]"
                        >
                          {section.is_active ? "Скрыть" : "Включить"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteAthleteSection(section)}
                          className="rounded-[14px] border border-[rgba(248,81,73,0.24)] px-3 py-2 text-sm text-[var(--danger)]"
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-4 rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-lg font-semibold text-[var(--text-main)]">Поля профиля атлета</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Показатели отображаются в карточке клиента и фильтруются по правам.
                </p>
              </div>
              {canManageAthleteFields && (
                <button
                  type="button"
                  onClick={() => {
                    setAthleteFieldForm({
                      ...emptyAthleteFieldForm,
                      section_id: athleteSections[0]?.id ?? "",
                    });
                    setShowAthleteFieldEditor(true);
                  }}
                  disabled={athleteSections.length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
                >
                  <PlusIcon />
                  Поле
                </button>
              )}
            </div>

            {athleteFieldsLoading ? (
              <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
                Загружаем профиль...
              </div>
            ) : (
              <div className="space-y-3">
                {showAthleteFieldEditor && !athleteFieldForm.id && (
                  <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
                    <p className="text-base font-semibold text-[var(--text-main)]">Новое поле</p>
                    {renderAthleteFieldEditor()}
                  </div>
                )}

                {athleteFields.length === 0 && !showAthleteFieldEditor ? (
                  <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
                    Поля профиля пока не настроены
                  </div>
                ) : (
                  athleteFields.map((field) => {
                    const editingThisField = showAthleteFieldEditor && athleteFieldForm.id === field.id;

                    return (
                      <div
                        key={field.id}
                        className={`rounded-[24px] border p-5 ${
                          field.is_active
                            ? "border-[var(--line-soft)] bg-[var(--bg-card)]"
                            : "border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.015)] opacity-70"
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-[var(--text-main)]">{field.label}</p>
                              {!field.is_active && (
                                <span className="rounded-full border border-[var(--line-soft)] px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                                  скрыто
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm text-[var(--text-muted)]">
                              {field.section} · {athleteFieldTypes.find((type) => type.value === field.field_type)?.label || field.field_type}
                              {field.unit ? ` · ${field.unit}` : ""}
                            </p>
                          </div>

                          {!editingThisField && canManageAthleteFields && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setAthleteFieldForm(fieldToForm(field));
                                  setShowAthleteFieldEditor(true);
                                }}
                                className="rounded-[16px] border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                              >
                                Редактировать
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleAthleteField(field)}
                                className="rounded-[16px] border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                              >
                                {field.is_active ? "Скрыть" : "Включить"}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteAthleteField(field)}
                                className="rounded-[16px] border border-[rgba(248,81,73,0.24)] px-3 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.12)]"
                              >
                                Удалить
                              </button>
                            </div>
                          )}
                        </div>

                        {editingThisField ? (
                          renderAthleteFieldEditor()
                        ) : (
                          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                            <div className="rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3">
                              <span className="text-[var(--text-muted)]">Видят: </span>
                              <span className="text-[var(--text-main)]">
                                {field.visible_to.map((role) => athleteProfileRoles.find((item) => item.value === role)?.label || role).join(", ")}
                              </span>
                            </div>
                            <div className="rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3">
                              <span className="text-[var(--text-muted)]">Редактируют: </span>
                              <span className="text-[var(--text-main)]">
                                {field.editable_by.map((role) => athleteProfileRoles.find((item) => item.value === role)?.label || role).join(", ")}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
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
          staffUsers={trainerStaffUsers}
          onClose={() => { setTrainerModalOpen(false); setEditingTrainer(null); }}
          onSaved={(message) => {
            setTrainerModalOpen(false);
            setEditingTrainer(null);
            setBanner({ tone: "success", text: message });
            // Перезагружаем список тренеров
            fetchTrainers().then(setTrainers).catch(() => {});
            fetchTrainerStaffUsers().then(setTrainerStaffUsers).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
