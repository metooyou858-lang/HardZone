"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  ClientSubscription,
  ClientDetail,
  LegacySubscriptionService,
  SubscriptionStatus,
  SubscriptionType,
  createManualLegacySubscription,
  fetchLegacySubscriptionServices,
  fetchClient,
  freezeSubscription,
  syncSubscriptionProductParams,
  unfreezeSubscription,
  updateClient,
  updateSubscription,
  uploadClientPhoto,
} from "@/lib/api/clients";
import { hasModuleAccess, type AuthModulePermission } from "@/lib/access";
import { describeServiceAccess } from "@/lib/service-access-labels";
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

const emptyLegacySubscriptionForm = {
  product_id: "",
  visits_left: "",
  started_at: "",
  note: "Перенос из старой CRM",
};

const subscriptionTypeOptions: Array<{ value: SubscriptionType; label: string }> = [
  { value: "single", label: "Разовый" },
  { value: "visits", label: "На занятия" },
  { value: "period", label: "На период" },
  { value: "unlimited", label: "Безлимит" },
];

const subscriptionStatusOptions: Array<{ value: SubscriptionStatus; label: string }> = [
  { value: "active", label: "Активен" },
  { value: "frozen", label: "Заморожен" },
  { value: "expired", label: "Истёк" },
  { value: "exhausted", label: "Исчерпан" },
  { value: "cancelled", label: "Отключён" },
];

function subscriptionToForm(subscription: ClientSubscription) {
  return {
    product_id: subscription.product_id ?? "",
    type: subscription.type,
    visits_total: subscription.visits_total === null ? "" : String(subscription.visits_total),
    visits_left: subscription.visits_left === null ? "" : String(subscription.visits_left),
    started_at: normalizeDateValue(subscription.started_at),
    expires_at: normalizeDateValue(subscription.expires_at),
    status: subscription.status,
    reason: "",
  };
}

function ReadonlyField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <p className={clientLabelCls}>{label}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-main)]">{value || "—"}</p>
    </div>
  );
}

function ClientPhoto({
  client,
  canUpdate,
  uploading,
  onSelect,
}: {
  client: ClientDetail;
  canUpdate: boolean;
  uploading: boolean;
  onSelect: (file: File) => void;
}) {
  const initials = [client.first_name, client.last_name]
    .filter(Boolean)
    .map((part) => part.trim().slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <div className="h-24 w-24 overflow-hidden rounded-full border border-[var(--line-soft)] bg-[var(--bg-card-soft)]">
        {client.photo_url ? (
          <Image
            src={client.photo_url}
            alt={formatClientName(client)}
            width={96}
            height={96}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[var(--text-muted)]">
            {initials || "HZ"}
          </div>
        )}
      </div>

      {canUpdate && (
        <label className="inline-flex cursor-pointer rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]">
          {uploading ? "Загружаем..." : client.photo_url ? "Заменить фото" : "Загрузить фото"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                onSelect(file);
              }
            }}
          />
        </label>
      )}
    </div>
  );
}

function ManualLegacySubscriptionPanel({
  form,
  services,
  saving,
  open,
  onToggle,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: typeof emptyLegacySubscriptionForm;
  services: LegacySubscriptionService[];
  saving: boolean;
  open: boolean;
  onToggle: () => void;
  onChange: (value: typeof emptyLegacySubscriptionForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const selectedService = services.find((service) => String(service.id) === String(form.product_id)) || null;
  const needsVisitsLeft = selectedService?.subscription_type === "single" || selectedService?.subscription_type === "visits";
  const calculatedExpiresAt =
    selectedService?.validity_days && form.started_at
      ? new Date(new Date(form.started_at).getTime() + selectedService.validity_days * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : null;

  return (
    <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
            Старый абонемент
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Ручной перенос без продажи, оплаты, чека и AQSI.</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
        >
          {open ? "Скрыть" : "Добавить старый"}
        </button>
      </div>

      {open && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={clientLabelCls}>Услуга</label>
            <select
              value={form.product_id}
              onChange={(event) => onChange({ ...form, product_id: event.target.value, visits_left: "" })}
              disabled={services.length === 0}
              className={`mt-2 ${clientInputCls}`}
            >
              <option value="">Выберите услугу</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
            {services.length === 0 && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">Нет активных услуг с параметрами абонемента.</p>
            )}
          </div>

          {selectedService && (
            <div className="sm:col-span-2 rounded-[18px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--text-muted)]">
              <p className="text-[var(--text-main)]">{getSubscriptionTypeLabel(selectedService.subscription_type)}</p>
              <p className="mt-1">
                Лимит: {selectedService.visits_total ?? "без лимита"} · срок: {selectedService.validity_days ? `${selectedService.validity_days} дн.` : "без срока"} · {selectedService.is_family ? "семейный" : "обычный"}
              </p>
              <p className="mt-1">
                Занятия: {describeServiceAccess(selectedService, selectedService.training_types, { lowercase: true })}
              </p>
              {calculatedExpiresAt && <p className="mt-1">Окончание будет: {formatClientDate(calculatedExpiresAt)}</p>}
            </div>
          )}

          <div>
            <label className={clientLabelCls}>Дата начала</label>
            <input
              type="date"
              value={form.started_at}
              onChange={(event) => onChange({ ...form, started_at: event.target.value })}
              className={`mt-2 ${clientInputCls}`}
            />
          </div>
          {needsVisitsLeft && (
            <div>
              <label className={clientLabelCls}>Осталось посещений</label>
              <input
                type="number"
                min="0"
                max={selectedService?.visits_total ?? undefined}
                value={form.visits_left}
                onChange={(event) => onChange({ ...form, visits_left: event.target.value })}
                className={`mt-2 ${clientInputCls}`}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className={clientLabelCls}>Комментарий</label>
            <textarea
              rows={3}
              value={form.note}
              onChange={(event) => onChange({ ...form, note: event.target.value })}
              className={`mt-2 ${clientInputCls} resize-none`}
            />
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving || services.length === 0}
              className="rounded-[16px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062b26] disabled:opacity-50"
            >
              {saving ? "Добавляем..." : "Добавить старый абонемент"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)]"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
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
  const [photoUploading, setPhotoUploading] = useState(false);
  const [busyAction, setBusyAction] = useState<"freeze" | "unfreeze" | null>(null);
  const [showLegacyForm, setShowLegacyForm] = useState(false);
  const [legacySaving, setLegacySaving] = useState(false);
  const [legacyForm, setLegacyForm] = useState(emptyLegacySubscriptionForm);
  const [legacyServices, setLegacyServices] = useState<LegacySubscriptionService[]>([]);
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null);
  const [subscriptionSaving, setSubscriptionSaving] = useState<string | null>(null);
  const [subscriptionForm, setSubscriptionForm] = useState<ReturnType<typeof subscriptionToForm> | null>(null);
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
  const canCreateLegacySubscription = hasModuleAccess(currentModules, "clients_legacy_subscriptions");

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

    async function loadLegacyServices() {
      if (!canCreateLegacySubscription && !canUpdateClient) {
        setLegacyServices([]);
        setShowLegacyForm(false);
        return;
      }

      try {
        const data = await fetchLegacySubscriptionServices();
        if (!cancelled) {
          setLegacyServices(data);
        }
      } catch (servicesError) {
        if (!cancelled) {
          setLegacyServices([]);
          setError(servicesError instanceof Error ? servicesError.message : "Не удалось загрузить услуги для старых абонементов");
        }
      }
    }

    void loadLegacyServices();

    return () => {
      cancelled = true;
    };
  }, [canCreateLegacySubscription, canUpdateClient]);

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

  const activeSubscriptions = useMemo(() => {
    if (!client) {
      return [];
    }

    return client.subscriptions.filter((item) => item.status === "active");
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

  async function handlePhotoSelect(file: File) {
    if (!client) {
      return;
    }

    if (!canUpdateClient) {
      setError("Недостаточно прав доступа");
      return;
    }

    setPhotoUploading(true);
    setError(null);

    try {
      await uploadClientPhoto(client.id, file);
      setReloadToken((value) => value + 1);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить фото клиента");
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleFreeze(subscription: ClientSubscription) {
    if (!subscription) {
      return;
    }

    const reason = window.prompt("Причина заморозки", "") ?? "";
    setBusyAction("freeze");
    setError(null);

    try {
      await freezeSubscription(subscription.id, reason);
      setReloadToken((value) => value + 1);
    } catch (freezeError) {
      setError(freezeError instanceof Error ? freezeError.message : "Не удалось заморозить абонемент");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUnfreeze(subscription: ClientSubscription) {
    if (!subscription) {
      return;
    }

    setBusyAction("unfreeze");
    setError(null);

    try {
      await unfreezeSubscription(subscription.id);
      setReloadToken((value) => value + 1);
    } catch (unfreezeError) {
      setError(unfreezeError instanceof Error ? unfreezeError.message : "Не удалось разморозить абонемент");
    } finally {
      setBusyAction(null);
    }
  }

  function startEditSubscription(subscription: ClientSubscription) {
    setEditingSubscriptionId(subscription.id);
    setSubscriptionForm(subscriptionToForm(subscription));
    setError(null);
  }

  function cancelEditSubscription() {
    setEditingSubscriptionId(null);
    setSubscriptionForm(null);
  }

  async function handleSaveSubscription(subscription: ClientSubscription) {
    if (!subscriptionForm) {
      return;
    }

    if (!subscriptionForm.reason.trim()) {
      setError("Укажите причину корректировки абонемента");
      return;
    }

    const visitsTotal = subscriptionForm.visits_total === "" ? null : Number.parseInt(subscriptionForm.visits_total, 10);
    const visitsLeft = subscriptionForm.visits_left === "" ? null : Number.parseInt(subscriptionForm.visits_left, 10);

    if (subscriptionForm.visits_total !== "" && !Number.isFinite(visitsTotal)) {
      setError("Укажите корректный лимит посещений");
      return;
    }

    if (subscriptionForm.visits_left !== "" && !Number.isFinite(visitsLeft)) {
      setError("Укажите корректный остаток посещений");
      return;
    }

    if (visitsTotal !== null && visitsLeft !== null && visitsLeft > visitsTotal) {
      setError("Остаток посещений не может быть больше лимита");
      return;
    }

    setSubscriptionSaving(subscription.id);
    setError(null);

    try {
      await updateSubscription(subscription.id, {
        product_id: subscriptionForm.product_id || null,
        type: subscriptionForm.type,
        visits_total: visitsTotal,
        visits_left: visitsLeft,
        started_at: subscriptionForm.started_at || null,
        expires_at: subscriptionForm.expires_at || null,
        status: subscriptionForm.status,
        reason: subscriptionForm.reason.trim(),
      });

      cancelEditSubscription();
      setReloadToken((value) => value + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить абонемент");
    } finally {
      setSubscriptionSaving(null);
    }
  }

  async function handleSyncSubscription(subscription: ClientSubscription) {
    const reason = window.prompt("Причина применения параметров услуги", "Исправление параметров оформленного абонемента") ?? "";

    if (!reason.trim()) {
      setError("Укажите причину синхронизации абонемента");
      return;
    }

    setSubscriptionSaving(subscription.id);
    setError(null);

    try {
      await syncSubscriptionProductParams(subscription.id, reason.trim());
      setReloadToken((value) => value + 1);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Не удалось применить параметры услуги");
    } finally {
      setSubscriptionSaving(null);
    }
  }

  async function handleCreateLegacySubscription() {
    if (!client) {
      return;
    }

    if (!canCreateLegacySubscription) {
      setError("Недостаточно прав доступа");
      return;
    }

    setError(null);

    if (!legacyForm.product_id) {
      setError("Выберите услугу");
      return;
    }

    if (!legacyForm.started_at) {
      setError("Укажите дату начала");
      return;
    }

    const selectedService = legacyServices.find((service) => String(service.id) === String(legacyForm.product_id)) || null;
    if (!selectedService) {
      setError("Выбранная услуга недоступна");
      return;
    }

    const needsVisitsLeft = selectedService?.subscription_type === "single" || selectedService?.subscription_type === "visits";
    const visitsLeft = needsVisitsLeft && legacyForm.visits_left
      ? Number.parseInt(legacyForm.visits_left, 10)
      : null;

    if (needsVisitsLeft && legacyForm.visits_left && !Number.isFinite(visitsLeft)) {
      setError("Укажите корректный остаток посещений");
      return;
    }

    if (needsVisitsLeft && visitsLeft !== null && selectedService.visits_total !== null && visitsLeft > selectedService.visits_total) {
      setError("Остаток посещений не может быть больше лимита услуги");
      return;
    }

    setLegacySaving(true);

    try {
      await createManualLegacySubscription({
        client_id: client.id,
        visits_left: Number.isFinite(visitsLeft) ? visitsLeft : null,
        product_id: legacyForm.product_id,
        started_at: legacyForm.started_at,
        note: legacyForm.note.trim() || null,
      });

      setShowLegacyForm(false);
      setLegacyForm(emptyLegacySubscriptionForm);
      setReloadToken((value) => value + 1);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось добавить старый абонемент");
    } finally {
      setLegacySaving(false);
    }
  }

  function renderSubscriptionCard(subscription: ClientSubscription, options?: { compact?: boolean }) {
    const meta = getSubscriptionStatusMeta(subscription.status);
    const activeSubscriptionForm = editingSubscriptionId === subscription.id ? subscriptionForm : null;
    const isEditing = Boolean(activeSubscriptionForm);
    const canEditSubscription = canUpdateClient;
    const busy = subscriptionSaving === subscription.id;

    return (
      <div
        key={subscription.id}
        className="rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={options?.compact ? "text-sm font-semibold text-[var(--text-main)]" : "text-lg font-semibold text-[var(--text-main)]"}>
              {subscription.product_name || getSubscriptionTypeLabel(subscription.type)}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {getSubscriptionTypeLabel(subscription.type)} · {describeSubscription(subscription)}
            </p>
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
            <p className={clientLabelCls}>Начало</p>
            <p className="mt-1 text-xs text-[var(--text-main)]">{formatClientDate(subscription.started_at)}</p>
          </div>
          <div>
            <p className={clientLabelCls}>Окончание</p>
            <p className="mt-1 text-xs text-[var(--text-main)]">{formatClientDate(subscription.expires_at)}</p>
          </div>
          <div>
            <p className={clientLabelCls}>Лимит</p>
            <p className="mt-1 text-xs text-[var(--text-main)]">{subscription.visits_total ?? "без лимита"}</p>
          </div>
          <div>
            <p className={clientLabelCls}>Осталось</p>
            <p className="mt-1 text-xs text-[var(--text-main)]">{subscription.visits_left ?? "—"}</p>
          </div>
        </div>

        {canEditSubscription && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => startEditSubscription(subscription)}
              className="rounded-[14px] border border-[var(--line-soft)] px-3 py-2 text-xs text-[var(--text-main)]"
            >
              Редактировать
            </button>
            <button
              type="button"
              onClick={() => void handleSyncSubscription(subscription)}
              disabled={busy || !subscription.product_id}
              className="rounded-[14px] border border-[rgba(0,191,165,0.24)] px-3 py-2 text-xs text-[var(--accent)] disabled:opacity-50"
            >
              {busy ? "Применяем..." : "Применить параметры услуги"}
            </button>
            {subscription.status === "active" && (
              <button
                type="button"
                onClick={() => void handleFreeze(subscription)}
                disabled={busyAction === "freeze"}
                className="rounded-[14px] border border-[rgba(56,139,253,0.24)] px-3 py-2 text-xs text-[#6cb6ff] disabled:opacity-50"
              >
                {busyAction === "freeze" ? "Замораживаем..." : "Заморозить"}
              </button>
            )}
            {subscription.status === "frozen" && (
              <button
                type="button"
                onClick={() => void handleUnfreeze(subscription)}
                disabled={busyAction === "unfreeze"}
                className="rounded-[14px] border border-[rgba(0,191,165,0.24)] px-3 py-2 text-xs text-[var(--accent)] disabled:opacity-50"
              >
                {busyAction === "unfreeze" ? "Размораживаем..." : "Разморозить"}
              </button>
            )}
          </div>
        )}

        {isEditing && activeSubscriptionForm && (
          <div className="mt-4 grid gap-3 rounded-[16px] border border-[var(--line-soft)] bg-[rgba(255,255,255,0.03)] p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={clientLabelCls}>Услуга</label>
              <select
                value={activeSubscriptionForm.product_id}
                onChange={(event) => setSubscriptionForm({ ...activeSubscriptionForm, product_id: event.target.value })}
                className={`mt-2 ${clientInputCls}`}
              >
                <option value="">Без привязки</option>
                {legacyServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={clientLabelCls}>Тип</label>
              <select
                value={activeSubscriptionForm.type}
                onChange={(event) => setSubscriptionForm({ ...activeSubscriptionForm, type: event.target.value as SubscriptionType })}
                className={`mt-2 ${clientInputCls}`}
              >
                {subscriptionTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={clientLabelCls}>Статус</label>
              <select
                value={activeSubscriptionForm.status}
                onChange={(event) => setSubscriptionForm({ ...activeSubscriptionForm, status: event.target.value as SubscriptionStatus })}
                className={`mt-2 ${clientInputCls}`}
              >
                {subscriptionStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={clientLabelCls}>Всего посещений</label>
              <input
                type="number"
                min="0"
                value={activeSubscriptionForm.visits_total}
                onChange={(event) => setSubscriptionForm({ ...activeSubscriptionForm, visits_total: event.target.value })}
                className={`mt-2 ${clientInputCls}`}
              />
            </div>

            <div>
              <label className={clientLabelCls}>Осталось посещений</label>
              <input
                type="number"
                min="0"
                value={activeSubscriptionForm.visits_left}
                onChange={(event) => setSubscriptionForm({ ...activeSubscriptionForm, visits_left: event.target.value })}
                className={`mt-2 ${clientInputCls}`}
              />
            </div>

            <div>
              <label className={clientLabelCls}>Дата начала</label>
              <input
                type="date"
                value={activeSubscriptionForm.started_at}
                onChange={(event) => setSubscriptionForm({ ...activeSubscriptionForm, started_at: event.target.value })}
                className={`mt-2 ${clientInputCls}`}
              />
            </div>

            <div>
              <label className={clientLabelCls}>Дата окончания</label>
              <input
                type="date"
                value={activeSubscriptionForm.expires_at}
                onChange={(event) => setSubscriptionForm({ ...activeSubscriptionForm, expires_at: event.target.value })}
                className={`mt-2 ${clientInputCls}`}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={clientLabelCls}>Причина корректировки</label>
              <textarea
                rows={3}
                value={activeSubscriptionForm.reason}
                onChange={(event) => setSubscriptionForm({ ...activeSubscriptionForm, reason: event.target.value })}
                className={`mt-2 ${clientInputCls} resize-none`}
                placeholder="Например: исправление ошибочно оформленного абонемента"
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSaveSubscription(subscription)}
                disabled={busy}
                className="rounded-[14px] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#062b26] disabled:opacity-50"
              >
                {busy ? "Сохраняем..." : "Сохранить"}
              </button>
              <button
                type="button"
                onClick={cancelEditSubscription}
                className="rounded-[14px] border border-[var(--line-soft)] px-3 py-2 text-xs text-[var(--text-main)]"
              >
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    );
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <ClientPhoto
                  client={client}
                  canUpdate={canUpdateClient}
                  uploading={photoUploading}
                  onSelect={(file) => void handlePhotoSelect(file)}
                />
                <div>
                <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
                  Карточка клиента
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Контакты и персональная скидка</p>
              </div>

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
                  Активные абонементы
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Доступы, которые сейчас можно использовать для списания</p>
              </div>
            </div>

            {activeSubscriptions.length > 0 ? (
              <div className="mt-5 space-y-3">
                {activeSubscriptions.map((subscription) => renderSubscriptionCard(subscription))}
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

          {canCreateLegacySubscription && (
            <ManualLegacySubscriptionPanel
              form={legacyForm}
              services={legacyServices}
              saving={legacySaving}
              open={showLegacyForm}
              onToggle={() => setShowLegacyForm((value) => !value)}
              onChange={setLegacyForm}
              onSubmit={() => void handleCreateLegacySubscription()}
              onCancel={() => {
                setShowLegacyForm(false);
                setLegacyForm(emptyLegacySubscriptionForm);
              }}
            />
          )}

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
                client.subscriptions.map((subscription) => renderSubscriptionCard(subscription, { compact: true }))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
