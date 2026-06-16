"use client";

import { useEffect, useMemo, useState } from "react";

import { useCategories } from "@/hooks/useCategories";
import { useEditProduct } from "@/hooks/useEditProduct";
import { useProductTypes } from "@/hooks/useProductTypes";
import { useTrainingTypes } from "@/hooks/useTrainingTypes";
import {
  archiveProduct,
  fetchProductSubscriptionParams,
  Product,
  ProductSubscriptionActivationType,
  ProductSubscriptionParams,
  ProductSubscriptionType,
  saveProductSubscriptionParams,
} from "@/lib/api/products";
import type { TrainingType } from "@/lib/api/training-types";

const inputCls =
  "w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20";
const labelCls = "text-xs font-medium uppercase tracking-wider text-slate-400";

type EditTab = "main" | "service";

type ServiceParamsForm = {
  subscription_type: ProductSubscriptionType;
  visits_total: string;
  validity_days: string;
  activation_type: ProductSubscriptionActivationType;
  freeze_days_allowed: string;
  freeze_min_days: string;
  freeze_max_count: string;
  is_family: boolean;
  allow_free_visit: boolean;
  allow_group_training: boolean;
  allow_personal_training: boolean;
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
    allow_free_visit: false,
    allow_group_training: true,
    allow_personal_training: false,
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
    allow_free_visit: params.allow_free_visit,
    allow_group_training: params.allow_group_training,
    allow_personal_training: params.allow_personal_training,
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

type AccessField = "allow_free_visit" | "allow_group_training" | "allow_personal_training";

function isTrainingTypeAllowedForAccess(item: TrainingType, form: ServiceParamsForm) {
  return (
    (item.slot_type === "group" && form.allow_group_training) ||
    (item.slot_type === "personal" && form.allow_personal_training)
  );
}

function normalizeTrainingTypeIds(
  ids: string[],
  trainingTypes: TrainingType[],
  form: ServiceParamsForm
) {
  if (!form.allow_group_training && !form.allow_personal_training) {
    return [];
  }

  if (trainingTypes.length === 0) {
    return ids;
  }

  const allowedIds = new Set(
    trainingTypes.filter((item) => isTrainingTypeAllowedForAccess(item, form)).map((item) => item.id)
  );

  return ids.filter((id) => allowedIds.has(id));
}

export function InlineEditForm({
  product,
  onSuccess,
  onClose,
  enableServiceParams = false,
}: {
  product: Product;
  onSuccess: (updated: Product) => void;
  onClose: () => void;
  enableServiceParams?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<EditTab>("main");
  const [typeId, setTypeId] = useState(product.product_type_id ?? "");
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku ?? "");
  const [barcode, setBarcode] = useState(product.barcode ?? "");
  const [costPrice, setCostPrice] = useState(product.cost_price ?? "");
  const [salePrice, setSalePrice] = useState(product.sale_price ?? "");
  const [isMarked, setIsMarked] = useState(product.is_marked);
  const [markingType, setMarkingType] = useState<number | null>(
    (product as { marking_type?: number | null }).marking_type ?? null
  );
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");
  const [minStock, setMinStock] = useState(String(product.min_stock ?? 0));
  const [archiving, setArchiving] = useState(false);

  const [serviceParamsLoaded, setServiceParamsLoaded] = useState(false);
  const [serviceParamsLoading, setServiceParamsLoading] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceParamsForm>(defaultServiceParams());

  const { categories } = useCategories();
  const { types } = useProductTypes();
  const { trainingTypes, loading: trainingTypesLoading } = useTrainingTypes();
  const edit = useEditProduct();

  const selectedType = types.find((type) => type.id === typeId);
  const cfg = selectedType ?? {
    has_barcode: product.has_barcode,
    has_sku: product.has_sku,
    has_cost_price: product.has_cost_price,
    has_sale_price: product.has_sale_price,
    has_stock: product.has_stock,
    has_min_stock: product.has_min_stock,
    has_marking: product.has_marking,
  };

  const supportsServiceParams = enableServiceParams && !cfg.has_stock;
  const showVisitsTotal =
    serviceForm.subscription_type === "visits" || serviceForm.subscription_type === "single";
  const showValidityDays =
    serviceForm.subscription_type === "period" ||
    serviceForm.subscription_type === "unlimited" ||
    serviceForm.subscription_type === "visits";
  const showTrainingTypeSelector = serviceForm.allow_group_training || serviceForm.allow_personal_training;
  const allowedTrainingTypes = useMemo(
    () => trainingTypes.filter((item) => isTrainingTypeAllowedForAccess(item, serviceForm)),
    [serviceForm.allow_group_training, serviceForm.allow_personal_training, trainingTypes]
  );

  const currentMargin =
    cfg.has_cost_price && cfg.has_sale_price && costPrice !== "" && salePrice !== ""
      ? Number.parseFloat(String(salePrice)) - Number.parseFloat(String(costPrice))
      : null;

  useEffect(() => {
    if (!supportsServiceParams && activeTab === "service") {
      setActiveTab("main");
    }
  }, [activeTab, supportsServiceParams]);

  useEffect(() => {
    if (!supportsServiceParams || serviceParamsLoaded) {
      return;
    }

    let cancelled = false;

    async function loadServiceParams() {
      setServiceParamsLoading(true);
      setServiceError(null);

      try {
        const response = await fetchProductSubscriptionParams(product.id);
        if (cancelled) {
          return;
        }

        setServiceForm(
          mapServiceParams(
            response.params,
            response.training_types.map((item) => item.id)
          )
        );
        setServiceParamsLoaded(true);
      } catch (error: unknown) {
        if (!cancelled) {
          setServiceError(error instanceof Error ? error.message : "Не удалось загрузить параметры услуги");
          setServiceParamsLoaded(true);
        }
      } finally {
        if (!cancelled) {
          setServiceParamsLoading(false);
        }
      }
    }

    void loadServiceParams();

    return () => {
      cancelled = true;
    };
  }, [product.id, serviceParamsLoaded, supportsServiceParams]);

  useEffect(() => {
    setServiceForm((previous) => {
      const trainingTypeIds = normalizeTrainingTypeIds(previous.training_type_ids, trainingTypes, previous);
      if (
        trainingTypeIds.length === previous.training_type_ids.length &&
        trainingTypeIds.every((id, index) => id === previous.training_type_ids[index])
      ) {
        return previous;
      }

      return { ...previous, training_type_ids: trainingTypeIds };
    });
  }, [serviceForm.allow_group_training, serviceForm.allow_personal_training, trainingTypes]);

  function updateAccess(field: AccessField, checked: boolean) {
    setServiceForm((previous) => {
      const next = { ...previous, [field]: checked };
      return {
        ...next,
        training_type_ids: normalizeTrainingTypeIds(next.training_type_ids, trainingTypes, next),
      };
    });
  }

  function toggleTrainingType(id: string) {
    const trainingType = trainingTypes.find((item) => item.id === id);
    if (!trainingType || !isTrainingTypeAllowedForAccess(trainingType, serviceForm)) {
      return;
    }

    setServiceForm((previous) => ({
      ...previous,
      training_type_ids: previous.training_type_ids.includes(id)
        ? previous.training_type_ids.filter((current) => current !== id)
        : [...previous.training_type_ids, id],
    }));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      return;
    }

    setServiceError(null);

    const updated = await edit.submit(product.id, {
      name: name.trim(),
      product_type_id: typeId ? Number.parseInt(typeId, 10) : null,
      sku: cfg.has_sku ? sku.trim() || null : null,
      barcode: cfg.has_barcode ? barcode.trim() || null : null,
      cost_price: cfg.has_cost_price && costPrice !== "" ? Number.parseFloat(String(costPrice)) : null,
      sale_price: cfg.has_sale_price && salePrice !== "" ? Number.parseFloat(String(salePrice)) : null,
      is_marked: cfg.has_marking ? isMarked : false,
      marking_type: cfg.has_marking && isMarked ? markingType : null,
      category_id: categoryId ? Number.parseInt(categoryId, 10) : null,
      min_stock: cfg.has_min_stock ? Number.parseInt(minStock, 10) || 0 : 0,
    });

    if (!updated) {
      return;
    }

    if (supportsServiceParams) {
      setServiceSaving(true);

      try {
        const trainingTypeIds = normalizeTrainingTypeIds(serviceForm.training_type_ids, trainingTypes, serviceForm);
        await saveProductSubscriptionParams(product.id, {
          subscription_type: serviceForm.subscription_type,
          visits_total: showVisitsTotal
            ? parseInteger(
                serviceForm.subscription_type === "single" && !serviceForm.visits_total.trim()
                  ? "1"
                  : serviceForm.visits_total,
                null
              )
            : null,
          validity_days: showValidityDays ? parseInteger(serviceForm.validity_days, null) : null,
          activation_type: serviceForm.activation_type,
          freeze_days_allowed: parseInteger(serviceForm.freeze_days_allowed, 0) ?? 0,
          freeze_min_days: parseInteger(serviceForm.freeze_min_days, 1) ?? 1,
          freeze_max_count: parseInteger(serviceForm.freeze_max_count, null),
          is_family: serviceForm.is_family,
          allow_free_visit: serviceForm.allow_free_visit,
          allow_group_training: serviceForm.allow_group_training,
          allow_personal_training: serviceForm.allow_personal_training,
          training_type_ids: trainingTypeIds.map((item) => Number.parseInt(item, 10)),
        });
      } catch (error: unknown) {
        setServiceError(error instanceof Error ? error.message : "Не удалось сохранить параметры услуги");
        setServiceSaving(false);
        return;
      } finally {
        setServiceSaving(false);
      }
    }

    onSuccess(updated);
    onClose();
  }

  async function handleArchive() {
    const nextArchived = !product.is_archived;
    const actionLabel = nextArchived ? "Архивировать" : "Вернуть из архива";

    if (!window.confirm(`${actionLabel} "${product.name}"?`)) {
      return;
    }

    setArchiving(true);

    try {
      const updated = await archiveProduct(product.id, nextArchived);
      onSuccess({ ...product, ...updated });
      onClose();
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-slate-700 bg-slate-800/50 px-5 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          Редактирование — {product.name}
        </p>

        {supportsServiceParams && (
          <div className="inline-flex rounded-full border border-slate-700 bg-slate-900/70 p-1">
            {([
              { id: "main", label: "Основное" },
              { id: "service", label: "Параметры услуги" },
            ] as const).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-1.5 text-xs transition-colors ${
                  activeTab === tab.id
                    ? "bg-teal-500 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === "main" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelCls}>Тип позиции</label>
            <select value={typeId} onChange={(event) => setTypeId(event.target.value)} className={`mt-1 ${inputCls}`}>
              <option value="">Без типа</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

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

          {cfg.has_cost_price && (
            <div>
              <label className={labelCls}>Цена закупки ₽</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costPrice}
                onChange={(event) => setCostPrice(event.target.value)}
                placeholder="не указана"
                className={`mt-1 ${inputCls}`}
              />
            </div>
          )}

          {cfg.has_sale_price && (
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
          )}

          {cfg.has_barcode && (
            <div>
              <label className={labelCls}>Штрихкод</label>
              <input
                type="text"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                placeholder="не указан"
                className={`mt-1 ${inputCls}`}
              />
            </div>
          )}

          {cfg.has_sku && (
            <div>
              <label className={labelCls}>SKU / Артикул</label>
              <input
                type="text"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                placeholder="не указан"
                className={`mt-1 ${inputCls}`}
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Категория</label>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={`mt-1 ${inputCls}`}
            >
              <option value="">Без категории</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          {cfg.has_min_stock && (
            <div>
              <label className={labelCls}>Минимальный остаток</label>
              <input
                type="number"
                min="0"
                value={minStock}
                onChange={(event) => setMinStock(event.target.value)}
                className={`mt-1 ${inputCls}`}
              />
            </div>
          )}

          {cfg.has_marking && (
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`marked-${product.id}`}
                  checked={isMarked}
                  onChange={(event) => setIsMarked(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-600"
                />
                <label htmlFor={`marked-${product.id}`} className="text-sm text-slate-300">
                  Маркированный товар (Честный знак)
                </label>
              </div>
              {isMarked && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-slate-400 whitespace-nowrap">Тип маркировки</label>
                  <div className="relative group">
                    <span className="flex h-4 w-4 cursor-default items-center justify-center rounded-full border border-slate-600 text-xs text-slate-400 select-none">?</span>
                    <div className="absolute bottom-full left-0 z-50 mb-2 hidden w-64 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300 shadow-lg group-hover:block">
                      <div className="font-semibold text-slate-200 mb-1">Коды типов маркировки:</div>
                      <div className="space-y-0.5">
                        <div><span className="text-cyan-400">21</span> — Упакованная вода</div>
                        <div><span className="text-cyan-400">25</span> — Соки, безалкогольные напитки</div>
                        <div><span className="text-cyan-400">13</span> — Молочная продукция</div>
                        <div><span className="text-cyan-400">15</span> — Пиво и слабоалкогольные напитки</div>
                        <div><span className="text-cyan-400">2</span> — Лекарственные препараты</div>
                        <div><span className="text-cyan-400">4</span> — Табачные изделия</div>
                        <div><span className="text-cyan-400">6</span> — Обувные товары</div>
                        <div><span className="text-cyan-400">7</span> — Одежда и текстиль</div>
                      </div>
                    </div>
                  </div>
                  <select
                    value={markingType ?? ""}
                    onChange={(e) => setMarkingType(e.target.value ? Number(e.target.value) : null)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  >
                    <option value="">— не выбрано —</option>
                    <option value="21">21 — Упакованная вода</option>
                    <option value="25">25 — Соки / безалк. напитки</option>
                    <option value="13">13 — Молочная продукция</option>
                    <option value="15">15 — Пиво и слабоалк. напитки</option>
                    <option value="2">2 — Лекарственные препараты</option>
                    <option value="4">4 — Табачные изделия</option>
                    <option value="6">6 — Обувные товары</option>
                    <option value="7">7 — Одежда и текстиль</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "service" && supportsServiceParams && (
        <div className="space-y-4">
          {serviceParamsLoading ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-6 text-sm text-slate-400">
              Загружаем параметры услуги...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelCls}>Тип</label>
                  <select
                    value={serviceForm.subscription_type}
                    onChange={(event) =>
                      setServiceForm((previous) => ({
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

                {showVisitsTotal ? (
                  <div>
                    <label className={labelCls}>Количество занятий</label>
                    <input
                      type="number"
                      min="1"
                      value={
                        serviceForm.subscription_type === "single" && !serviceForm.visits_total.trim()
                          ? "1"
                          : serviceForm.visits_total
                      }
                      onChange={(event) =>
                        setServiceForm((previous) => ({ ...previous, visits_total: event.target.value }))
                      }
                      className={`mt-1 ${inputCls}`}
                    />
                  </div>
                ) : (
                  <div>
                    <label className={labelCls}>Количество занятий</label>
                    <div className="mt-1 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-slate-500">
                      Не используется для этого типа
                    </div>
                  </div>
                )}

                {showValidityDays && (
                  <div>
                    <label className={labelCls}>Срок действия, дней</label>
                    <input
                      type="number"
                      min="0"
                      value={serviceForm.validity_days}
                      onChange={(event) =>
                        setServiceForm((previous) => ({ ...previous, validity_days: event.target.value }))
                      }
                      className={`mt-1 ${inputCls}`}
                      placeholder="Например: 30"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>Активация</label>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                    <input
                      type="radio"
                      name={`activation-type-${product.id}`}
                      checked={serviceForm.activation_type === "purchase"}
                      onChange={() =>
                        setServiceForm((previous) => ({ ...previous, activation_type: "purchase" }))
                      }
                      className="h-4 w-4 border-slate-600"
                    />
                    Сразу после покупки
                  </label>

                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                    <input
                      type="radio"
                      name={`activation-type-${product.id}`}
                      checked={serviceForm.activation_type === "first_visit"}
                      onChange={() =>
                        setServiceForm((previous) => ({ ...previous, activation_type: "first_visit" }))
                      }
                      className="h-4 w-4 border-slate-600"
                    />
                    С первого посещения
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                <p className={labelCls}>Заморозка</p>
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label className={labelCls}>Доступно дней</label>
                    <input
                      type="number"
                      min="0"
                      value={serviceForm.freeze_days_allowed}
                      onChange={(event) =>
                        setServiceForm((previous) => ({
                          ...previous,
                          freeze_days_allowed: event.target.value,
                        }))
                      }
                      className={`mt-1 ${inputCls}`}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Мин. срок</label>
                    <input
                      type="number"
                      min="1"
                      value={serviceForm.freeze_min_days}
                      onChange={(event) =>
                        setServiceForm((previous) => ({ ...previous, freeze_min_days: event.target.value }))
                      }
                      className={`mt-1 ${inputCls}`}
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Макс. кол-во раз</label>
                    <input
                      type="number"
                      min="0"
                      value={serviceForm.freeze_max_count}
                      onChange={(event) =>
                        setServiceForm((previous) => ({ ...previous, freeze_max_count: event.target.value }))
                      }
                      className={`mt-1 ${inputCls}`}
                      placeholder="без ограничений"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={serviceForm.is_family}
                  onChange={(event) =>
                    setServiceForm((previous) => ({ ...previous, is_family: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-600"
                />
                Семейный абонемент
              </label>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                <p className={labelCls}>Права доступа</p>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                  {[
                    ["allow_free_visit", "Свободное посещение"],
                    ["allow_group_training", "Групповые тренировки"],
                    ["allow_personal_training", "Персональные тренировки"],
                  ].map(([field, title]) => (
                    <label key={field} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(serviceForm[field as keyof ServiceParamsForm])}
                        onChange={(event) => updateAccess(field as AccessField, event.target.checked)}
                        className="h-4 w-4 rounded border-slate-600"
                      />
                      {title}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className={labelCls}>Виды тренировок</p>
                  <span className="text-xs text-slate-500">Если ничего не выбрано — действует на все виды</span>
                </div>

                {!showTrainingTypeSelector ? (
                  <p className="mt-3 text-sm text-slate-500">Для свободного посещения виды тренировок не выбираются.</p>
                ) : trainingTypesLoading ? (
                  <p className="mt-3 text-sm text-slate-500">Загружаем виды тренировок...</p>
                ) : allowedTrainingTypes.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">Нет видов тренировок для выбранных прав доступа.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {allowedTrainingTypes.map((item) => {
                      const checked = serviceForm.training_type_ids.includes(item.id);

                      return (
                        <label
                          key={item.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                            checked
                              ? "border-teal-500 bg-teal-500/10 text-slate-100"
                              : "border-slate-700 bg-slate-800/60 text-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTrainingType(item.id)}
                            className="h-4 w-4 rounded border-slate-600"
                          />
                          <span
                            className="h-3 w-3 rounded-full border border-white/10"
                            style={{ backgroundColor: item.color ?? "#00BCD4" }}
                          />
                          <span className="flex-1">{item.name}</span>
                          {!item.is_active && <span className="text-xs text-slate-500">неактивен</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {currentMargin !== null && !Number.isNaN(currentMargin) && activeTab === "main" && (
        <div className="rounded-xl border border-teal-900 bg-teal-950/50 px-4 py-2 text-sm">
          <span className="text-slate-400">Маржа: </span>
          <span className={`font-semibold ${currentMargin >= 0 ? "text-teal-400" : "text-red-400"}`}>
            {currentMargin.toLocaleString("ru")} ₽
          </span>
        </div>
      )}

      {(edit.error || serviceError) && (
        <div className="rounded-xl border border-red-900 bg-red-950 px-4 py-3 text-sm text-red-400">
          {edit.error ?? serviceError}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={edit.submitting || serviceSaving || !name.trim()}
          className="rounded-xl bg-slate-600 px-5 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50"
        >
          {edit.submitting || serviceSaving ? "Сохраняем..." : "Сохранить"}
        </button>
        <button
          onClick={onClose}
          className="rounded-xl border border-slate-600 px-5 py-2 text-sm text-slate-400 hover:bg-slate-800"
        >
          Отмена
        </button>
        <button
          onClick={() => {
            void handleArchive();
          }}
          disabled={archiving}
          className={`ml-auto rounded-xl border px-5 py-2 text-sm disabled:opacity-50 ${
            product.is_archived
              ? "border-teal-900 text-teal-400 hover:bg-teal-950"
              : "border-red-900 text-red-500 hover:bg-red-950"
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
      </div>
    </div>
  );
}
