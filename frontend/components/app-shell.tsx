"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ALL_MODULE_PERMISSIONS, hasModuleAccess, type AuthModulePermission } from "@/lib/access";
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

function FinanceIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M3.75 6.25h12.5M5.833 10h8.334M7.5 13.75h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="2.917" y="3.75" width="14.166" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function MarketingIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M3.75 9.167v1.666l2.917.834 6.666 3.75V4.583l-6.666 3.75-2.917.834Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m6.667 11.667.833 4.166h2.083l-.833-3.125" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.094c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 0 1 1.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 0 1-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 0 1-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 0 1 .12-1.45l.773-.773a1.125 1.125 0 0 1 1.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B0E14" strokeWidth="2" aria-hidden="true">
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" fill="#0B0E14" stroke="none" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M7.5 3.75H4.167A.833.833 0 0 0 3.333 4.583v10.834a.833.833 0 0 0 .834.833H7.5M13.333 14.167 16.667 10l-3.334-4.167M16.667 10H7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const navItems: Array<{ href: string; label: string; icon: React.ReactNode; permission: AuthModulePermission }> = [
  { href: "/warehouse", label: "Склад", icon: <WarehouseIcon />, permission: "warehouse" },
  { href: "/sales", label: "Продажи", icon: <SalesIcon />, permission: "sales" },
  { href: "/clients", label: "Клиенты", icon: <ClientsIcon />, permission: "clients" },
  { href: "/schedule", label: "Расписание", icon: <ScheduleIcon />, permission: "schedule" },
  { href: "/analytics", label: "Аналитика", icon: <AnalyticsIcon />, permission: "analytics" },
  { href: "/marketing", label: "Маркетинг", icon: <MarketingIcon />, permission: "marketing" },
  { href: "/finance", label: "Финансы", icon: <FinanceIcon />, permission: "analytics" },
];

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center text-xs font-bold text-[#0B0E14]"
      style={{ background: "linear-gradient(135deg, #5EF4D8, #08C4A9)", borderRadius: 12 }}
    >
      {initials || "?"}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [narrowLayout, setNarrowLayout] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const pathnameRef = useRef(pathname);
  const navigationFallbackRef = useRef<number | null>(null);
  const isAuthScreen = pathname === "/login" || pathname === "/reset-password";
  const isTelegramMiniApp = pathname.startsWith("/telegram/");

  useEffect(() => {
    pathnameRef.current = pathname;
    if (navigationFallbackRef.current) {
      window.clearTimeout(navigationFallbackRef.current);
      navigationFallbackRef.current = null;
    }
  }, [pathname]);

  function scheduleNavigationFallback(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      pathnameRef.current === href
    ) {
      return;
    }

    const currentPath = pathnameRef.current;
    if (navigationFallbackRef.current) {
      window.clearTimeout(navigationFallbackRef.current);
    }

    navigationFallbackRef.current = window.setTimeout(() => {
      if (pathnameRef.current === currentPath) {
        window.location.href = href;
      }
    }, 900);
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("hardzone.sidebar-collapsed");
    if (stored === "true") setCollapsed(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 960px)");
    const update = () => setNarrowLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("hardzone.sidebar-collapsed", collapsed ? "true" : "false");
  }, [collapsed]);

  useEffect(() => {
    if (isAuthScreen || isTelegramMiniApp) return;

    let cancelled = false;

    fetch("/auth-api/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json()) as { data?: { user?: SessionUser } };
        return data.data?.user ?? null;
      })
      .then((value) => {
        if (!cancelled) {
          const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
          setUser(value ?? (local ? {
            id: 0,
            name: "Волк Григорий",
            username: "local-preview",
            role: "owner",
            role_title: "Главный администратор",
            modules: ALL_MODULE_PERMISSIONS,
          } : null));
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });

    return () => { cancelled = true; };
  }, [isAuthScreen, isTelegramMiniApp]);

  async function handleLogout() {
    await fetch("/auth-api/logout", { method: "POST", credentials: "same-origin" });
    window.location.href = "/login";
  }

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => hasModuleAccess(user?.modules, item.permission)),
    [user?.modules]
  );

  if (isAuthScreen || isTelegramMiniApp) {
    return <>{children}</>;
  }

  const sidebarCollapsed = collapsed || narrowLayout;

  const canAccessSettings =
    hasModuleAccess(user?.modules, "services") ||
    hasModuleAccess(user?.modules, "users_manage") ||
    hasModuleAccess(user?.modules, "schedule") ||
    hasModuleAccess(user?.modules, "schedule_gym") ||
    hasModuleAccess(user?.modules, "schedule_clients") ||
    hasModuleAccess(user?.modules, "schedule_attendance");

  return (
    <div
      className="app-grid bg-[var(--bg-app)]"
      style={{ ["--sidebar-width" as string]: sidebarCollapsed ? "64px" : "clamp(184px, 13vw, 200px)" }}
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
    >
      {/* Сайдбар */}
      <aside className="sidebar-scrollbar z-[70] h-dvh overflow-y-auto overflow-x-hidden bg-transparent text-[var(--text-main)]">
        <div className="relative flex min-h-full flex-col">

          {/* Логотип */}
          <div
            className={`flex h-[60px] shrink-0 items-center gap-[10px] overflow-hidden ${
              sidebarCollapsed ? "justify-center px-0" : "px-5"
            }`}
          >
            <Link
              href="/"
              title="HardZone CRM"
              onClick={(event) => scheduleNavigationFallback(event, "/")}
              className="inline-flex shrink-0 items-center justify-center rounded-[10px]"
              style={{
                width: 32, height: 32,
                background: "linear-gradient(135deg, #5EF4D8, #08C4A9)",
              }}
            >
              <ZapIcon />
            </Link>
            {!sidebarCollapsed && (
              <span
                className="whitespace-nowrap text-[13px] font-extrabold tracking-[0.08em] text-[var(--text-main)]"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                HARDZONE
              </span>
            )}
          </div>

          {/* Навигация */}
          <nav className="flex flex-1 flex-col py-2">
            {visibleNavItems.map((item) => {
              const active = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  onClick={(event) => {
                    if (!active) scheduleNavigationFallback(event, item.href);
                  }}
                  className={`group relative flex items-center text-[rgba(236,237,246,0.6)] transition-all hover:bg-[rgba(94,244,216,0.10)] hover:text-[var(--text-main)] ${
                    sidebarCollapsed ? "justify-center px-0 py-3" : "gap-3 px-5 py-3"
                  }`}
                >
                  <span className="text-[rgba(236,237,246,0.6)] transition-colors group-hover:text-[var(--accent)]">
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && (
                    <span className="text-[13px] font-medium">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Кнопка сворачивания — внизу */}
          <div className={`shrink-0 ${sidebarCollapsed ? "flex flex-col items-center gap-1 py-3" : "px-3 py-3"}`}>
            {user ? (
              <div className={`flex min-w-0 items-center ${sidebarCollapsed ? "justify-center" : "gap-2 px-1"}`}>
                <UserAvatar name={user.name || ""} />
                {!sidebarCollapsed && (
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-main)]">{user.name}</p>
                )}
              </div>
            ) : (
              <div className="h-8 w-8 animate-pulse rounded-full bg-[rgba(255,255,255,0.06)]" />
            )}
            <div className={`flex items-center justify-center gap-2 ${sidebarCollapsed ? "flex-col" : "mt-2"}`}>
              {canAccessSettings && (
                <Link href="/settings" title="Настройки" onClick={(event) => scheduleNavigationFallback(event, "/settings")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[rgba(94,244,216,0.10)] hover:text-[var(--accent)]">
                  <SettingsIcon />
                </Link>
              )}
              <button type="button" onClick={handleLogout} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-[rgba(94,244,216,0.10)] hover:text-[var(--accent)]" title="Выйти">
                <LogoutIcon />
              </button>
              <button type="button" onClick={() => setCollapsed((v) => !v)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[rgba(236,237,246,0.35)] transition-colors hover:bg-[rgba(94,244,216,0.10)] hover:text-[var(--accent)]" aria-label={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"} title={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"} disabled={narrowLayout}>
                <CollapseIcon collapsed={sidebarCollapsed} />
              </button>
            </div>
          </div>        </div>
      </aside>

      {/* Правая колонка: хедер + контент */}
      <div className="crm-workspace-background relative z-0 isolate flex h-dvh min-h-0 min-w-0 flex-col bg-transparent">
        <div className="crm-workspace-watermark" aria-hidden="true" />

        {/* Хедер */}


        <main className="crm-page mx-auto min-h-0 w-full flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
