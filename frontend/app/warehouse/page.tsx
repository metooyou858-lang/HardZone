"use client";

import { useState } from "react";

import { HistoryTab } from "@/components/warehouse/history-tab";
import { InventoryTab } from "@/components/warehouse/inventory-tab";
import { ProductsTab } from "@/components/warehouse/products-tab";

type Tab = "products" | "history" | "inventory";

const tabs: { id: Tab; label: string }[] = [
  { id: "products", label: "Товары" },
  { id: "history", label: "История" },
  { id: "inventory", label: "Инвентаризация" },
];

export default function WarehousePage() {
  const [tab, setTab] = useState<Tab>("products");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">
          Склад
        </h1>
      </div>

      <section className="border-b border-[var(--line-soft)]">
        <div className="flex flex-wrap gap-8">
          {tabs.map((item) => {
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

      {tab === "products" && <ProductsTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "inventory" && <InventoryTab />}
    </div>
  );
}
