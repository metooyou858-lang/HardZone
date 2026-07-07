import Link from "next/link";
import { cookies } from "next/headers";

import { hasModuleAccess } from "@/lib/access";
import { getSessionCookieName, readSessionToken } from "@/lib/server/session";

const primaryModules = [
  {
    href: "/sales",
    title: "Продажи",
    description: "Собрать чек, отправить его на кассу, проверить оплату и оформить возврат.",
    accent: "from-[rgba(0,191,165,0.18)] to-[rgba(0,191,165,0.04)]",
    permission: "sales",
  },
  {
    href: "/schedule",
    title: "Расписание",
    description: "Тренировки, записи клиентов, посещаемость и свободное посещение зала.",
    accent: "from-[rgba(56,189,248,0.18)] to-[rgba(56,189,248,0.04)]",
    permission: "schedule",
  },
  {
    href: "/clients",
    title: "Клиенты",
    description: "База клиентов, абонементы, быстрый поиск и доступ к карточкам.",
    accent: "from-[rgba(251,191,36,0.18)] to-[rgba(251,191,36,0.04)]",
    permission: "clients",
  },
] as const;

const secondaryModules = [
  {
    href: "/warehouse",
    title: "Склад",
    description: "Остатки, приёмка, списания, инвентаризация и история движения.",
    permission: "warehouse",
  },
  {
    href: "/analytics",
    title: "Аналитика",
    description: "Слой, куда постепенно сводятся продажи, посещения и абонементы.",
    permission: "analytics",
  },
] as const;

const focusItems = [
  "Продажи и оплата через aQsi уже работают в боевом контуре.",
  "Клиенты, абонементы и автоматическая активация услуг уже связаны между собой.",
  "Расписание и open gym ведут реальную посещаемость клуба в одной системе.",
];

function formatToday() {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export default async function HomePage() {
  const sessionToken = (await cookies()).get(getSessionCookieName())?.value;
  const session = await readSessionToken(sessionToken);
  const modules = session?.user.modules;
  const visiblePrimaryModules = primaryModules.filter((module) => hasModuleAccess(modules, module.permission));
  const visibleSecondaryModules = secondaryModules.filter((module) => hasModuleAccess(modules, module.permission));
  const todayLabel = formatToday();

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-[var(--line-soft)] bg-[linear-gradient(135deg,rgba(0,191,165,0.14),rgba(255,255,255,0.02)_45%,rgba(28,35,51,0.98))] p-8 shadow-[0_26px_70px_rgba(0,0,0,0.24)] sm:p-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-[0.26em] text-[var(--text-muted)]">
              HardZone CRM
            </p>
            <h1 className="mt-4 font-[family:var(--font-heading)] text-4xl font-semibold tracking-tight text-[var(--text-main)] sm:text-5xl">
              Центральная рабочая страница клуба
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)] sm:text-lg">
              Отсюда удобно начать день: быстро перейти в кассу, открыть расписание, проверить клиентов или уйти в
              складской контур без лишнего поиска по меню.
            </p>
          </div>

          <div className="rounded-[28px] border border-[rgba(255,255,255,0.08)] bg-[rgba(12,18,28,0.44)] px-5 py-4 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">Сегодня</p>
            <p className="mt-2 font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
              {todayLabel}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.95fr]">
        <div className={`grid gap-5 ${visiblePrimaryModules.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {visiblePrimaryModules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className={`group overflow-hidden rounded-[28px] border border-[var(--line-soft)] bg-gradient-to-br ${module.accent} p-6 transition hover:-translate-y-0.5 hover:border-[rgba(0,191,165,0.3)] hover:shadow-[0_18px_40px_rgba(0,0,0,0.18)]`}
            >
              <p className="font-[family:var(--font-heading)] text-2xl font-semibold tracking-tight text-[var(--text-main)]">
                {module.title}
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{module.description}</p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.08)] px-3 py-2 text-sm font-medium text-[var(--text-main)] transition group-hover:border-[rgba(0,191,165,0.35)] group-hover:text-[var(--accent)]">
                Открыть
                <span aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-[28px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(28,35,51,0.95),rgba(18,24,37,0.98))] p-6 shadow-[0_22px_54px_rgba(0,0,0,0.2)]">
          <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
            Фокус дня
          </p>
          <h2 className="mt-3 font-[family:var(--font-heading)] text-2xl font-semibold tracking-tight text-[var(--text-main)]">
            Главные рабочие контуры уже здесь
          </h2>
          <div className="mt-6 space-y-3">
            {focusItems.map((item) => (
              <div
                key={item}
                className="rounded-[22px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] px-4 py-4 text-sm leading-6 text-[var(--text-main)]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {visibleSecondaryModules.length > 0 ? (
        <section className="rounded-[28px] border border-[var(--line-soft)] bg-[rgba(18,24,37,0.86)] p-6 shadow-[0_20px_44px_rgba(0,0,0,0.16)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-[family:var(--font-mono)] text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                Остальные модули
              </p>
              <h2 className="mt-2 font-[family:var(--font-heading)] text-2xl font-semibold tracking-tight text-[var(--text-main)]">
                Быстрые переходы по системе
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-[var(--text-muted)]">
              В боковом меню остаётся быстрый доступ, а эта страница собирает всё в одном спокойном центре управления.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {visibleSecondaryModules.map((module) => (
              <Link
                key={module.href}
                href={module.href}
                className="group rounded-[24px] border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-5 transition hover:border-[rgba(0,191,165,0.24)] hover:bg-[rgba(0,191,165,0.05)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
                    {module.title}
                  </p>
                  <span className="text-sm text-[var(--text-muted)] transition group-hover:text-[var(--accent)]">→</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{module.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
