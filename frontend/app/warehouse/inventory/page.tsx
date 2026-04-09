"use client";

import Link from "next/link";

import { InventoryTab } from "@/components/warehouse/inventory-tab";

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-widest text-[var(--text-muted)]">
            warehouse
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--text-main)]">Инвентаризация</h1>
        </div>
        <Link
          href="/warehouse"
          className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-main)]"
        >
          ← Склад
        </Link>
      </div>

      <InventoryTab />
    </div>
  );
}
