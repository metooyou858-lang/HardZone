"use client";

import { useEffect, useState } from "react";

import { ServiceForm, describeServiceParams } from "@/components/services/service-form";
import { TrainingTypesManager } from "@/components/warehouse/training-types-manager";
import { formatMoney } from "@/components/warehouse/shared";
import { fetchProductSubscriptionParams, fetchProducts, Product, searchProducts } from "@/lib/api/products";

type ServicesTab = "services" | "training-types";

type ServiceRecord = {
  product: Product;
  paramsLabel: string;
  trainingTypesLabel: string;
};

function isService(product: Product) {
  return !product.has_stock && product.has_sale_price;
}

function describeExtra(product: Product, paramsLabel: string) {
  const parts = [paramsLabel];

  if (product.sale_price) {
    parts.push(formatMoney(product.sale_price));
  } else {
    parts.push("Цена не указана");
  }

  return parts.join(" • ");
}

export default function ServicesPage() {
  const [tab, setTab] = useState<ServicesTab>("services");
  const [search, setSearch] = useState("");
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "services") {
      return;
    }

    let cancelled = false;

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);

      try {
        const trimmedQuery = search.trim();
        const products = trimmedQuery.length >= 2
          ? (await searchProducts(trimmedQuery)).filter(isService)
          : await fetchProducts({ type: "service" });

        const paramsList = await Promise.all(
          products.map(async (product) => {
            const response = await fetchProductSubscriptionParams(product.id);

            return {
              product,
              paramsLabel: describeServiceParams(response.params),
              trainingTypesLabel:
                response.training_types.length > 0
                  ? response.training_types.map((item) => item.name).join(", ")
                  : "Все виды тренировок",
            };
          })
        );

        if (!cancelled) {
          setServices(paramsList);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить услуги");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reloadToken, search, tab]);

  function handleSaved() {
    setShowCreate(false);
    setEditId(null);
    setReloadToken((value) => value + 1);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">
          Услуги
        </h1>
      </div>

      <section className="border-b border-[var(--line-soft)]">
        <div className="flex flex-wrap gap-8">
          {([
            { id: "services", label: "Услуги" },
            { id: "training-types", label: "Виды тренировок" },
          ] as const).map((item) => {
            const active = tab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`border-b-2 px-1 pb-3 text-left text-sm font-medium transition-colors ${
                  active
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {tab === "services" ? (
        <div className="space-y-4">
          <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full lg:max-w-[720px]">
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск услуги по названию..."
                className="w-full rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setEditId(null);
                setShowCreate((value) => !value);
              }}
              className="rounded-[16px] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#062b26] transition-colors hover:brightness-110"
            >
              Новая услуга
            </button>
          </section>

          {showCreate && (
            <ServiceForm
              onCancel={() => setShowCreate(false)}
              onSaved={() => {
                handleSaved();
              }}
            />
          )}

          {error && (
            <div className="rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          {loading ? (
            <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <span className="text-lg font-semibold">S</span>
              </div>
              <p className="mt-4 text-base font-medium text-[var(--text-main)]">Загружаем услуги</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Подтягиваем параметры абонементов и виды тренировок</p>
            </div>
          ) : services.length === 0 ? (
            <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.08)] text-[var(--accent)]">
                <span className="text-lg font-semibold">S</span>
              </div>
              <p className="mt-4 text-base font-medium text-[var(--text-main)]">Услуги не найдены</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">Попробуйте изменить поиск или создайте новую услугу</p>
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setShowCreate(true);
                }}
                className="mt-5 rounded-[16px] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#062b26] transition-colors hover:brightness-110"
              >
                Создать услугу
              </button>
            </div>
          ) : (
            <section className="overflow-hidden rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
              <div className="hidden grid-cols-[minmax(0,1.8fr)_220px_180px_220px_auto] gap-4 border-b border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-6 py-4 text-[13px] font-medium uppercase tracking-[0.14em] text-slate-300 lg:grid">
                <span>Услуга</span>
                <span>Абонемент</span>
                <span className="text-right">Цена</span>
                <span>Виды тренировок</span>
                <span className="text-right">Действия</span>
              </div>

              {services.map((item, index) => {
                const expanded = editId === item.product.id;

                return (
                  <div key={item.product.id} className="border-b border-[var(--line-soft)] last:border-b-0">
                    <div
                      className={`flex flex-col gap-4 px-5 py-5 transition-colors lg:grid lg:grid-cols-[minmax(0,1.8fr)_220px_180px_220px_auto] lg:items-center lg:gap-4 ${
                        expanded
                          ? "bg-[rgba(255,255,255,0.05)]"
                          : index % 2 === 0
                            ? "bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)]"
                            : "bg-transparent hover:bg-[rgba(255,255,255,0.04)]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-[var(--text-main)]">{item.product.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">
                          {describeExtra(item.product, item.paramsLabel)}
                        </p>
                      </div>

                      <div className="text-sm text-[var(--text-main)]">{item.paramsLabel}</div>
                      <div className="text-sm font-medium text-[var(--text-main)] lg:text-right">
                        {formatMoney(item.product.sale_price)}
                      </div>
                      <div className="text-sm text-[var(--text-muted)]">{item.trainingTypesLabel}</div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCreate(false);
                            setEditId((current) => (current === item.product.id ? null : item.product.id));
                          }}
                          className="rounded-[16px] border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                        >
                          {expanded ? "Скрыть" : "Редактировать"}
                        </button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] px-5 py-5">
                        <ServiceForm
                          product={item.product}
                          onCancel={() => setEditId(null)}
                          onSaved={() => {
                            handleSaved();
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      ) : (
        <TrainingTypesManager onClose={() => setTab("services")} />
      )}
    </div>
  );
}
