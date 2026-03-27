"use client";

import { useState } from "react";

import { HistoryTab } from "@/components/warehouse/history-tab";
import { ProductsTab } from "@/components/warehouse/products-tab";

type Tab = "products" | "history";

const tabs: { id: Tab; label: string; note: string }[] = [
  { id: "products", label: "Товары", note: "Каталог, приёмка и списание" },
  { id: "history", label: "История", note: "Хронология движения склада" },
];

export default function WarehousePage() {
  const [tab, setTab] = useState<Tab>("products");

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-black/5 bg-white/90 p-7 shadow-[0_28px_80px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.12),_transparent_30%),radial-gradient(circle_at_82%_24%,_rgba(14,165,166,0.12),_transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.88),rgba(246,243,238,0.92))]" />
        <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-[0.32em] text-slate-500">
              module · warehouse
            </p>
            <h1 className="mt-3 font-[family:var(--font-heading)] text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Склад
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[15px]">
              Один экран для ежедневной работы с товаром: поиск, приёмка, списание,
              категории, импорт и контроль остатков без переключения между разными страницами.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
            <article className="rounded-[24px] border border-white/70 bg-white/80 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
              <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.28em] text-slate-400">
                Каталог
              </p>
              <p className="mt-3 text-lg font-semibold text-slate-950">Товары и остатки</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Быстрый доступ к карточкам, ценам, категориям и складским действиям прямо в строке товара.
              </p>
            </article>

            <article className="rounded-[24px] border border-white/70 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))] p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
              <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.28em] text-white/50">
                Контроль
              </p>
              <p className="mt-3 text-lg font-semibold">История и инвентаризация</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Движение товара, расхождения и состояние склада в одном модуле, без лишних переходов.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-black/5 bg-white/70 p-1.5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <div className="grid gap-1 md:grid-cols-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-[22px] px-4 py-4 text-left transition-all ${
                tab === item.id
                  ? "bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.94))] text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]"
                  : "bg-transparent text-slate-500 hover:bg-white hover:text-slate-800"
              }`}
            >
              <p className="text-sm font-semibold">{item.label}</p>
              <p className={`mt-1 text-xs ${tab === item.id ? "text-white/60" : "text-slate-400"}`}>
                {item.note}
              </p>
            </button>
          ))}
        </div>
      </section>

      {tab === "products" && <ProductsTab />}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}
