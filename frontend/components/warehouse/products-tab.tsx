"use client";

import { Fragment, ReactNode, useState } from "react";

import { useCategories } from "@/hooks/useCategories";
import { useProducts } from "@/hooks/useProducts";
import { Product } from "@/lib/api/products";

import { ActionIconButton } from "./action-icon-button";
import { CategoriesManager } from "./categories-manager";
import { ImportPanel } from "./import-panel";
import { InlineEditForm } from "./inline-edit-form";
import { InlineReceiptForm } from "./inline-receipt-form";
import { InlineWriteoffForm } from "./inline-writeoff-form";
import { NewSupplyPanel } from "./new-supply-panel";
import { ProductTypesManager } from "./product-types-manager";
import { formatMoney } from "./shared";

type InlineAction = { productId: string; type: "receipt" | "writeoff" | "edit" } | null;
type ToolbarPanel = "categories" | "import" | "supply" | "types" | null;

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4.167 15.833h2.083l7.292-7.291-2.084-2.084-7.291 7.292v2.083Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m10.938 7.063 2.083 2.083M12.708 4.604l.625-.625a1.473 1.473 0 0 1 2.084 2.084l-.625.625-2.084-2.084Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10 4.167v11.666M4.167 10h11.666"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WriteoffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4.167 10h11.666" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M8.75 15a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM17.5 17.5l-4.375-4.375"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10 3.75v7.5M10 11.25 7.292 8.542M10 11.25l2.708-2.708"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.167 13.333v1.25A1.25 1.25 0 0 0 5.417 15.833h9.166a1.25 1.25 0 0 0 1.25-1.25v-1.25"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SupplyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M10 4.167v11.666M4.167 10h11.666"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TypesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M4.167 5.833h11.666M4.167 10h11.666M4.167 14.167h7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ListingMetricIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M3.75 6.667 10 3.75l6.25 2.917v7.5L10 17.083l-6.25-2.916v-7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 8.125v8.542M3.75 6.667 10 9.792l6.25-3.125" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StockMetricIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M5 5.833 10 3.75l5 2.083-5 2.084L5 5.833Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M5 10 10 7.917 15 10M5 14.167 10 12.083l5 2.084"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WarningMetricIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M10 4.167 16.25 15H3.75L10 4.167Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M10 7.917v3.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13.75" r="0.9" fill="currentColor" />
    </svg>
  );
}

function ValueMetricIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M5.833 6.667h8.334M5.833 10h8.334M5.833 13.333h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M4.167 4.167h11.666a1.667 1.667 0 0 1 1.667 1.666v8.334a1.667 1.667 0 0 1-1.667 1.666H4.167A1.667 1.667 0 0 1 2.5 14.167V5.833a1.667 1.667 0 0 1 1.667-1.666Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function stockColor(product: Product) {
  if (!product.has_stock) {
    return "text-[var(--text-muted)]";
  }
  if (product.stock === 0) {
    return "text-[var(--danger)]";
  }
  if (product.has_min_stock && product.min_stock > 0 && product.stock <= product.min_stock) {
    return "text-[var(--warning)]";
  }
  return "text-[var(--success)]";
}

function isLowStock(product: Product) {
  if (!product.has_stock || !product.has_min_stock) {
    return false;
  }
  if (product.stock <= 0) {
    return false;
  }
  return product.min_stock > 0 && product.stock <= product.min_stock;
}

function getTypeBadge(product: Product) {
  if (!product.product_type_name || product.product_type_name === "Товар") {
    return null;
  }

  if (product.product_type_name === "Услуга") {
    return {
      label: product.product_type_name,
      className: "bg-[rgba(0,191,165,0.12)] text-[var(--accent)]",
    };
  }

  if (product.product_type_name === "Расходник") {
    return {
      label: product.product_type_name,
      className: "bg-[rgba(240,246,255,0.06)] text-[var(--text-muted)]",
    };
  }

  return {
    label: product.product_type_name,
    className: "bg-[rgba(0,191,165,0.1)] text-[var(--accent)]",
  };
}

function MetricCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "default" | "warm" | "dark" | "alert";
}) {
  const toneClass =
    tone === "warm"
      ? "border-[rgba(0,191,165,0.24)] bg-[linear-gradient(135deg,#0D2137,#13283C)]"
      : tone === "dark"
        ? "border-[rgba(0,191,165,0.32)] bg-[linear-gradient(135deg,#0C2632,#0F3343_45%,#135466)] text-[var(--text-main)]"
        : tone === "alert"
          ? "border-[rgba(210,153,34,0.24)] bg-[linear-gradient(135deg,#2D1B00,#3A2710)]"
          : "border-[var(--line-soft)] bg-[linear-gradient(135deg,#1C2333,#243048)]";

  const iconClass =
    tone === "warm"
      ? "bg-[rgba(0,191,165,0.16)] text-[var(--accent)]"
      : tone === "dark"
        ? "bg-[rgba(240,246,255,0.1)] text-[var(--text-main)]"
        : tone === "alert"
          ? "bg-[rgba(210,153,34,0.16)] text-[#F0A500]"
          : "bg-[rgba(240,246,255,0.06)] text-[var(--text-main)]";

  const valueClass =
    tone === "warm"
      ? "text-[var(--accent)]"
      : tone === "alert"
        ? "text-[#F0A500]"
        : "text-[var(--text-main)]";

  const valueSizeClass = tone === "dark" ? "text-3xl" : "text-xl";
  const labelClass =
    tone === "dark"
      ? "text-[10px] text-[var(--text-muted)]"
      : "text-[11px] text-[var(--text-muted)]";

  return (
    <article className={`relative overflow-hidden rounded-[22px] border px-4 py-3 ${toneClass}`}>
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl ${
          tone === "warm"
            ? "bg-[rgba(0,191,165,0.18)]"
            : tone === "dark"
              ? "bg-[rgba(0,191,165,0.22)]"
              : tone === "alert"
                ? "bg-[rgba(240,165,0,0.18)]"
                : "bg-white/6"
        }`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className={`uppercase tracking-[0.24em] ${labelClass}`}>{label}</p>
          <p className={`mt-2 font-semibold ${valueClass} ${valueSizeClass}`}>{value}</p>
        </div>
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${iconClass}`}>
          {icon}
        </span>
      </div>
    </article>
  );
}

export function ProductsTab() {
  const {
    products,
    totalProducts,
    loading,
    error,
    query,
    setQuery,
    showAll,
    setShowAll,
    showArchived,
    setShowArchived,
    reload,
  } = useProducts({ excludeServices: true });

  const {
    categories,
    loading: categoriesLoading,
    create: createCategory,
    update: updateCategory,
    remove: removeCategory,
    reload: reloadCategories,
  } = useCategories();

  const [panel, setPanel] = useState<ToolbarPanel>(null);
  const [inlineAction, setInlineAction] = useState<InlineAction>(null);
  const [categoryFilter, setCategoryFilter] = useState("");

  const filteredProducts = categoryFilter
    ? products.filter((product) => product.category_id === categoryFilter)
    : products;

  const inStockCount = filteredProducts.filter((product) => !product.has_stock || product.stock > 0).length;
  const lowStockCount = filteredProducts.filter(isLowStock).length;
  const totalStockValue = filteredProducts.reduce(
    (sum, product) => sum + Number.parseFloat(product.position_value ?? "0"),
    0
  );

  async function refreshWarehouse() {
    await Promise.all([reload(), reloadCategories()]);
  }

  function toggleInlineAction(productId: string, type: "receipt" | "writeoff" | "edit") {
    setPanel(null);
    setInlineAction((previous) =>
      previous?.productId === productId && previous.type === type ? null : { productId, type }
    );
  }

  function openPanel(nextPanel: ToolbarPanel) {
    setInlineAction(null);
    setPanel((previous) => (previous === nextPanel ? null : nextPanel));
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="space-y-3.5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-2.5">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <SearchIcon />
              </span>
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по названию, SKU или штрихкоду"
                className="w-full border-0 bg-transparent p-0 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => openPanel("types")}
                className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--text-main)]"
              >
                <TypesIcon />
                Типы
              </button>

              <button
                onClick={() => openPanel("import")}
                className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--text-main)]"
              >
                <ImportIcon />
                Импорт
              </button>

              <button
                onClick={() => openPanel("supply")}
                className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#062b26] transition-colors hover:brightness-110"
              >
                <SupplyIcon />
                Новая поставка
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="В каталоге" value={filteredProducts.length} icon={<ListingMetricIcon />} />
            <MetricCard label="В наличии" value={inStockCount} tone="warm" icon={<StockMetricIcon />} />
            <MetricCard label="Низкий остаток" value={lowStockCount} tone="alert" icon={<WarningMetricIcon />} />
            <MetricCard
              label="Стоимость склада"
              value={formatMoney(totalStockValue)}
              tone="dark"
              icon={<ValueMetricIcon />}
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--line-soft)] pt-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {categories.length > 0 && (
                <>
                  <button
                    onClick={() => setCategoryFilter("")}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                      categoryFilter === ""
                        ? "bg-[var(--accent-soft)] text-[var(--text-main)]"
                        : "border border-[var(--line-soft)] bg-[var(--bg-card-soft)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    Все
                  </button>

                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setCategoryFilter((previous) => (previous === category.id ? "" : category.id))}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                        categoryFilter === category.id
                          ? "bg-[var(--accent-soft)] text-[var(--text-main)]"
                          : "border border-[var(--line-soft)] bg-[var(--bg-card-soft)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-main)]"
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </>
              )}

              <button
                type="button"
                aria-label="Управление категориями"
                onClick={() => openPanel("categories")}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                  panel === "categories"
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-main)]"
                    : "border-[var(--line-soft)] bg-[var(--bg-card-soft)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text-main)]"
                }`}
              >
                +
              </button>
            </div>

            {!query.trim() && (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-[var(--text-muted)]">
                  Показано: <span className="font-medium text-[var(--text-main)]">{filteredProducts.length}</span>
                  {!showAll && !showArchived && totalProducts > products.length && (
                    <span className="text-[var(--text-muted)]"> (в наличии из {totalProducts})</span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowAll((previous) => !previous)}
                    className="text-xs text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-main)]"
                  >
                    {showAll ? "Скрыть нулевые" : `Показать все (${totalProducts})`}
                  </button>
                  <span className="text-[var(--line-soft)]">·</span>
                  <button
                    onClick={() => {
                      setShowArchived((previous) => !previous);
                      setQuery("");
                    }}
                    className={`text-xs underline underline-offset-2 ${
                      showArchived
                        ? "text-[var(--warning)] hover:brightness-110"
                        : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    {showArchived ? "Скрыть архив" : "Архив"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {panel === "categories" && (
        <CategoriesManager
          categories={categories}
          loading={categoriesLoading}
          onCreate={createCategory}
          onUpdate={updateCategory}
          onRemove={removeCategory}
          onClose={() => setPanel(null)}
        />
      )}

      {panel === "types" && <ProductTypesManager onClose={() => setPanel(null)} />}

      {panel === "supply" && (
        <NewSupplyPanel
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            void refreshWarehouse();
          }}
        />
      )}

      {panel === "import" && (
        <ImportPanel
          onClose={() => setPanel(null)}
          onDone={() => {
            setPanel(null);
            void refreshWarehouse();
          }}
        />
      )}

      {error && (
        <div className="rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          Загрузка каталога...
        </div>
      ) : (
        <section className="overflow-hidden rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
          <div className="hidden grid-cols-[minmax(0,1.7fr)_110px_110px_110px_110px_auto] gap-4 border-b border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-6 py-4 text-[13px] font-medium uppercase tracking-[0.14em] text-slate-300 lg:grid">
            <span>Товар</span>
            <span className="text-right">Закупка</span>
            <span className="text-right">Цена</span>
            <span className="text-right">Маржа</span>
            <span className="text-right">Остаток</span>
            <span className="text-right">Действия</span>
          </div>

          {filteredProducts.length === 0 && (
            <div className="px-6 py-16 text-center text-sm text-[var(--text-muted)]">Товары не найдены</div>
          )}

          {filteredProducts.map((product, index) => {
            const displaySku = product.sku?.startsWith("IMPORT-") ? null : product.sku;
            const typeBadge = getTypeBadge(product);

            return (
              <Fragment key={product.id}>
                <div
                  className={`relative mx-3 my-2.5 flex items-center gap-5 rounded-[24px] border border-[#1E2733] px-6 py-5 transition-colors ${
                    inlineAction?.productId === product.id
                      ? "bg-[var(--bg-card-soft)]"
                      : index % 2 === 0
                        ? "bg-[rgba(240,246,255,0.03)] hover:bg-[#1C2333]"
                        : "bg-[rgba(240,246,255,0.015)] hover:bg-[#1C2333]"
                  } ${product.is_archived ? "bg-[rgba(240,246,255,0.02)] opacity-65 saturate-50" : ""}`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 w-[3px] rounded-l-[24px] ${
                      !product.has_stock
                        ? "bg-[rgba(0,191,165,0.8)]"
                        : product.stock === 0
                          ? "bg-[rgba(248,81,73,0.9)]"
                          : isLowStock(product)
                            ? "bg-[rgba(210,153,34,0.9)]"
                            : "bg-[rgba(63,185,80,0.9)]"
                    }`}
                  />

                  <div className="min-w-0 flex-1 lg:pl-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-[15px] font-semibold text-[var(--text-main)]">{product.name}</p>
                      {typeBadge && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${typeBadge.className}`}>
                          {typeBadge.label}
                        </span>
                      )}
                      {product.is_archived && (
                        <span className="rounded-full bg-[rgba(210,153,34,0.12)] px-2 py-0.5 text-[11px] font-medium text-[var(--warning)]">
                          Архив
                        </span>
                      )}
                      {isLowStock(product) && (
                        <span className="rounded-full bg-[rgba(210,153,34,0.12)] px-2 py-0.5 text-[11px] font-medium text-[var(--warning)]">
                          мало
                        </span>
                      )}
                      {product.has_marking && product.is_marked && (
                        <span className="rounded-full bg-[rgba(240,246,255,0.06)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-main)]">
                          ЧЗ
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2.5 text-xs text-[var(--text-muted)]">
                      {product.category_name && (
                        <span className="rounded-full bg-[rgba(240,246,255,0.06)] px-2.5 py-1 text-[var(--text-main)]">
                          {product.category_name}
                        </span>
                      )}
                      {product.has_sku && displaySku && (
                        <span className="rounded-full bg-[rgba(240,246,255,0.04)] px-2.5 py-1 font-mono text-[var(--text-muted)]">
                          {displaySku}
                        </span>
                      )}
                      {product.has_barcode && product.barcode && (
                        <span className="rounded-full bg-[rgba(240,246,255,0.04)] px-2.5 py-1 font-mono text-[var(--text-muted)]">
                          {product.barcode}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hidden shrink-0 text-right lg:block">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Закупка</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--text-main)]">
                      {product.has_cost_price ? formatMoney(product.cost_price) : "—"}
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right lg:block">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Цена</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--text-main)]">
                      {product.has_sale_price ? formatMoney(product.sale_price) : "—"}
                    </p>
                  </div>

                  <div className="hidden shrink-0 text-right lg:block">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Маржа</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--success)]">
                      {product.has_cost_price && product.has_sale_price ? formatMoney(product.margin) : "—"}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                      {product.has_stock ? "Остаток" : "Тип"}
                    </p>
                    <p className={`mt-2 text-base font-semibold ${stockColor(product)}`}>
                      {product.has_stock ? `${product.stock} шт.` : product.product_type_name ?? "Без остатка"}
                    </p>
                    {product.position_value && Number.parseFloat(product.position_value) > 0 && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{formatMoney(product.position_value)}</p>
                    )}
                    {product.has_min_stock && product.min_stock > 0 && (
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">мин. {product.min_stock}</p>
                    )}
                  </div>

                  <div className="shrink-0 flex gap-2 rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-1.5">
                    <ActionIconButton
                      label="Изменить"
                      tone="edit"
                      active={inlineAction?.productId === product.id && inlineAction.type === "edit"}
                      onClick={() => toggleInlineAction(product.id, "edit")}
                    >
                      <EditIcon />
                    </ActionIconButton>

                    {product.has_stock && (
                      <ActionIconButton
                        label="Принять"
                        tone="receipt"
                        active={inlineAction?.productId === product.id && inlineAction.type === "receipt"}
                        onClick={() => toggleInlineAction(product.id, "receipt")}
                      >
                        <ReceiptIcon />
                      </ActionIconButton>
                    )}

                    {product.has_stock && (
                      <ActionIconButton
                        label="Списать"
                        tone="writeoff"
                        active={inlineAction?.productId === product.id && inlineAction.type === "writeoff"}
                        disabled={product.stock <= 0}
                        onClick={() => toggleInlineAction(product.id, "writeoff")}
                      >
                        <WriteoffIcon />
                      </ActionIconButton>
                    )}
                  </div>
                </div>

                {inlineAction?.productId === product.id && inlineAction.type === "receipt" && (
                  <InlineReceiptForm
                    product={product}
                    onClose={() => setInlineAction(null)}
                    onDone={() => {
                      void reload();
                    }}
                  />
                )}

                {inlineAction?.productId === product.id && inlineAction.type === "writeoff" && (
                  <InlineWriteoffForm
                    product={product}
                    onClose={() => setInlineAction(null)}
                    onDone={() => {
                      void reload();
                    }}
                  />
                )}

                {inlineAction?.productId === product.id && inlineAction.type === "edit" && (
                  <InlineEditForm
                    product={product}
                    onSuccess={() => {
                      void refreshWarehouse();
                    }}
                    onClose={() => setInlineAction(null)}
                  />
                )}
              </Fragment>
            );
          })}
        </section>
      )}
    </div>
  );
}
