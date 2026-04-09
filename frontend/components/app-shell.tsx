"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { hasModuleAccess, roleLabels, type AuthModulePermission } from "@/lib/access";
import type { SessionUser } from "@/lib/server/session";

function WarehouseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M3.75 6.667 10 3.75l6.25 2.917v7.5L10 17.083l-6.25-2.916v-7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 9.167h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ServicesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M6.25 4.167h5.417a2.5 2.5 0 0 1 2.5 2.5v8.333H5.833a1.667 1.667 0 0 1-1.666-1.667V6.25a2.083 2.083 0 0 1 2.083-2.083Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 7.5h3.75M7.5 10h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SalesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M5 6.25h10M5 10h10M5 13.75h6.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M3.75 4.167h12.5a1.25 1.25 0 0 1 1.25 1.25v9.166a1.25 1.25 0 0 1-1.25 1.25H3.75a1.25 1.25 0 0 1-1.25-1.25V5.417a1.25 1.25 0 0 1 1.25-1.25Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ClientsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="10" cy="6.25" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.417 15c.556-2.083 2.361-3.333 4.583-3.333 2.222 0 4.027 1.25 4.583 3.333"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScheduleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M5.833 2.917v2.5M14.167 2.917v2.5M3.75 7.083h12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="3.75" y="4.583" width="12.5" height="11.667" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M4.167 15V8.75M10 15V5M15.833 15v-3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3.333 15.833h13.334" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      {collapsed ? (
        <path d="m8 5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="m12 5-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

const navItems: Array<{ href: string; label: string; icon: React.ReactNode; permission: AuthModulePermission }> = [
  { href: "/warehouse", label: "Склад", icon: <WarehouseIcon />, permission: "warehouse" },
  { href: "/services", label: "Услуги", icon: <ServicesIcon />, permission: "services" },
  { href: "/sales", label: "Продажи", icon: <SalesIcon />, permission: "sales" },
  { href: "/clients", label: "Клиенты", icon: <ClientsIcon />, permission: "clients" },
  { href: "/schedule", label: "Расписание", icon: <ScheduleIcon />, permission: "schedule" },
  { href: "/analytics", label: "Аналитика", icon: <AnalyticsIcon />, permission: "analytics" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const isAuthScreen = pathname === "/login" || pathname === "/reset-password";

  useEffect(() => {
    const stored = window.localStorage.getItem("hardzone.sidebar-collapsed");
    if (stored === "true") {
      setCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("hardzone.sidebar-collapsed", collapsed ? "true" : "false");
  }, [collapsed]);

  useEffect(() => {
    if (isAuthScreen) {
      return;
    }

    let cancelled = false;

    fetch("/auth-api/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as { data?: { user?: SessionUser } };
        return data.data?.user ?? null;
      })
      .then((value) => {
        if (!cancelled) {
          setUser(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthScreen]);

  async function handleLogout() {
    await fetch("/auth-api/logout", {
      method: "POST",
      credentials: "same-origin",
    });

    window.location.href = "/login";
  }

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => hasModuleAccess(user?.modules, item.permission)),
    [user?.modules]
  );

  if (isAuthScreen) {
    return <>{children}</>;
  }

  return (
    <div
      className="app-grid bg-[var(--bg-app)]"
      style={{ ["--sidebar-width" as string]: collapsed ? "92px" : "264px" }}
      data-sidebar-collapsed={collapsed ? "true" : "false"}
    >
      <aside className="sidebar-scrollbar relative overflow-hidden border-r border-[var(--line-soft)] bg-[var(--bg-app)] text-[var(--text-inverse)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,191,165,0.18),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(63,185,80,0.08),_transparent_24%)]" />
        <div className="relative flex h-full flex-col gap-7 p-5">
          <div className="space-y-4">
            <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-3`}>
              <Link
                href="/"
                title="Открыть главную страницу"
                className="inline-flex items-center rounded-full border border-[var(--line-soft)] bg-white/5 px-3 py-1 font-[family:var(--font-mono)] text-xs uppercase tracking-[0.3em] text-[var(--text-muted)] transition hover:border-[rgba(0,191,165,0.28)] hover:text-[var(--text-main)]"
              >
                {collapsed ? "HZ" : "hardzone"}
              </Link>
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
                aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
                title={collapsed ? "Развернуть меню" : "Свернуть меню"}
              >
                <CollapseIcon collapsed={collapsed} />
              </button>
            </div>

            <div className={collapsed ? "text-center" : ""}>
              <Link href="/" className="inline-block" title="Открыть главную страницу">
                <p className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] transition hover:text-[var(--accent)]">
                  {collapsed ? "HZ" : "CRM"}
                </p>
              </Link>
            </div>
          </div>

          <nav className="flex flex-col gap-3">
            {visibleNavItems.map((item) => {
              const active = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={`group relative flex items-center ${
                    collapsed ? "justify-center" : "justify-start"
                  } overflow-hidden rounded-[20px] border px-4 py-4 transition-all ${
                    active
                      ? "border-[#1E2733] bg-[#1C2333] text-[var(--text-main)] shadow-[0_12px_28px_rgba(0,0,0,0.16)]"
                      : "border-transparent bg-transparent text-[var(--text-muted)] hover:border-[rgba(0,191,165,0.16)] hover:bg-[linear-gradient(135deg,rgba(0,191,165,0.12),rgba(255,255,255,0.03))] hover:text-[var(--text-main)] hover:shadow-[0_14px_30px_rgba(0,0,0,0.18)]"
                  }`}
                >
                  <span
                    className={`absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)] transition-opacity ${
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    }`}
                  />
                  <span className={`relative flex items-center ${collapsed ? "justify-center" : "gap-3"} font-medium`}>
                    <span
                      className={
                        active ? "text-[var(--accent)]" : "text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent)]"
                      }
                    >
                      {item.icon}
                    </span>
                    {!collapsed ? <span>{item.label}</span> : null}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-[var(--line-soft)] pt-5">
            <div
              className={`rounded-[22px] border border-[var(--line-soft)] bg-[linear-gradient(135deg,rgba(35,46,71,0.95),rgba(28,35,51,0.98))] ${
                collapsed ? "px-3 py-4 text-center" : "p-4"
              }`}
            >
              {collapsed ? (
                <>
                  <p className="font-[family:var(--font-heading)] text-lg font-semibold text-[var(--text-main)]">HZ</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-[var(--text-muted)]">CRM</p>
                </>
              ) : (
                <>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">HardZone • Хабаровск</p>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-main)]">{user?.name || "Загрузка..."}</p>
                      <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                        {user ? user.role_title || roleLabels[user.role] : "Проверяем права доступа"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="inline-flex shrink-0 items-center rounded-2xl border border-[rgba(255,255,255,0.08)] px-3 py-2 text-xs font-medium text-[var(--text-main)] transition hover:border-[rgba(0,191,165,0.28)] hover:text-[var(--accent)]"
                    >
                      Выйти
                    </button>
                  </div>
                  {user && hasModuleAccess(user.modules, "users_manage") ? (
                    <Link
                      href="/admin/users"
                      className="mt-3 inline-flex items-center rounded-2xl border border-[rgba(0,191,165,0.22)] bg-[rgba(0,191,165,0.08)] px-3 py-2 text-xs font-medium text-[var(--accent)] transition hover:border-[rgba(0,191,165,0.38)] hover:bg-[rgba(0,191,165,0.12)]"
                    >
                      Сотрудники и доступы
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 bg-[var(--bg-app)]">
        <main className="mx-auto max-w-[1680px] px-6 py-6 sm:px-8 sm:py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
