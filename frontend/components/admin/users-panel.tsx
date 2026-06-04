"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  accessPresets,
  type AccessPreset,
  CLIENT_SUB_PERMISSIONS,
  getDefaultModulesForRole,
  getDefaultRoleTitle,
  moduleLabels,
  SALES_SUB_PERMISSIONS,
  roleLabels,
  SCHEDULE_SUB_PERMISSIONS,
  type AuthModulePermission,
  type AuthUserRole,
} from "@/lib/access";
import {
  type AuthUser,
  createAuthUser,
  deleteAuthUser,
  fetchAuthUsers,
  sendAuthUserTemporaryPassword,
  updateAuthUser,
} from "@/lib/api/auth";

type UsersPanelProps = {
  currentUserId: number;
  currentUserRole: AuthUserRole;
};

type UserFormState = {
  name: string;
  email: string;
  phone: string;
  role_title: string;
  modules: AuthModulePermission[];
  create_trainer_profile: boolean;
  is_active: boolean;
  password: string;
};

type OnboardingState = {
  userName: string;
  email: string | null;
  emailSent: boolean;
  emailError: string | null;
  temporaryPassword: string | null;
};

type PasswordDispatchState = {
  userName: string;
  email: string | null;
};

const moduleOrder: AuthModulePermission[] = [
  "warehouse",
  "services",
  "sales",
  "clients",
  "schedule",
  "analytics",
  "users_manage",
];

const initialFormState: UserFormState = {
  name: "",
  email: "",
  phone: "",
  role_title: accessPresets[0].role_title,
  modules: [...accessPresets[0].modules],
  create_trainer_profile: false,
  is_active: true,
  password: "",
};

function formatLastLogin(value?: string | null) {
  if (!value) {
    return "Еще не входил";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toFormState(user: AuthUser): UserFormState {
  return {
    name: user.name,
    email: user.email || "",
    phone: user.phone || "",
    role_title: user.role_title || roleLabels[user.role],
    modules: [...user.modules],
    create_trainer_profile: false,
    is_active: user.is_active,
    password: "",
  };
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function UsersPanel({ currentUserId, currentUserRole }: UsersPanelProps) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copying, setCopying] = useState<"temporary_password" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [form, setForm] = useState<UserFormState>(initialFormState);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [passwordDispatch, setPasswordDispatch] = useState<PasswordDispatchState | null>(null);

  const editingUser = useMemo(
    () => (editingUserId === null ? null : users.find((user) => user.id === editingUserId) ?? null),
    [editingUserId, users]
  );

  const editingSystemRole = editingUser?.role ?? "admin";
  const isEditingOwner = editingSystemRole === "owner";

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      setUsers(await fetchAuthUsers());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить сотрудников");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers().catch(() => undefined);
  }, []);

  function resetFormState() {
    setEditingUserId(null);
    setForm(initialFormState);
    setOnboarding(null);
    setPasswordDispatch(null);
    setError("");
    setSuccess("");
  }

  function startCreate() {
    resetFormState();
  }

  function canManageListedUser(user: AuthUser) {
    if (currentUserRole === "owner") {
      return true;
    }

    return user.role !== "owner";
  }

  function startEdit(user: AuthUser) {
    if (!canManageListedUser(user)) {
      return;
    }

    setEditingUserId(user.id);
    setForm(toFormState(user));
    setOnboarding(null);
    setPasswordDispatch(null);
    setError("");
    setSuccess("");
  }

  function toggleModule(module: AuthModulePermission) {
    if (isEditingOwner) {
      return;
    }

    setForm((state) => {
      const hasModule = state.modules.includes(module);

      if (module === "schedule") {
        if (hasModule) {
          return {
            ...state,
            modules: state.modules.filter((m) => m !== "schedule" && !SCHEDULE_SUB_PERMISSIONS.includes(m)),
          };
        } else {
          const toAdd = (["schedule", ...SCHEDULE_SUB_PERMISSIONS] as AuthModulePermission[]).filter(
            (m) => !state.modules.includes(m)
          );
          return { ...state, modules: [...state.modules, ...toAdd] };
        }
      }

      if (module === "sales") {
        if (hasModule) {
          return {
            ...state,
            modules: state.modules.filter((m) => m !== "sales" && !SALES_SUB_PERMISSIONS.includes(m)),
          };
        } else {
          const toAdd = (["sales", ...SALES_SUB_PERMISSIONS] as AuthModulePermission[]).filter(
            (m) => !state.modules.includes(m)
          );
          return { ...state, modules: [...state.modules, ...toAdd] };
        }
      }

      if (module === "clients") {
        if (hasModule) {
          return {
            ...state,
            modules: state.modules.filter((m) => m !== "clients" && !CLIENT_SUB_PERMISSIONS.includes(m)),
          };
        } else {
          const toAdd = (["clients", ...CLIENT_SUB_PERMISSIONS] as AuthModulePermission[]).filter(
            (m) => !state.modules.includes(m)
          );
          return { ...state, modules: [...state.modules, ...toAdd] };
        }
      }

      return {
        ...state,
        modules: hasModule ? state.modules.filter((item) => item !== module) : [...state.modules, module],
      };
    });
  }

  function applyAccessPreset(preset: AccessPreset) {
    if (isEditingOwner) {
      return;
    }

    setForm((state) => ({
      ...state,
      role_title: preset.role_title,
      modules: [...preset.modules],
      create_trainer_profile: preset.id === "duty_trainer",
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    setPasswordDispatch(null);

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        role_title: isEditingOwner ? getDefaultRoleTitle("owner") : form.role_title.trim() || getDefaultRoleTitle("admin"),
        modules: isEditingOwner ? getDefaultModulesForRole("owner") : form.modules,
        is_active: isEditingOwner ? true : form.is_active,
      };

      if (editingUserId === null) {
        const created = await createAuthUser({
          ...payload,
          role: "admin",
          create_trainer_profile: form.create_trainer_profile,
        });

        setOnboarding({
          userName: created.user.name,
          email: created.user.email,
          emailSent: created.onboarding.email_sent,
          emailError: created.onboarding.email_error,
          temporaryPassword: created.onboarding.temporary_password,
        });

        if (created.onboarding.email_sent) {
          setSuccess("Сотрудник создан. Пароль отправлен на почту.");
        } else if (created.onboarding.temporary_password) {
          setSuccess("Сотрудник создан. Временный пароль показан ниже.");
        } else {
          setSuccess("Сотрудник создан.");
        }
      } else {
        await updateAuthUser(editingUserId, {
          ...payload,
          password: form.password.trim() ? form.password : undefined,
        });
        setOnboarding(null);
        setSuccess("Изменения сохранены.");
      }

      await loadUsers();
      setEditingUserId(null);
      setForm(initialFormState);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить сотрудника");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleUserActivity(user: AuthUser) {
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await updateAuthUser(user.id, { is_active: !user.is_active });
      await loadUsers();
      setSuccess(user.is_active ? "Доступ отключен." : "Доступ включен.");
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Не удалось изменить статус");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteUser(user: AuthUser) {
    if (!canManageListedUser(user) || user.id === currentUserId) {
      return;
    }

    const confirmed = window.confirm(`Удалить сотрудника "${user.name}"?`);
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      await deleteAuthUser(user.id);
      await loadUsers();

      if (editingUserId === user.id) {
        resetFormState();
      }

      setSuccess("Сотрудник удален.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить сотрудника");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendTemporaryPassword(user: AuthUser) {
    setSubmitting(true);
    setError("");
    setSuccess("");
    setOnboarding(null);

    try {
      const dispatch = await sendAuthUserTemporaryPassword(user.id);
      setPasswordDispatch({
        userName: user.name,
        email: dispatch.email,
      });
      setSuccess("Новый пароль отправлен. Старый пароль больше не действует.");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Не удалось отправить новый пароль");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyTemporaryPassword() {
    if (!onboarding?.temporaryPassword) {
      return;
    }

    setCopying("temporary_password");

    try {
      await copyText(onboarding.temporaryPassword);
      setSuccess("Пароль скопирован.");
    } catch {
      setError("Не удалось скопировать пароль.");
    } finally {
      setCopying(null);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.95fr]">
      <section className="rounded-[24px] border border-[var(--line-soft)] bg-[rgba(18,24,37,0.9)] p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[var(--text-main)]">
            {editingUserId === null ? "Новый сотрудник" : "Редактирование сотрудника"}
          </h2>
          {editingUserId !== null ? (
            <button
              type="button"
              onClick={startCreate}
              className="rounded-2xl border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition hover:border-[rgba(255,255,255,0.16)]"
            >
              Отмена
            </button>
          ) : null}
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Имя</span>
              <input
                value={form.name}
                onChange={(event) => setForm((state) => ({ ...state, name: event.target.value }))}
                className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
                placeholder="Мария Николаева"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((state) => ({ ...state, email: event.target.value }))}
                className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
                placeholder="maria@hardzone.ru"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Телефон</span>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) => setForm((state) => ({ ...state, phone: event.target.value }))}
              className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
              placeholder="+7 999 123-45-67"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Роль</span>
              <input
                value={form.role_title}
                onChange={(event) => setForm((state) => ({ ...state, role_title: event.target.value }))}
                disabled={isEditingOwner}
                className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
                placeholder="Главный администратор"
              />
            </label>

            {editingUserId !== null ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--text-main)]">Новый пароль</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((state) => ({ ...state, password: event.target.value }))}
                  className="w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--accent)]"
                  placeholder="Оставьте пустым"
                />
              </label>
            ) : (
              <div className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[var(--text-muted)]">
                Логин совпадает с email. Пароль система создаст сама.
              </div>
            )}
          </div>

          <div className="rounded-[22px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] p-4">
            <div className="mb-3 flex flex-col gap-1">
              <p className="text-sm font-medium text-[var(--text-main)]">Шаблон доступа</p>
              <p className="text-xs text-[var(--text-muted)]">
                Быстро задает должность и права. Детальные доступы ниже можно изменить вручную.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {accessPresets.map((preset) => {
                const selected =
                  form.role_title === preset.role_title &&
                  preset.modules.length === form.modules.length &&
                  preset.modules.every((module) => form.modules.includes(module));

                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={isEditingOwner}
                    onClick={() => applyAccessPreset(preset)}
                    className={`rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                      selected
                        ? "border-[rgba(0,191,165,0.28)] bg-[rgba(0,191,165,0.1)]"
                        : "border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.16)]"
                    }`}
                  >
                    <span className="block text-sm font-medium text-[var(--text-main)]">{preset.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{preset.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[22px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-main)]">Карточка тренера</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  Это профиль для расписания. Он не выдает права доступа, а только связывает сотрудника с тренером.
                </p>
              </div>

              {editingUser?.trainer_profile ? (
                <span className="rounded-full border border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.08)] px-3 py-1 text-xs text-[var(--accent)]">
                  {editingUser.trainer_profile.first_name} {editingUser.trainer_profile.last_name}
                </span>
              ) : editingUserId === null ? (
                <label className="flex min-h-[42px] items-center gap-3 rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-2 text-sm text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={form.create_trainer_profile}
                    onChange={(event) => setForm((state) => ({ ...state, create_trainer_profile: event.target.checked }))}
                    className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent accent-[var(--accent)]"
                  />
                  Создать карточку
                </label>
              ) : (
                <span className="text-xs text-[var(--text-muted)]">Карточка не привязана</span>
              )}
            </div>
          </div>

          <div className="rounded-[22px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[var(--text-main)]">Доступы</p>
              {isEditingOwner ? (
                <span className="text-xs text-[var(--text-muted)]">У владельца все доступы всегда включены</span>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {moduleOrder.map((module) => {
                const enabled = form.modules.includes(module);

                if (module === "schedule") {
                  return (
                    <div key="schedule" className="col-span-full space-y-2">
                      <label
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                          enabled
                            ? "border-[rgba(0,191,165,0.22)] bg-[rgba(0,191,165,0.08)]"
                            : "border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)]"
                        } ${isEditingOwner ? "opacity-70" : ""}`}
                      >
                        <span className="text-[var(--text-main)]">Расписание</span>
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={isEditingOwner}
                          onChange={() => toggleModule("schedule")}
                          className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent accent-[var(--accent)]"
                        />
                      </label>

                      {enabled ? (
                        <div className="ml-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {SCHEDULE_SUB_PERMISSIONS.map((sub) => {
                            const subEnabled = form.modules.includes(sub);
                            return (
                              <label
                                key={sub}
                                className={`flex items-center justify-between rounded-2xl border px-4 py-2.5 text-xs ${
                                  subEnabled
                                    ? "border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.05)]"
                                    : "border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)]"
                                } ${isEditingOwner ? "opacity-70" : ""}`}
                              >
                                <span className="text-[var(--text-muted)]">{moduleLabels[sub]}</span>
                                <input
                                  type="checkbox"
                                  checked={subEnabled}
                                  disabled={isEditingOwner}
                                  onChange={() => toggleModule(sub)}
                                  className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent accent-[var(--accent)]"
                                />
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (module === "sales") {
                  return (
                    <div key="sales" className="col-span-full space-y-2">
                      <label
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                          enabled
                            ? "border-[rgba(0,191,165,0.22)] bg-[rgba(0,191,165,0.08)]"
                            : "border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)]"
                        } ${isEditingOwner ? "opacity-70" : ""}`}
                      >
                        <span className="text-[var(--text-main)]">Продажи</span>
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={isEditingOwner}
                          onChange={() => toggleModule("sales")}
                          className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent accent-[var(--accent)]"
                        />
                      </label>

                      {enabled ? (
                        <div className="ml-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {SALES_SUB_PERMISSIONS.map((sub) => {
                            const subEnabled = form.modules.includes(sub);
                            return (
                              <label
                                key={sub}
                                className={`flex items-center justify-between rounded-2xl border px-4 py-2.5 text-xs ${
                                  subEnabled
                                    ? "border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.05)]"
                                    : "border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)]"
                                } ${isEditingOwner ? "opacity-70" : ""}`}
                              >
                                <span className="text-[var(--text-muted)]">{moduleLabels[sub]}</span>
                                <input
                                  type="checkbox"
                                  checked={subEnabled}
                                  disabled={isEditingOwner}
                                  onChange={() => toggleModule(sub)}
                                  className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent accent-[var(--accent)]"
                                />
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                if (module === "clients") {
                  return (
                    <div key="clients" className="col-span-full space-y-2">
                      <label
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                          enabled
                            ? "border-[rgba(0,191,165,0.22)] bg-[rgba(0,191,165,0.08)]"
                            : "border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)]"
                        } ${isEditingOwner ? "opacity-70" : ""}`}
                      >
                        <span className="text-[var(--text-main)]">Клиенты</span>
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={isEditingOwner}
                          onChange={() => toggleModule("clients")}
                          className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent accent-[var(--accent)]"
                        />
                      </label>

                      {enabled ? (
                        <div className="ml-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {CLIENT_SUB_PERMISSIONS.map((sub) => {
                            const subEnabled = form.modules.includes(sub);
                            return (
                              <label
                                key={sub}
                                className={`flex items-center justify-between rounded-2xl border px-4 py-2.5 text-xs ${
                                  subEnabled
                                    ? "border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.05)]"
                                    : "border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)]"
                                } ${isEditingOwner ? "opacity-70" : ""}`}
                              >
                                <span className="text-[var(--text-muted)]">{moduleLabels[sub]}</span>
                                <input
                                  type="checkbox"
                                  checked={subEnabled}
                                  disabled={isEditingOwner}
                                  onChange={() => toggleModule(sub)}
                                  className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent accent-[var(--accent)]"
                                />
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <label
                    key={module}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
                      enabled
                        ? "border-[rgba(0,191,165,0.22)] bg-[rgba(0,191,165,0.08)]"
                        : "border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)]"
                    } ${isEditingOwner ? "opacity-70" : ""}`}
                  >
                    <span className="text-[var(--text-main)]">{moduleLabels[module]}</span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={isEditingOwner}
                      onChange={() => toggleModule(module)}
                      className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent accent-[var(--accent)]"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)]">
            <input
              type="checkbox"
              checked={form.is_active}
              disabled={isEditingOwner}
              onChange={(event) => setForm((state) => ({ ...state, is_active: event.target.checked }))}
              className="h-4 w-4 rounded border-[var(--line-soft)] bg-transparent accent-[var(--accent)]"
            />
            Активный доступ
          </label>

          {error ? (
            <div className="rounded-2xl border border-[rgba(255,107,107,0.28)] bg-[rgba(255,107,107,0.08)] px-4 py-3 text-sm text-[#ffb4b4]">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.08)] px-4 py-3 text-sm text-[var(--text-main)]">
              {success}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#04120f] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Сохраняем..." : editingUserId === null ? "Создать сотрудника" : "Сохранить"}
          </button>
        </form>

        {onboarding ? (
          <div className="mt-4 rounded-[22px] border border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.07)] p-4">
            <div className="text-sm text-[var(--text-main)]">
              <span className="font-medium">{onboarding.userName}</span>
              {onboarding.email ? ` • ${onboarding.email}` : ""}
            </div>

            {onboarding.emailSent ? (
              <div className="mt-3 rounded-2xl border border-[rgba(0,191,165,0.18)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)]">
                Пароль уже отправлен на почту.
              </div>
            ) : null}

            {onboarding.temporaryPassword ? (
              <div className="mt-3 rounded-2xl border border-[var(--line-soft)] bg-[rgba(12,18,28,0.55)] p-4">
                <p className="text-sm font-medium text-[var(--text-main)]">Временный пароль</p>
                <input
                  readOnly
                  value={onboarding.temporaryPassword}
                  className="mt-3 w-full rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-main)] outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyTemporaryPassword}
                  disabled={copying === "temporary_password"}
                  className="mt-3 inline-flex items-center rounded-2xl border border-[rgba(0,191,165,0.22)] bg-[rgba(0,191,165,0.1)] px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:border-[rgba(0,191,165,0.38)] hover:bg-[rgba(0,191,165,0.14)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {copying === "temporary_password" ? "Копируем..." : "Скопировать пароль"}
                </button>
              </div>
            ) : null}

            {onboarding.emailError ? (
              <div className="mt-3 rounded-2xl border border-[rgba(255,179,71,0.22)] bg-[rgba(255,179,71,0.08)] px-4 py-3 text-sm text-[#ffd7a0]">
                {onboarding.emailError}
              </div>
            ) : null}
          </div>
        ) : null}

        {passwordDispatch ? (
          <div className="mt-4 rounded-[22px] border border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.07)] px-4 py-3 text-sm text-[var(--text-main)]">
            Новый пароль отправлен: {passwordDispatch.userName}
            {passwordDispatch.email ? ` • ${passwordDispatch.email}` : ""}
          </div>
        ) : null}
      </section>

      <section className="rounded-[24px] border border-[var(--line-soft)] bg-[rgba(18,24,37,0.9)] p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[var(--text-main)]">Сотрудники</h2>
          <div className="rounded-full border border-[var(--line-soft)] px-3 py-1 text-xs text-[var(--text-muted)]">{users.length}</div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="rounded-[22px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Загружаем список...
            </div>
          ) : null}

          {!loading && users.length === 0 ? (
            <div className="rounded-[22px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Пока сотрудников нет.
            </div>
          ) : null}

          {!loading
            ? users.map((user) => (
                <div key={user.id} className="rounded-[22px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text-main)]">{user.name}</p>
                        <span className="rounded-full border border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.08)] px-2 py-1 text-[11px] text-[var(--accent)]">
                          {user.role_title || roleLabels[user.role]}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] ${
                            user.is_active
                              ? "border border-[rgba(63,185,80,0.18)] bg-[rgba(63,185,80,0.1)] text-[#8be28b]"
                              : "border border-[rgba(255,107,107,0.18)] bg-[rgba(255,107,107,0.08)] text-[#ffb4b4]"
                          }`}
                        >
                          {user.is_active ? "Активен" : "Отключен"}
                        </span>
                        {user.id === currentUserId ? (
                          <span className="rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-1 text-[11px] text-[var(--text-muted)]">Вы</span>
                        ) : null}
                        {user.trainer_profile ? (
                          <span className="rounded-full border border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.08)] px-2 py-1 text-[11px] text-[var(--accent)]">
                            Карточка тренера
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-3 text-xs text-[var(--text-muted)]">Email: {user.email || "Не указан"}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Телефон: {user.phone || "Не указан"}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Последний вход: {formatLastLogin(user.last_login_at)}</p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {moduleOrder
                          .filter((module) => user.modules.includes(module))
                          .map((module) => (
                            <span
                              key={module}
                              className="rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
                            >
                              {moduleLabels[module]}
                            </span>
                          ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!canManageListedUser(user)}
                        onClick={() => startEdit(user)}
                        className="inline-flex items-center rounded-2xl border border-[var(--line-soft)] px-3 py-2 text-xs font-medium text-[var(--text-main)] transition hover:border-[rgba(0,191,165,0.24)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        disabled={submitting || !canManageListedUser(user)}
                        onClick={() => handleSendTemporaryPassword(user)}
                        className="inline-flex items-center rounded-2xl border border-[rgba(0,191,165,0.18)] px-3 py-2 text-xs font-medium text-[var(--accent)] transition hover:border-[rgba(0,191,165,0.34)] disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        Новый пароль
                      </button>
                      {user.id !== currentUserId && canManageListedUser(user) ? (
                        <>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => toggleUserActivity(user)}
                            className={`inline-flex items-center rounded-2xl border px-3 py-2 text-xs font-medium transition ${
                              user.is_active
                                ? "border-[rgba(255,107,107,0.18)] text-[#ffb4b4] hover:border-[rgba(255,107,107,0.34)]"
                                : "border-[rgba(0,191,165,0.18)] text-[var(--accent)] hover:border-[rgba(0,191,165,0.34)]"
                            } disabled:cursor-not-allowed disabled:opacity-70`}
                          >
                            {user.is_active ? "Отключить" : "Включить"}
                          </button>
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => handleDeleteUser(user)}
                            className="inline-flex items-center rounded-2xl border border-[rgba(255,107,107,0.18)] px-3 py-2 text-xs font-medium text-[#ffb4b4] transition hover:border-[rgba(255,107,107,0.34)] disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            Удалить
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            : null}
        </div>
      </section>
    </div>
  );
}
