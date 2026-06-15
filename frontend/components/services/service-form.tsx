"use client";

import { useEffect, useMemo, useState } from "react";

import { useProductTypes } from "@/hooks/useProductTypes";
import { useTrainingTypes } from "@/hooks/useTrainingTypes";
import {
  archiveProduct,
  createProduct,
  fetchProductSubscriptionParams,
  Product,
  ProductSubscriptionActivationType,
  ProductSubscriptionParams,
  ProductSubscriptionType,
  saveProductSubscriptionParams,
  updateProduct,
} from "@/lib/api/products";

const inputCls =
  "w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(0,191,165,0.12)]";
const labelCls = "text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]";

type ServiceParamsForm = {
  subscription_type: ProductSubscriptionType;
  visits_total: string;
  validity_days: string;
  activation_type: ProductSubscriptionActivationType;
  freeze_days_allowed: string;
  freeze_min_days: string;
  freeze_max_count: string;
  is_family: boolean;
  training_type_ids: string[];
};

const subscriptionTypeOptions: { value: ProductSubscriptionType; label: string }[] = [
  { value: "single", label: "Разовое" },
  { value: "visits", label: "На занятия" },
  { value: "period", label: "На период" },
  { value: "unlimited", label: "Безлимит" },
];

function defaultServiceParams(): ServiceParamsForm {
  return {
    subscription_type: "visits",
    visits_total: "",
    validity_days: "",
    activation_type: "purchase",
    freeze_days_allowed: "0",
    freeze_min_days: "1",
    freeze_max_count: "",
    is_family: false,
    training_type_ids: [],
  };
}

function mapServiceParams(
  params: ProductSubscriptionParams | null,
  trainingTypeIds: string[]
): ServiceParamsForm {
  if (!params) {
    return {
      ...defaultServiceParams(),
      training_type_ids: trainingTypeIds,
    };
  }

  return {
    subscription_type: params.subscription_type,
    visits_total: params.visits_total !== null ? String(params.visits_total) : "",
    validity_days: params.validity_days !== null ? String(params.validity_days) : "",
    activation_type: params.activation_type,
    freeze_days_allowed: String(params.freeze_days_allowed ?? 0),
    freeze_min_days: String(params.freeze_min_days ?? 1),
    freeze_max_count: params.freeze_max_count !== null ? String(params.freeze_max_count) : "",
    is_family: params.is_family,
    training_type_ids: trainingTypeIds,
  };
}

function parseInteger(value: string, fallback: number | null = null) {
  if (!value.trim()) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function describeServiceParams(params: ProductSubscriptionParams | null) {
  if (!params) {
    return "Параметры не настроены";
  }

  const labels: Record<ProductSubscriptionType, string> = {
    single: "Разовое",
    visits: "На занятия",
    period: "На период",
    unlimited: "Безлимит",
  };

  const parts = [labels[params.subscription_type]];

  if ((params.subscription_type === "single" || params.subscription_type === "visits") && params.visits_total) {
    parts.push(`${params.visits_total} занятий`);
  }

  if (params.validity_days) {
    parts.push(`${params.validity_days} дн.`);
  }

  return parts.join(" • ");
}

export function ServiceForm({
  product,
  onCancel,
  onSaved,
}: {
  product?: Product;
  onCancel: () => void;
  onSaved: (product: Product) => void;
}) {
  const isEdit = Boolean(product);
  const { types } = useProductTypes();
  const { trainingTypes, loading: trainingTypesLoading } = useTrainingTypes();

  const serviceTypes = useMemo(
    () => types.filter((item) => !item.has_stock && item.has_sale_price),
    [types]
  );

  const [typeId, setTypeId] = useState(product?.product_type_id ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [salePrice, setSalePrice] = useState(product?.sale_price ?? "");
  const [paramsForm, setParamsForm] = useState<ServiceParamsForm>(defaultServiceParams());
  const [loadingParams, setLoadingParams] = useState(Boolean(product));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (!typeId && serviceTypes[0]?.id) {
      setTypeId(serviceTypes[0].id);
    }
  }, [serviceTypes, typeId]);

  useEffect(() => {
    if (!product) {
      setLoadingParams(false);
      return;
    }

    const currentProduct = product;
    let cancelled = false;

    async function load() {
      setLoadingParams(true);
      setError(null);

      try {
        const response = await fetchProductSubscriptionParams(currentProduct.id);
        if (cancelled) {
          return;
        }

        setParamsForm(
          mapServiceParams(
            response.params,
            response.training_types.map((item) => item.id)
          )
        );
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить параметры услуги");
        }
      } finally {
        if (!cancelled) {
          setLoadingParams(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [product]);

  const showVisits = paramsForm.subscription_type === "single" || paramsForm.subscription_type === "visits";
  const showValidity =
    paramsForm.subscription_type === "period" ||
    paramsForm.subscription_type === "unlimited" ||
    paramsForm.subscription_type === "visits";

  function toggleTrainingType(id: string) {
    setParamsForm((previous) => ({
      ...previous,
      training_type_ids: previous.training_type_ids.includes(id)
        ? previous.training_type_ids.filter((current) => current !== id)
        : [...previous.training_type_ids, id],
    }));
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Укажите название услуги");
      return;
    }

    if (!typeId) {
      setError("Не найден тип позиции для услуги");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const savedProduct = product
        ? await updateProduct(product.id, {
            name: name.trim(),
            product_type_id: Number.parseInt(typeId, 10),
            sale_price: salePrice.trim() ? Number.parseFloat(salePrice) : null,
          })
        : await createProduct({
            name: name.trim(),
            product_type_id: Number.parseInt(typeId, 10),
            sale_price: salePrice.trim() ? Number.parseFloat(salePrice) : undefined,
          });

      await saveProductSubscriptionParams(savedProduct.id, {
        subscription_type: paramsForm.subscription_type,
        visits_total: showVisits
          ? parseInteger(
              paramsForm.subscription_type === "single" && !paramsForm.visits_total.trim()
                ? "1"
                : paramsForm.visits_total,
              null
            )
          : null,
        validity_days: showValidity ? parseInteger(paramsForm.validity_days, null) : null,
        activation_type: paramsForm.activation_type,
        freeze_days_allowed: parseInteger(paramsForm.freeze_days_allowed, 0) ?? 0,
        freeze_min_days: parseInteger(paramsForm.freeze_min_days, 1) ?? 1,
        freeze_max_count: parseInteger(paramsForm.freeze_max_count, null),
        is_family: paramsForm.is_family,
        training_type_ids: paramsForm.training_type_ids.map((item) => Number.parseInt(item, 10)),
      });

      onSaved(savedProduct);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить услугу");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!product) {
      return;
    }

    const nextArchived = !product.is_archived;
    const actionLabel = nextArchived ? "Архивировать" : "Вернуть из архива";

    if (!window.confirm(`${actionLabel} "${product.name}"?`)) {
      return;
    }

    setArchiving(true);
    setError(null);

    try {
      const updated = await archiveProduct(product.id, nextArchived);
      onSaved({ ...product, ...updated });
    } catch (archiveError) {
      setError(
        archiveError instanceof Error
          ? archiveError.message
          : nextArchived
            ? "Не удалось архивировать услугу"
            : "Не удалось вернуть услугу из архива"
      );
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-5 rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
            {product ? "Редактирование услуги" : "Новая услуга"}
          </p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Название, цена и параметры абонемента в одной форме.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className={labelCls}>Название *</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`mt-1 ${inputCls}`}
            autoFocus
          />
        </div>

        <div>
          <label className={labelCls}>Цена продажи ₽</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={salePrice}
            onChange={(event) => setSalePrice(event.target.value)}
            placeholder="не указана"
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div>
          <label className={labelCls}>Тип позиции</label>
          <select
            value={typeId}
            onChange={(event) => setTypeId(event.target.value)}
            className={`mt-1 ${inputCls}`}
          >
            {serviceTypes.length === 0 && <option value="">Нет доступных типов</option>}
            {serviceTypes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadingParams ? (
        <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-6 text-sm text-[var(--text-muted)]">
          Загружаем параметры услуги...
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Тип абонемента</label>
              <select
                value={paramsForm.subscription_type}
                onChange={(event) =>
                  setParamsForm((previous) => ({
                    ...previous,
                    subscription_type: event.target.value as ProductSubscriptionType,
                  }))
                }
                className={`mt-1 ${inputCls}`}
              >
                {subscriptionTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            {showVisits ? (
              <div>
                <label className={labelCls}>Количество занятий</label>
                <input
                  type="number"
                  min="1"
                  value={
                    paramsForm.subscription_type === "single" && !paramsForm.visits_total.trim()
                      ? "1"
                      : paramsForm.visits_total
                  }
                  onChange={(event) =>
                    setParamsForm((previous) => ({ ...previous, visits_total: event.target.value }))
                  }
                  className={`mt-1 ${inputCls}`}
                />
              </div>
            ) : (
              <div>
                <label className={labelCls}>Количество занятий</label>
                <div className="mt-1 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-muted)]">
                  Не используется для этого типа
                </div>
              </div>
            )}

            {showValidity && (
              <div>
                <label className={labelCls}>Срок действия, дней</label>
                <input
                  type="number"
                  min="0"
                  value={paramsForm.validity_days}
                  onChange={(event) =>
                    setParamsForm((previous) => ({ ...previous, validity_days: event.target.value }))
                  }
                  className={`mt-1 ${inputCls}`}
                />
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Активация</label>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-main)]">
                <input
                  type="radio"
                  checked={paramsForm.activation_type === "purchase"}
                  onChange={() =>
                    setParamsForm((previous) => ({ ...previous, activation_type: "purchase" }))
                  }
                  className="h-4 w-4"
                />
                Сразу после покупки
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-main)]">
                <input
                  type="radio"
                  checked={paramsForm.activation_type === "first_visit"}
                  onChange={() =>
                    setParamsForm((previous) => ({ ...previous, activation_type: "first_visit" }))
                  }
                  className="h-4 w-4"
                />
                С первого посещения
              </label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={labelCls}>Доступно дней заморозки</label>
              <input
                type="number"
                min="0"
                value={paramsForm.freeze_days_allowed}
                onChange={(event) =>
                  setParamsForm((previous) => ({
                    ...previous,
                    freeze_days_allowed: event.target.value,
                  }))
                }
                className={`mt-1 ${inputCls}`}
              />
            </div>

            <div>
              <label className={labelCls}>Минимальный срок</label>
              <input
                type="number"
                min="1"
                value={paramsForm.freeze_min_days}
                onChange={(event) =>
                  setParamsForm((previous) => ({ ...previous, freeze_min_days: event.target.value }))
                }
                className={`mt-1 ${inputCls}`}
              />
            </div>

            <div>
              <label className={labelCls}>Максимум заморозок</label>
              <input
                type="number"
                min="0"
                value={paramsForm.freeze_max_count}
                onChange={(event) =>
                  setParamsForm((previous) => ({ ...previous, freeze_max_count: event.target.value }))
                }
                placeholder="без ограничений"
                className={`mt-1 ${inputCls}`}
              />
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm text-[var(--text-main)]">
            <input
              type="checkbox"
              checked={paramsForm.is_family}
              onChange={(event) =>
                setParamsForm((previous) => ({ ...previous, is_family: event.target.checked }))
              }
              className="h-4 w-4"
            />
            Семейный абонемент
          </label>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className={labelCls}>Виды тренировок</label>
              <span className="text-xs text-[var(--text-muted)]">
                Если ничего не выбрано — действует на все виды
              </span>
            </div>

            {trainingTypesLoading ? (
              <p className="mt-3 text-sm text-[var(--text-muted)]">Загружаем виды тренировок...</p>
            ) : trainingTypes.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--text-muted)]">Виды тренировок ещё не созданы</p>
            ) : (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {trainingTypes.map((item) => {
                  const checked = paramsForm.training_type_ids.includes(item.id);

                  return (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                        checked
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-main)]"
                          : "border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--text-main)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTrainingType(item.id)}
                        className="h-4 w-4"
                      />
                      <span
                        className="h-3 w-3 rounded-full border border-white/10"
                        style={{ backgroundColor: item.color ?? "#00BCD4" }}
                      />
                      <span className="flex-1">{item.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={saving}
          className="rounded-[18px] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Сохраняем..." : product ? "Сохранить" : "Создать услугу"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[18px] border border-[var(--line-soft)] px-5 py-3 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
        >
          Отмена
        </button>
        {product && (
          <button
            type="button"
            onClick={() => {
              void handleArchive();
            }}
            disabled={archiving}
            className={`ml-auto rounded-[18px] border px-5 py-3 text-sm transition-colors disabled:opacity-50 ${
              product.is_archived
                ? "border-[rgba(0,191,165,0.35)] text-[var(--accent)] hover:bg-[rgba(0,191,165,0.08)]"
                : "border-[rgba(248,81,73,0.35)] text-[var(--danger)] hover:bg-[rgba(248,81,73,0.08)]"
            }`}
          >
            {archiving
              ? product.is_archived
                ? "Возвращаем..."
                : "Архивируем..."
              : product.is_archived
                ? "Вернуть из архива"
                : "Архивировать"}
          </button>
        )}
      </div>
    </div>
  );
}
