"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  ClientDetail,
  fetchClient,
  freezeSubscription,
  unfreezeSubscription,
  updateClient,
} from "@/lib/api/clients";
import { hasModuleAccess, type AuthModulePermission } from "@/lib/access";
import {
  BarcodeVisual,
  clientInputCls,
  clientLabelCls,
  describeSubscription,
  formatClientDate,
  formatClientDateTime,
  formatClientName,
  getSubscriptionStatusMeta,
  getSubscriptionTypeLabel,
  getVisitTypeLabel,
} from "@/components/clients/shared";

function normalizeDateValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return new Date(value).toISOString().slice(0, 10);
}

function ReadonlyField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <p className={clientLabelCls}>{label}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-main)]">{value || "—"}</p>
    </div>
  );
}

function AthleteStat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
      <p className={clientLabelCls}>{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--text-main)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

function AthleteEmptyBlock({ title, text, action }: { title: string; text: string; action: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-main)]">{title}</p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{text}</p>
        </div>
        <button
          type="button"
          className="rounded-[14px] border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--text-muted)]"
          disabled
        >
          {action}
        </button>
      </div>
    </div>
  );
}

function AthleteMetricGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
      <p className="text-sm font-semibold text-[var(--text-main)]">{title}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="rounded-[14px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
            <p className="text-xs text-[var(--text-main)]">{item}</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">Не заполнено</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AthleteProfilePanel({ client }: { client: ClientDetail }) {
  const currentSubscription =
    client.subscriptions.find((item) => item.status === "active") ??
    client.subscriptions.find((item) => item.status === "frozen") ??
    null;
  const lastVisit = client.visits[0] ?? null;

  return (
    <div className="mt-6 rounded-[24px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.025)] p-5">
      <div>
        <p className="font-[family:var(--font-heading)] text-lg font-semibold text-[var(--text-main)]">
          Профиль атлета
        </p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Спортивная часть карточки клиента: цели, ограничения, навыки и рабочие показатели.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <AthleteStat label="Посещений" value={client.visits.length} hint="последние 20 в карточке" />
        <AthleteStat
          label="Абонемент"
          value={currentSubscription ? getSubscriptionStatusMeta(currentSubscription.status).label : "—"}
          hint={currentSubscription ? describeSubscription(currentSubscription) : "нет активного доступа"}
        />
        <AthleteStat
          label="Последняя тренировка"
          value={lastVisit ? formatClientDate(lastVisit.visited_at) : "—"}
          hint={lastVisit ? getVisitTypeLabel(lastVisit.visit_type) : "посещений пока нет"}
        />
      </div>

      <div className="mt-4 space-y-4">
        <AthleteMetricGroup
          title="Силовые показатели и 1ПМ"
          items={[
            "Присед со штангой на спине",
            "Фронтальный присед",
            "Присед со штангой над головой",
            "Рывок",
            "Взятие + толчок",
            "Взятие на грудь",
            "Становая тяга",
            "Жим лёжа",
            "Строгий жим стоя",
            "Толчковый швунг",
          ]}
        />
        <AthleteMetricGroup
          title="Гимнастика и выносливость"
          items={[
            "Максимум строгих подтягиваний",
            "Гребля 1 км",
            "Бег 5 км",
            "Бег 10 км",
          ]}
        />
        <AthleteEmptyBlock
          title="Навыки и ограничения"
          text="Уровни навыков, цели, травмы и ограничения относятся к профилю атлета, а не к расписанию."
          action="Добавим поля"
        />
      </div>
    </div>
  );
}

export default function ClientDetailsPage() {
  const params = useParams<{ id: string }>();
  const clientId = String(params.id);

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [currentModules, setCurrentModules] = useState<AuthModulePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<"freeze" | "unfreeze" | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    middle_name: "",
    phone: "",
    email: "",
    birth_date: "",
    discount: "",
    comment: "",
  });

  const canUpdateClient = hasModuleAccess(currentModules, "clients_update");

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/auth-api/me");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { data?: { user?: { modules?: AuthModulePermission[] } } };
        if (!cancelled) {
          setCurrentModules(data.data?.user?.modules ?? []);
        }
      } catch {
        if (!cancelled) {
          setCurrentModules([]);
        }
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canUpdateClient && editing) {
      setEditing(false);
    }
  }, [canUpdateClient, editing]);

  useEffect(() => {
    let cancelled = false;

    async function loadClient() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchClient(clientId);
        if (cancelled) {
          return;
        }

        setClient(data);
        setForm({
          first_name: data.first_name ?? "",
          last_name: data.last_name ?? "",
          middle_name: data.middle_name ?? "",
          phone: data.phone ?? "",
          email: data.email ?? "",
          birth_date: normalizeDateValue(data.birth_date),
          discount: data.discount ? String(Number.parseFloat(data.discount)) : "",
          comment: data.comment ?? "",
        });
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить клиента");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadClient();

    return () => {
      cancelled = true;
    };
  }, [clientId, reloadToken]);

  const currentSubscription = useMemo(() => {
    if (!client) {
      return null;
    }

    return (
      client.subscriptions.find((item) => item.status === "active") ??
      client.subscriptions.find((item) => item.status === "frozen") ??
      null
    );
  }, [client]);

  async function handleSave() {
    if (!client) {
      return;
    }

    if (!canUpdateClient) {
      setError("Недостаточно прав доступа");
      return;
    }

    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("Укажите имя и фамилию");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateClient(client.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        middle_name: form.middle_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        birth_date: form.birth_date || null,
        discount: form.discount ? Number.parseFloat(form.discount) : 0,
        comment: form.comment.trim() || null,
      });

      setEditing(false);
      setReloadToken((value) => value + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить клиента");
    } finally {
      setSaving(false);
    }
  }

  async function handleFreeze() {
    if (!currentSubscription) {
      return;
    }

    const reason = window.prompt("Причина заморозки", "") ?? "";
    setBusyAction("freeze");
    setError(null);

    try {
      await freezeSubscription(currentSubscription.id, reason);
      setReloadToken((value) => value + 1);
    } catch (freezeError) {
      setError(freezeError instanceof Error ? freezeError.message : "Не удалось заморозить абонемент");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUnfreeze() {
    if (!currentSubscription) {
      return;
    }

    setBusyAction("unfreeze");
    setError(null);

    try {
      await unfreezeSubscription(currentSubscription.id);
      setReloadToken((value) => value + 1);
    } catch (unfreezeError) {
      setError(unfreezeError instanceof Error ? unfreezeError.message : "Не удалось разморозить абонемент");
    } finally {
      setBusyAction(null);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-sm text-[var(--text-muted)]">Загружаем клиента...</div>;
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <Link href="/clients" className="text-sm text-[var(--accent)] underline underline-offset-4">
          ← Назад к списку
        </Link>
        <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-10 text-sm text-[var(--danger)]">
          {error ?? "Клиент не найден"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link href="/clients" className="text-sm text-[var(--accent)] underline underline-offset-4">
            ← Назад к списку
          </Link>
          <h1 className="mt-3 font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)]">
            {formatClientName(client)}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">Клиент #{client.id}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-[20px] border border-[rgba(248,81,73,0.28)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.95fr)]">
        <section className="space-y-5">
          <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
                  Карточка клиента
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Контакты и персональная скидка</p>
              </div>

              {!editing && canUpdateClient ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                >
                  Редактировать
                </button>
              ) : editing ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="rounded-[16px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062b26] disabled:opacity-50"
                  >
                    {saving ? "Сохраняем..." : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setReloadToken((value) => value + 1);
                    }}
                    className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)]"
                  >
                    Отмена
                  </button>
                </div>
              ) : null}
            </div>

            {editing ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={clientLabelCls}>Фамилия</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                    className={`mt-2 ${clientInputCls}`}
                  />
                </div>
                <div>
                  <label className={clientLabelCls}>Имя</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                    className={`mt-2 ${clientInputCls}`}
                  />
                </div>
                <div>
                  <label className={clientLabelCls}>Отчество</label>
                  <input
                    type="text"
                    value={form.middle_name}
                    onChange={(event) => setForm((prev) => ({ ...prev, middle_name: event.target.value }))}
                    className={`mt-2 ${clientInputCls}`}
                  />
                </div>
                <div>
                  <label className={clientLabelCls}>Телефон</label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                    className={`mt-2 ${clientInputCls}`}
                  />
                </div>
                <div>
                  <label className={clientLabelCls}>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    className={`mt-2 ${clientInputCls}`}
                  />
                </div>
                <div>
                  <label className={clientLabelCls}>Дата рождения</label>
                  <input
                    type="date"
                    value={form.birth_date}
                    onChange={(event) => setForm((prev) => ({ ...prev, birth_date: event.target.value }))}
                    className={`mt-2 ${clientInputCls}`}
                  />
                </div>
                <div>
                  <label className={clientLabelCls}>Персональная скидка</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.discount}
                    onChange={(event) => setForm((prev) => ({ ...prev, discount: event.target.value }))}
                    className={`mt-2 ${clientInputCls}`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={clientLabelCls}>Комментарий</label>
                  <textarea
                    rows={4}
                    value={form.comment}
                    onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
                    className={`mt-2 ${clientInputCls} resize-none`}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <ReadonlyField label="Фамилия" value={client.last_name ?? ""} />
                <ReadonlyField label="Имя" value={client.first_name ?? ""} />
                <ReadonlyField label="Отчество" value={client.middle_name ?? ""} />
                <ReadonlyField label="Телефон" value={client.phone ?? ""} />
                <ReadonlyField label="Email" value={client.email ?? ""} />
                <ReadonlyField label="Дата рождения" value={formatClientDate(client.birth_date)} />
                <ReadonlyField label="Персональная скидка" value={`${Number.parseFloat(client.discount || "0")} %`} />
                <ReadonlyField label="Комментарий" value={client.comment ?? ""} wide />
              </div>
            )}

            <AthleteProfilePanel client={client} />
          </div>

          <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
            <div>
              <div>
                <p className={clientLabelCls}>Штрихкод клиента</p>
                {client.barcode ? (
                  <BarcodeVisual value={client.barcode} />
                ) : (
                  <p className="mt-3 text-sm text-[var(--text-muted)]">Штрихкод не задан</p>
                )}
              </div>

              {false && <div className="space-y-4">
                <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
                  <p className={clientLabelCls}>Дата рождения</p>
                  <p className="mt-2 text-sm text-[var(--text-main)]">{formatClientDate(client?.birth_date ?? null)}</p>
                </div>
                <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
                  <p className={clientLabelCls}>Персональная скидка</p>
                  <p className="mt-2 text-sm text-[var(--text-main)]">{Number.parseFloat(client?.discount || "0")} %</p>
                </div>
              </div>}
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
                  Абонемент
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Текущий доступ и управление заморозкой</p>
              </div>
            </div>

            {currentSubscription ? (
              <div className="mt-5 rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-[var(--text-main)]">
                      {getSubscriptionTypeLabel(currentSubscription.type)}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">{describeSubscription(currentSubscription)}</p>
                  </div>

                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs ${getSubscriptionStatusMeta(currentSubscription.status).className}`}
                  >
                    {getSubscriptionStatusMeta(currentSubscription.status).label}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className={clientLabelCls}>Начало</p>
                    <p className="mt-2 text-sm text-[var(--text-main)]">{formatClientDate(currentSubscription.started_at)}</p>
                  </div>
                  <div>
                    <p className={clientLabelCls}>Окончание</p>
                    <p className="mt-2 text-sm text-[var(--text-main)]">{formatClientDate(currentSubscription.expires_at)}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {currentSubscription.status === "active" && (
                    <button
                      type="button"
                      onClick={() => void handleFreeze()}
                      disabled={busyAction === "freeze"}
                      className="rounded-[16px] border border-[rgba(56,139,253,0.24)] px-4 py-2 text-sm text-[#6cb6ff] transition-colors hover:bg-[rgba(56,139,253,0.12)] disabled:opacity-50"
                    >
                      {busyAction === "freeze" ? "Замораживаем..." : "Заморозить"}
                    </button>
                  )}

                  {currentSubscription.status === "frozen" && (
                    <button
                      type="button"
                      onClick={() => void handleUnfreeze()}
                      disabled={busyAction === "unfreeze"}
                      className="rounded-[16px] border border-[rgba(0,191,165,0.24)] px-4 py-2 text-sm text-[var(--accent)] transition-colors hover:bg-[rgba(0,191,165,0.1)] disabled:opacity-50"
                    >
                      {busyAction === "unfreeze" ? "Размораживаем..." : "Разморозить"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-[22px] border border-dashed border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-8 text-center text-sm text-[var(--text-muted)]">
                У клиента пока нет активного абонемента
              </div>
            )}

            <div className="mt-5 rounded-[22px] border border-[rgba(0,191,165,0.2)] bg-[rgba(0,191,165,0.08)] px-5 py-4 text-sm text-[var(--text-muted)]">
              Абонементы оформляются только через продажи. Если нужно выдать доступ вручную, проведите услугу через кассу со скидкой 100%.
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
            <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
              История посещений
            </p>
            <div className="mt-5 space-y-3">
              {client.visits.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Посещений пока нет</p>
              ) : (
                client.visits.map((visit) => (
                  <div
                    key={visit.id}
                    className="rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3"
                  >
                    <p className="text-sm font-medium text-[var(--text-main)]">{getVisitTypeLabel(visit.visit_type)}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{formatClientDateTime(visit.visited_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
            <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
              История абонементов
            </p>
            <div className="mt-5 space-y-3">
              {client.subscriptions.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Абонементов пока нет</p>
              ) : (
                client.subscriptions.map((subscription) => {
                  const meta = getSubscriptionStatusMeta(subscription.status);

                  return (
                    <div
                      key={subscription.id}
                      className="rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-main)]">
                            {getSubscriptionTypeLabel(subscription.type)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{describeSubscription(subscription)}</p>
                          {subscription.order_id && (
                            <p className="mt-2 text-xs text-[var(--text-muted)]">Продажа #{String(subscription.order_id).slice(0, 8)}</p>
                          )}
                        </div>

                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${meta.className}`}>
                          {meta.label}
                        </span>
                      </div>

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className={clientLabelCls}>Создан</p>
                          <p className="mt-1 text-xs text-[var(--text-main)]">{formatClientDateTime(subscription.created_at)}</p>
                        </div>
                        <div>
                          <p className={clientLabelCls}>Окончание</p>
                          <p className="mt-1 text-xs text-[var(--text-main)]">{formatClientDate(subscription.expires_at)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
