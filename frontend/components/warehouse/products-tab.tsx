"use client";

import { Fragment, useState } from "react";
import Link from "next/link";

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
import { formatMoney } from "./shared";

type InlineAction = { productId: string; type: "receipt" | "writeoff" | "edit" } | null;
type ToolbarPanel = "categories" | "import" | "supply" | null;

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
      <path
        d="M4.167 10h11.666"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
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

function InventoryIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M5.833 3.333h8.334A1.667 1.667 0 0 1 15.833 5v10a1.667 1.667 0 0 1-1.666 1.667H5.833A1.667 1.667 0 0 1 4.167 15V5a1.667 1.667 0 0 1 1.666-1.667Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7.5 7.5h5M7.5 10h5M7.5 12.5h3.333"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
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

function stockColor(product: Product) {
  if (product.stock === 0) {
    return "text-red-500";
  }

  if (product.min_stock > 0 && product.stock <= product.min_stock) {
    return "text-amber-500";
  }

  if (product.stock <= 5) {
    return "text-amber-500";
  }

  return "text-emerald-600";
}

function isLowStock(product: Product) {
  if (product.stock <= 0) {
    return false;
  }

  if (product.min_stock > 0) {
    return product.stock <= product.min_stock;
  }

  return product.stock <= 5;
}

function metricCardClasses(tone: "default" | "warm" | "dark" | "alert") {
  if (tone === "warm") {
    return "border-orange-100 bg-[linear-gradient(180deg,rgba(255,247,237,0.98),rgba(255,237,213,0.94))]";
  }

  if (tone === "dark") {
    return "border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(30,41,59,0.94))] text-white";
  }

  if (tone === "alert") {
    return "border-amber-100 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(254,243,199,0.92))]";
  }

  return "border-black/5 bg-white/80";
}

export function ProductsTab() {
  const {
    products,
    totalProducts,
    hiddenZeroCount,
    loading,
    error,
    query,
    setQuery,
    showAll,
    setShowAll,
    reload,
  } = useProducts();
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
  const selectedCategory =
    categories.find((category) => category.id === categoryFilter)?.name ?? "Все категории";
  const inStockCount = filteredProducts.filter((product) => product.stock > 0).length;
  const outOfStockCount = filteredProducts.filter((product) => product.stock === 0).length;
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
      previous?.productId === productId && previous.type === type
        ? null
        : { productId, type }
    );
  }

  function openPanel(nextPanel: ToolbarPanel) {
    setInlineAction(null);
    setPanel((previous) => (previous === nextPanel ? null : nextPanel));
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="border-b border-black/5 bg-[linear-gradient(180deg,rgba(248,250,252,0.9),rgba(241,245,249,0.68))] p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-xl">
                <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  live catalog
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                  Ежедневная работа со складом
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Поиск, фильтрация, редактирование и складские действия собраны в одном рабочем
                  контуре, чтобы администратор не терял фокус на операциях.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[560px]">
                <button
                  onClick={() => openPanel("import")}
                  className="inline-flex items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  <ImportIcon />
                  Импорт
                </button>

                <Link
                  href="/warehouse/inventory"
                  className="inline-flex items-center justify-center gap-2 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                >
                  <InventoryIcon />
                  Инвентаризация
                </Link>

                <button
                  onClick={() => openPanel("supply")}
                  className="inline-flex items-center justify-center gap-2 rounded-[20px] bg-[linear-gradient(135deg,#f97316,#fb923c)] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_34px_rgba(249,115,22,0.28)] transition-transform hover:-translate-y-0.5"
                >
                  <SupplyIcon />
                  Новая поставка
                </button>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,0.8fr))]">
              <label className="flex items-center gap-3 rounded-[22px] border border-white/70 bg-white/85 px-4 py-3 shadow-sm">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <SearchIcon />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                    Поиск товара
                  </p>
                  <input
                    type="text"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Название, SKU или штрихкод"
                    className="mt-1 w-full border-0 bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>
              </label>

              <article className={`rounded-[22px] border p-4 shadow-sm ${metricCardClasses("default")}`}>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">В выдаче</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">{filteredProducts.length}</p>
                <p className="mt-1 text-xs text-slate-500">{selectedCategory}</p>
              </article>

              <article className={`rounded-[22px] border p-4 shadow-sm ${metricCardClasses("warm")}`}>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">В наличии</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">{inStockCount}</p>
                <p className="mt-1 text-xs text-slate-500">Готово к продаже и приёмке</p>
              </article>

              <article className={`rounded-[22px] border p-4 shadow-sm ${metricCardClasses("alert")}`}>
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Низкий остаток</p>
                <p className="mt-3 text-2xl font-semibold text-slate-950">{lowStockCount}</p>
                <p className="mt-1 text-xs text-slate-500">Требуют внимания</p>
              </article>

              <article className={`rounded-[22px] border p-4 shadow-sm ${metricCardClasses("dark")}`}>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Стоимость склада</p>
                <p className="mt-3 text-2xl font-semibold">{formatMoney(totalStockValue)}</p>
                <p className="mt-1 text-xs text-white/55">Без учёта услуг и списаний</p>
              </article>
            </div>

            <div className="flex flex-col gap-3 border-t border-black/5 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  Категории
                </span>

                {categories.length > 0 && (
                  <>
                    <button
                      onClick={() => setCategoryFilter("")}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                        categoryFilter === ""
                          ? "bg-slate-900 text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                      }`}
                    >
                      Все
                    </button>

                    {categories.map((category) => (
                      <button
                        key={category.id}
                        onClick={() =>
                          setCategoryFilter((previous) =>
                            previous === category.id ? "" : category.id
                          )
                        }
                        className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                          categoryFilter === category.id
                            ? "bg-slate-900 text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                        }`}
                      >
                        {category.name}
                        <span className="ml-1.5 opacity-60">{category.product_count}</span>
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
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                  }`}
                >
                  +
                </button>
              </div>

              {!query.trim() && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p className="text-slate-500">
                    В каталоге видно{" "}
                    <span className="font-semibold text-slate-900">{filteredProducts.length}</span>
                    {hiddenZeroCount > 0 && !showAll && (
                      <span className="text-slate-400"> из {totalProducts} товаров</span>
                    )}
                    {outOfStockCount > 0 && (
                      <span className="text-slate-400"> · нулевых остатков: {outOfStockCount}</span>
                    )}
                  </p>

                  <button
                    onClick={() => setShowAll((previous) => !previous)}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                  >
                    {showAll ? "Скрыть нулевые остатки" : `Показать все товары (${totalProducts})`}
                  </button>
                </div>
              )}
            </div>
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
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-[28px] border border-black/5 bg-white px-6 py-16 text-center text-sm text-slate-400 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          Загрузка каталога...
        </div>
      ) : (
        <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 border-b border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.26em] text-slate-400">
                  product list
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">
                  {categoryFilter ? `Категория: ${selectedCategory}` : "Текущий каталог"}
                </h3>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                  В наличии: {inStockCount}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                  Низкий остаток: {lowStockCount}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                  Стоимость: {formatMoney(totalStockValue)}
                </span>
              </div>
            </div>

            <div className="hidden grid-cols-[minmax(0,1.7fr)_110px_110px_110px_110px_auto] gap-4 text-[11px] uppercase tracking-[0.22em] text-slate-400 lg:grid">
              <span>Товар</span>
              <span className="text-right">Закупка</span>
              <span className="text-right">Цена</span>
              <span className="text-right">Маржа</span>
              <span className="text-right">Остаток</span>
              <span className="text-right">Действия</span>
            </div>
          </div>

          {filteredProducts.length === 0 && (
            <div className="px-6 py-16 text-center text-sm text-slate-400">Товары не найдены</div>
          )}

          {filteredProducts.map((product, index) => (
            <Fragment key={product.id}>
              <div
                className={`relative flex items-center gap-4 px-5 py-5 transition-colors hover:bg-slate-50/70 sm:px-6 ${
                  index < filteredProducts.length - 1 || inlineAction?.productId === product.id
                    ? "border-b border-slate-50"
                    : ""
                } ${
                  inlineAction?.productId === product.id
                    ? "bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.96))]"
                    : ""
                }`}
              >
                <div
                  className={`absolute bottom-4 left-0 top-4 hidden w-1 rounded-full lg:block ${
                    product.stock === 0
                      ? "bg-red-200"
                      : isLowStock(product)
                        ? "bg-amber-200"
                        : "bg-emerald-200"
                  }`}
                />

                <div className="min-w-0 flex-1 lg:pl-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[15px] font-semibold text-slate-950">{product.name}</p>
                    {isLowStock(product) && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        мало
                      </span>
                    )}
                    {product.is_marked && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-600">
                        ЧЗ
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2.5 text-xs text-slate-500">
                    {product.category_name && (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        {product.category_name}
                      </span>
                    )}
                    {product.sku && (
                      <span className="rounded-full bg-slate-50 px-2.5 py-1 font-mono text-slate-500">
                        {product.sku}
                      </span>
                    )}
                    {product.barcode && (
                      <span className="rounded-full bg-slate-50 px-2.5 py-1 font-mono text-slate-500">
                        {product.barcode}
                      </span>
                    )}
                  </div>
                </div>

                <div className="hidden shrink-0 text-right lg:block">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Закупка</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {formatMoney(product.cost_price)}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right lg:block">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Цена</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {formatMoney(product.sale_price)}
                  </p>
                </div>

                <div className="hidden shrink-0 text-right lg:block">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Маржа</p>
                  <p className="mt-2 text-sm font-semibold text-emerald-600">
                    {formatMoney(product.margin)}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Остаток</p>
                  <p className={`mt-2 text-base font-semibold ${stockColor(product)}`}>
                    {product.stock} шт.
                  </p>
                  {product.position_value && Number.parseFloat(product.position_value) > 0 && (
                    <p className="mt-1 text-xs text-slate-400">{formatMoney(product.position_value)}</p>
                  )}
                  {product.min_stock > 0 && (
                    <p className="mt-1 text-[11px] text-slate-300">мин. {product.min_stock}</p>
                  )}
                </div>

                <div className="shrink-0 flex gap-2 rounded-[18px] border border-slate-200/80 bg-slate-50/80 p-1.5">
                  <ActionIconButton
                    label="Изменить"
                    tone="edit"
                    active={inlineAction?.productId === product.id && inlineAction.type === "edit"}
                    onClick={() => toggleInlineAction(product.id, "edit")}
                  >
                    <EditIcon />
                  </ActionIconButton>
                  <ActionIconButton
                    label="Принять"
                    tone="receipt"
                    active={inlineAction?.productId === product.id && inlineAction.type === "receipt"}
                    onClick={() => toggleInlineAction(product.id, "receipt")}
                  >
                    <ReceiptIcon />
                  </ActionIconButton>
                  <ActionIconButton
                    label="Списать"
                    tone="writeoff"
                    active={inlineAction?.productId === product.id && inlineAction.type === "writeoff"}
                    disabled={product.stock <= 0}
                    onClick={() => toggleInlineAction(product.id, "writeoff")}
                  >
                    <WriteoffIcon />
                  </ActionIconButton>
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
                  categories={categories}
                  categoriesLoading={categoriesLoading}
                  onSuccess={() => {
                    void refreshWarehouse();
                  }}
                  onClose={() => setInlineAction(null)}
                />
              )}
            </Fragment>
          ))}
        </section>
      )}
    </div>
  );
}
