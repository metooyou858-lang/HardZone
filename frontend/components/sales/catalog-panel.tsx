"use client";

import type { RefObject } from "react";

import type { Product } from "@/lib/api/products";
import {
  type CatalogGroup,
  formatMoney,
  getCatalogAccentMeta,
  ScanIcon,
  searchInputCls,
  SearchIcon,
  SERVICES_GROUP_ID,
} from "@/components/sales/sales-shared";

type CatalogPanelProps = {
  searchInputRef?: RefObject<HTMLInputElement | null>;
  query: string;
  setQuery: (value: string) => void;
  catalogGroups: CatalogGroup[];
  selectedCatalogGroup: string | null;
  setSelectedCatalogGroup: (value: string | null) => void;
  catalogGroupsLoading: boolean;
  catalogLoading: boolean;
  catalog: Product[];
  lineBusyKey: string | null;
  orderLoading: boolean;
  orderLocked: boolean;
  addCatalogProduct: (product: Product) => unknown;
};

export function CatalogPanel({
  searchInputRef,
  query,
  setQuery,
  catalogGroups,
  selectedCatalogGroup,
  setSelectedCatalogGroup,
  catalogGroupsLoading,
  catalogLoading,
  catalog,
  lineBusyKey,
  orderLoading,
  orderLocked,
  addCatalogProduct,
}: CatalogPanelProps) {
  return (          <section className="flex min-h-0 flex-col rounded-[28px] bg-[var(--bg-card)] shadow-[0_4px_32px_rgba(0,0,0,0.22)]">
            <div className="border-b border-[var(--line-soft)] p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="relative block">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--text-muted)]">
                      <SearchIcon />
                    </span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Поиск по названию или SKU..."
                      className={`${searchInputCls} pl-12`}
                    />
                  </label>
                </div>

                <div className="inline-flex items-center gap-2 rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-3 py-2 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <ScanIcon />
                  </span>
                  <span>Сканер: штрихкод или код маркировки, 6+ символов за 100мс + Enter</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {catalogGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setSelectedCatalogGroup(group.id);
                      setQuery("");
                    }}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                      selectedCatalogGroup === group.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--line-soft)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    {group.label}
                    <span className="ml-2 text-xs opacity-70">{group.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {catalogGroupsLoading || catalogLoading ? (
                <div className="py-16 text-center text-sm text-[var(--text-muted)]">Загрузка каталога...</div>
              ) : catalog.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[var(--line-soft)] bg-[var(--bg-panel)] px-5 py-12 text-center">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <SearchIcon />
                  </div>
                  <p className="mt-4 text-base font-medium text-[var(--text-main)]">Ничего не найдено</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Попробуйте другой запрос или отсканируйте штрихкод</p>
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                  {catalog.map((product) => {
                    const lineBusy = lineBusyKey === product.id;
                    const disabled = !product.sale_price || orderLoading || orderLocked;
                    const accentMeta = getCatalogAccentMeta(product);

                    // Inside a specific category, don't repeat category name — show SKU instead
                    const inSpecificCategory = selectedCatalogGroup !== null && selectedCatalogGroup !== SERVICES_GROUP_ID;
                    const isSearching = query.trim().length >= 2;
                    const secondaryText = (inSpecificCategory && !isSearching)
                      ? (product.sku ?? null)
                      : (product.category_name ?? null);

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => void addCatalogProduct(product)}
                        disabled={disabled || lineBusy}
                        className={`group relative overflow-hidden rounded-[18px] border px-4 py-3 text-left transition-all ${
                          disabled
                            ? "cursor-not-allowed border-[var(--line-soft)] bg-[var(--bg-card-soft)] opacity-40"
                            : "border-[var(--line-soft)] bg-[var(--bg-card-soft)] hover:border-[rgba(94,244,216,0.3)] hover:bg-[var(--accent-soft)]"
                        }`}
                      >
                        <span className={`absolute inset-x-4 top-0 h-0.5 rounded-b-full ${accentMeta.lineClass}`} />
                        <div className="flex items-start justify-between gap-3">
                          <p className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-[var(--text-main)]">
                            {product.name}
                          </p>
                          <p className="shrink-0 text-sm font-semibold text-[var(--text-main)]">
                            {formatMoney(product.sale_price)}
                          </p>
                        </div>

                        <div className="mt-1 flex items-end justify-between gap-2">
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {secondaryText ?? ""}
                          </p>
                          {product.has_stock && (
                            product.stock <= 5 ? (
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                                product.stock <= 2
                                  ? "border-[rgba(255,116,57,0.35)] text-[var(--danger)]"
                                  : "border-[rgba(210,153,34,0.35)] text-[var(--warning)]"
                              }`}>
                                {product.stock} шт.
                              </span>
                            ) : (
                              <span className="shrink-0 text-xs text-[var(--text-muted)]">{product.stock} шт.</span>
                            )
                          )}
                        </div>

                        {lineBusy && <p className="mt-1.5 text-xs text-[var(--accent)]">Добавляем...</p>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
  );
}
