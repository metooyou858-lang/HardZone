"use client";

import type { Product } from "@/lib/api/products";
import {
  type CatalogGroup,
  formatMoney,
  getCatalogAccentMeta,
  ScanIcon,
  searchInputCls,
  SearchIcon,
} from "@/components/sales/sales-shared";

type CatalogPanelProps = {
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
  addCatalogProduct: (product: Product) => void | Promise<void>;
};

export function CatalogPanel({
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
  return (          <section className="flex min-h-0 flex-col rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
            <div className="border-b border-[var(--line-soft)] p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="relative block">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--text-muted)]">
                      <SearchIcon />
                    </span>
                    <input
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
                <div className="rounded-[24px] border border-dashed border-[var(--line-soft)] bg-[rgba(13,17,23,0.2)] px-5 py-12 text-center">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.08)] text-[var(--accent)]">
                    <SearchIcon />
                  </div>
                  <p className="mt-4 text-base font-medium text-[var(--text-main)]">Ничего не найдено</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Попробуйте другой запрос или отсканируйте штрихкод</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {catalog.map((product) => {
                    const lineBusy = lineBusyKey === product.id;
                    const disabled = !product.sale_price || orderLoading || orderLocked;
                    const accentMeta = getCatalogAccentMeta(product);

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => void addCatalogProduct(product)}
                        disabled={disabled || lineBusy}
                        className={`group relative overflow-hidden rounded-[24px] border p-4 text-left transition-all ${
                          disabled
                            ? "cursor-not-allowed border-[var(--line-soft)] bg-[rgba(240,246,255,0.03)] opacity-60"
                            : "border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(34,43,61,0.9),rgba(28,35,51,0.95))] hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[rgba(0,191,165,0.08)]"
                        }`}
                      >
                        <span className={`absolute inset-x-4 top-0 h-1 rounded-b-full ${accentMeta.lineClass}`} />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-semibold text-[var(--text-main)]">{product.name}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${accentMeta.chipClass}`}>
                                {accentMeta.label}
                              </span>
                              {product.category_name && (
                                <span className="rounded-full border border-[rgba(255,255,255,0.08)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                                  {product.category_name}
                                </span>
                              )}
                            </div>
                          </div>
                          {product.has_stock && product.stock <= 3 && (
                            <span className="rounded-full border border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--warning)]">
                              мало
                            </span>
                          )}
                        </div>

                        <div className={`mt-4 grid gap-3 ${product.has_stock ? "grid-cols-2" : "grid-cols-1"}`}>
                          <div className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(13,17,23,0.38)] px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Цена</p>
                            <p className="mt-2 text-base font-semibold text-[var(--text-main)]">
                              {formatMoney(product.sale_price)}
                            </p>
                          </div>

                          {product.has_stock && (
                            <div className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(13,17,23,0.38)] px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Остаток</p>
                              <p
                                className={`mt-2 text-base font-semibold ${
                                  product.stock > 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                                }`}
                              >
                                {product.stock} шт.
                              </p>
                            </div>
                          )}
                        </div>

                        {lineBusy && <p className="mt-3 text-xs text-[var(--accent)]">Добавляем в чек...</p>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
  );
}
