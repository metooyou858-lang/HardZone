"use client";

import { useWarehouseHistory } from "@/hooks/useWarehouseHistory";

import { formatDate } from "./shared";

const config = {
  receipt: {
    label: "Приёмка",
    bg: "bg-emerald-100",
    text: "text-emerald-700",
    sign: "+",
    signColor: "text-emerald-600",
  },
  writeoff: {
    label: "Списание",
    bg: "bg-red-100",
    text: "text-red-700",
    sign: "−",
    signColor: "text-red-500",
  },
  sale: {
    label: "Продажа",
    bg: "bg-blue-100",
    text: "text-blue-700",
    sign: "−",
    signColor: "text-blue-500",
  },
} as const;

export function HistoryTab() {
  const { operations, loading, error, reload } = useWarehouseHistory();

  const receiptsCount = operations.filter((operation) => operation.type === "receipt").length;
  const writeoffsCount = operations.filter((operation) => operation.type === "writeoff").length;
  const salesCount = operations.filter((operation) => operation.type === "sale").length;

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="border-b border-black/5 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.72))] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.28em] text-slate-400">
                operations feed
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                История движения склада
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Единая лента складских событий: поступления, списания и продажи в хронологическом порядке.
              </p>
            </div>

            <button
              onClick={() => {
                void reload();
              }}
              className="inline-flex items-center justify-center rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Обновить
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-[22px] border border-black/5 bg-white/80 p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Всего</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{operations.length}</p>
              <p className="mt-1 text-xs text-slate-500">операций в ленте</p>
            </article>

            <article className="rounded-[22px] border border-emerald-100 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(209,250,229,0.92))] p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Приёмка</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{receiptsCount}</p>
              <p className="mt-1 text-xs text-slate-500">поступлений товара</p>
            </article>

            <article className="rounded-[22px] border border-blue-100 bg-[linear-gradient(180deg,rgba(239,246,255,0.98),rgba(219,234,254,0.92))] p-4 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Продажи / списания</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{salesCount + writeoffsCount}</p>
              <p className="mt-1 text-xs text-slate-500">
                {salesCount} продаж и {writeoffsCount} списаний
              </p>
            </article>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-[28px] border border-black/5 bg-white px-6 py-16 text-center text-sm text-slate-400 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          Загрузка истории...
        </div>
      ) : (
        <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="border-b border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  timeline
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-950">Последние операции</h3>
              </div>
              <p className="text-sm text-slate-500">Свежие события сверху, старые уходят вниз</p>
            </div>
          </div>

          {operations.length === 0 && (
            <div className="px-6 py-16 text-center text-sm text-slate-400">Операций пока нет</div>
          )}

          {operations.map((operation, index) => {
            const currentConfig = config[operation.type];

            return (
              <div
                key={operation.id}
                className={`flex items-center gap-4 px-5 py-5 transition-colors hover:bg-slate-50/70 sm:px-6 ${
                  index < operations.length - 1 ? "border-b border-slate-50" : ""
                }`}
              >
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${currentConfig.bg} ${currentConfig.text}`}
                >
                  {currentConfig.label}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-slate-950">
                    {operation.product_name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-400">
                    {operation.product_sku} · {operation.detail}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className={`text-base font-semibold ${currentConfig.signColor}`}>
                    {currentConfig.sign}
                    {operation.quantity} шт.
                  </p>
                  {operation.amount && (
                    <p className="mt-1 text-xs text-slate-500">{operation.amount}</p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-400">{formatDate(operation.created_at)}</p>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
