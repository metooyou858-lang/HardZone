"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/warehouse", label: "Склад", short: "01" },
  { href: "/sales", label: "Продажи", short: "02" },
  { href: "/clients", label: "Клиенты", short: "03" },
  { href: "/schedule", label: "Расписание", short: "04" },
  { href: "/analytics", label: "Аналитика", short: "05" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-grid">
      <aside className="sidebar-scrollbar relative overflow-hidden border-r border-white/6 bg-[linear-gradient(180deg,_var(--bg-panel),_var(--bg-panel-soft))] text-[var(--text-inverse)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.2),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(14,165,166,0.16),_transparent_28%)]" />
        <div className="relative flex h-full flex-col gap-8 p-6">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 font-[family:var(--font-mono)] text-xs uppercase tracking-[0.3em] text-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              hardzone
            </div>
            <div>
              <p className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight">
                CRM
              </p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-300">
                Управление фитнес-бизнесом в одном интерфейсе.
              </p>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center justify-between rounded-[20px] border px-4 py-4 transition-all ${
                    active
                      ? "border-[var(--accent)]/50 bg-[linear-gradient(135deg,rgba(249,115,22,0.22),rgba(251,146,60,0.16))] text-white shadow-[0_16px_34px_rgba(249,115,22,0.14)]"
                      : "border-white/8 bg-white/5 text-slate-200 hover:border-white/15 hover:bg-white/8 hover:translate-x-1"
                  }`}
                >
                  <span className="font-medium">{item.label}</span>
                  <span className="font-[family:var(--font-mono)] text-xs text-white/70">
                    {item.short}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-[24px] border border-white/10 bg-black/15 p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
              HardZone · Хабаровск
            </p>
            <p className="mt-3 font-[family:var(--font-heading)] text-xl font-semibold">
              Пилот v1
            </p>
          </div>
        </div>
      </aside>

      <div className="min-w-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.34),_transparent_34%)]">
        <main className="mx-auto max-w-[1680px] px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
