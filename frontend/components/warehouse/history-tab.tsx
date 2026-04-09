"use client";

import { useWarehouseHistory } from "@/hooks/useWarehouseHistory";

import { formatDate } from "./shared";

const config = {
  receipt: {
    label: "Приёмка",
    bg: "bg-[rgba(63,185,80,0.12)]",
    text: "text-[var(--success)]",
    sign: "+",
    signColor: "text-[var(--success)]",
  },
  writeoff: {
    label: "Списание",
    bg: "bg-[rgba(248,81,73,0.12)]",
    text: "text-[var(--danger)]",
    sign: "−",
    signColor: "text-[var(--danger)]",
  },
  sale: {
    label: "Продажа",
    bg: "bg-[rgba(0,191,165,0.12)]",
    text: "text-[var(--accent)]",
    sign: "−",
    signColor: "text-[var(--accent)]",
  },
} as const;

export function HistoryTab() {
  const { operations, loading, error, reload } = useWarehouseHistory();

  const receiptsCount = operations.filter((operation) => operation.type === "receipt").length;
  const writeoffsCount = operations.filter((operation) => operation.type === "writeoff").length;
  const salesCount = operations.filter((operation) => operation.type === "sale").length;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
        <div className="border-b border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.28em] text-[var(--text-muted)]">
                operations feed
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--text-main)]">
                История движения склада
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">
                Единая лента складских событий: поступления, списания и продажи в
                хронологическом порядке.
              </p>
            </div>

            <button
              onClick={() => {
                void reload();
              }}
              className="inline-flex items-center justify-center rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--text-main)]"
            >
              Обновить
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Всего</p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">{operations.length}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">операций в ленте</p>
            </article>

            <article className="rounded-[22px] border border-[rgba(63,185,80,0.25)] bg-[rgba(63,185,80,0.08)] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Приёмка</p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">{receiptsCount}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">поступлений товара</p>
            </article>

            <article className="rounded-[22px] border border-[rgba(0,191,165,0.28)] bg-[rgba(0,191,165,0.08)] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                Продажи / списания
              </p>
              <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">
                {salesCount + writeoffsCount}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {salesCount} продаж и {writeoffsCount} списаний
              </p>
            </article>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          Загрузка истории...
        </div>
      ) : (
        <section className="overflow-hidden rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
          <div className="border-b border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">
                  timeline
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--text-main)]">
                  Последние операции
                </h3>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                Свежие события сверху, старые уходят вниз
              </p>
            </div>
          </div>

          {operations.length === 0 && (
            <div className="px-6 py-16 text-center text-sm text-[var(--text-muted)]">
              Операций пока нет
            </div>
          )}

          {operations.map((operation, index) => {
            const currentConfig = config[operation.type];

            return (
              <div
                key={operation.id}
                className={`flex items-center gap-4 px-5 py-5 transition-colors hover:bg-white/3 sm:px-6 ${
                  index < operations.length - 1 ? "border-b border-[var(--line-soft)]" : ""
                }`}
              >
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${currentConfig.bg} ${currentConfig.text}`}
                >
                  {currentConfig.label}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[var(--text-main)]">
                    {operation.product_name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                    {operation.product_sku} · {operation.detail}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className={`text-base font-semibold ${currentConfig.signColor}`}>
                    {currentConfig.sign}
                    {operation.quantity} шт.
                  </p>
                  {operation.amount && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{operation.amount}</p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-[var(--text-muted)]">{formatDate(operation.created_at)}</p>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
