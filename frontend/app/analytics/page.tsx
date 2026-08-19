"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  approvePayrollRun,
  createAnalyticsExpense,
  createPayrollRule,
  createPayrollRun,
  deleteAnalyticsExpense,
  deletePayrollRun,
  deletePayrollRule,
  fetchAnalyticsReport,
  fetchPayrollReport,
  fetchPayrollRules,
  fetchPayrollRuns,
  payPayrollRunEmployee,
  revokePayrollRunApproval,
  updatePayrollRule,
  type AnalyticsAttentionClient,
  type AnalyticsBusinessDetail,
  type AnalyticsCheck,
  type AnalyticsExternalExpense,
  type AnalyticsReport,
  type AnalyticsSaleLine,
  type AnalyticsVisitDetail,
  type PayrollReport,
  type PayrollRule,
  type PayrollRun,
  type PayrollTrainerSummary,
} from "@/lib/api/analytics";
import { fetchProducts, type Product } from "@/lib/api/products";
import { fetchTrainingTypes, type TrainingType } from "@/lib/api/training-types";
import { fetchTrainers, type Trainer } from "@/lib/api/trainers";

type Tab = "overview" | "checks" | "products" | "services" | "expenses" | "payroll";
type AnalyticsSection = "analytics" | "finance";

const financeTabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "checks", label: "Чеки" },
  { id: "products", label: "Товарка" },
  { id: "services", label: "Услуги" },
  { id: "expenses", label: "Расходы" },
  { id: "payroll", label: "Зарплаты" },
];

const analyticsTabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Обзор" },
];

const paymentLabels: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
};

const statusLabels: Record<string, string> = {
  confirmed: "Оплачен",
  partially_refunded: "Частичный возврат",
  refunded: "Возврат",
};

const kindLabels: Record<string, string> = {
  product: "Товар",
  service: "Услуга",
  subscription: "Услуга",
};

const writeoffLabels: Record<string, string> = {
  damage: "Порча",
  expired: "Истёк срок",
  own_use: "Собственные нужды",
  other: "Другое",
};

const monthLabels = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

function getMonthRange(monthValue: string) {
  const [yearRaw, monthRaw] = monthValue.split("-");
  const year = Number.parseInt(yearRaw || "", 10);
  const month = Number.parseInt(monthRaw || "", 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return getMonthRange(currentMonthValue());
  }

  const lastDay = new Date(year, month, 0).getDate();

  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

function parseMonthValue(monthValue: string) {
  const [yearRaw, monthRaw] = monthValue.split("-");
  const year = Number.parseInt(yearRaw || "", 10);
  const month = Number.parseInt(monthRaw || "", 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  return { year, month };
}

function buildMonthValue(year: number, month: number) {
  return `${year}-${pad2(month)}`;
}

function shiftMonthValue(monthValue: string, shift: number) {
  const { year, month } = parseMonthValue(monthValue);
  const next = new Date(year, month - 1 + shift, 1);

  return buildMonthValue(next.getFullYear(), next.getMonth() + 1);
}

function formatPeriodDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return day + "." + month + "." + year;
}
function formatMoney(value: number | string | null | undefined) {
  const number = Number(value || 0);
  return `${number.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

function formatNumber(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatCount(value: number, one: string, few: string, many: string) {
  const mod100 = Math.abs(value) % 100;
  const mod10 = mod100 % 10;
  const form = mod100 >= 11 && mod100 <= 14 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many;
  return `${value} ${form}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "—";
}

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "good" | "warn";
  onClick?: () => void;
}) {
  const toneClass =
    tone === "good"
      ? "border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.08)]"
      : tone === "warn"
        ? "border-[rgba(255,116,57,0.25)] bg-[rgba(255,116,57,0.08)]"
        : "border-[var(--line-soft)] bg-[rgba(22,27,39,0.68)]";
  const content = (
    <>
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{hint}</p>
    </>
  );

  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Открыть детализацию: ${label}`}
      className={`min-h-11 rounded-[8px] border p-4 text-left transition-colors hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${toneClass}`}
    >
      {content}
    </button>
  ) : (
    <article className={`rounded-[8px] border p-4 ${toneClass}`}>{content}</article>
  );
}
function formatShortRange(range: { from: string; to: string }) {
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const [, fromMonth, fromDay] = range.from.split("-").map(Number);
  const [, toMonth, toDay] = range.to.split("-").map(Number);

  if (fromMonth === toMonth) {
    return fromDay === toDay
      ? `${toDay} ${months[toMonth - 1]}`
      : `${fromDay}–${toDay} ${months[toMonth - 1]}`;
  }

  return `${fromDay} ${months[fromMonth - 1]} – ${toDay} ${months[toMonth - 1]}`;
}

function ComparisonCard({
  label,
  value,
  previous,
  comparisonLabel,
  hint,
  inverse = false,
  onClick,
}: {
  label: string;
  value: number;
  previous: number;
  comparisonLabel: string;
  hint: string;
  inverse?: boolean;
  onClick: () => void;
}) {
  const difference = value - previous;
  const favorable = inverse ? difference < 0 : difference > 0;
  const unfavorable = inverse ? difference > 0 : difference < 0;
  const comparisonClass = favorable
    ? "text-[var(--success)]"
    : unfavorable
      ? "text-[var(--danger)]"
      : "text-[var(--text-muted)]";
  const differenceText = formatNumber(Math.abs(difference));

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Открыть детализацию: ${label}`}
      className="min-h-11 rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.68)] p-4 text-left transition-colors hover:border-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">{formatNumber(value)}</p>
      <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${comparisonClass}`}>
        {difference === 0 ? "Без изменений" : (
          <>
            <span className="sr-only">{difference > 0 ? "Рост" : "Снижение"} на </span>
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {difference > 0
                ? <path d="M3 13 11 5m0 0H5m6 0v6" />
                : <path d="m3 5 8 8m0 0H5m6 0V7" />}
            </svg>
            <span>{differenceText}</span>
          </>
        )}
        <span>к {comparisonLabel}</span>
      </p>
      <p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{hint}</p>
    </button>
  );
}

type BusinessDrilldownMetric = keyof AnalyticsReport["business_health"]["details"];
type VisitDrilldownMetric = "visits" | "group" | "personal" | "open_gym";
type DrilldownMetric = BusinessDrilldownMetric | VisitDrilldownMetric;

const drilldownTitles: Record<DrilldownMetric, string> = {
  active_clients: "Активные клиенты",
  new_clients: "Новые клиенты",
  renewed_clients: "Повторные клиенты",
  lapsed_clients: "Без продления",
  lost_clients: "Потерянные клиенты",
  visits: "Все посещения",
  group: "Групповые посещения",
  personal: "Персональные посещения",
  open_gym: "Open Gym",
};

function AnalyticsDrilldown({ metric, report, onClose }: { metric: DrilldownMetric; report: AnalyticsReport; onClose: () => void }) {
  const businessMetric = metric.endsWith("_clients") ? metric as BusinessDrilldownMetric : null;
  const visitMetric = businessMetric ? null : metric as VisitDrilldownMetric;
  const businessRows: AnalyticsBusinessDetail[] = businessMetric ? report.business_health.details[businessMetric] : [];
  const visitRows: AnalyticsVisitDetail[] = visitMetric
    ? report.business_health.visit_details.filter((row) => visitMetric === "visits" || row[visitMetric] > 0)
    : [];
  const visitCount = metric === "visits"
    ? report.business_health.current.visits_count
    : metric === "group"
      ? report.summary.group_visits
      : metric === "personal"
        ? report.summary.personal_visits
        : metric === "open_gym"
          ? report.summary.open_gym_visits
          : 0;
  const summary = businessMetric
    ? metric === "lost_clients"
      ? `${businessRows.length} клиентов · На ${formatPeriodDate(report.business_health.period.to)}`
      : `${businessRows.length} клиентов`
    : `${visitCount} посещений · ${visitRows.length} клиентов`;
  const dateLabel = metric === "active_clients"
    ? "Действует до"
    : metric === "lapsed_clients"
      ? "Закончился"
      : metric === "lost_clients"
        ? "Последний визит"
        : "Дата покупки";
  const itemLabel = metric === "new_clients" || metric === "renewed_clients"
    ? "Услуга"
    : metric === "lost_clients"
      ? "Причина"
      : "Абонемент";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-[#03060b]/65 backdrop-blur-[3px]" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-drilldown-title"
        className="h-full w-full max-w-[720px] overflow-y-auto border-l border-[var(--line-soft)] bg-[var(--bg-panel)] shadow-[-30px_0_90px_rgba(0,0,0,.45)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--line-soft)] bg-[var(--bg-panel)] px-5 py-5 sm:px-7">
          <div>
            <h2 id="analytics-drilldown-title" className="text-xl font-semibold text-[var(--text-main)]">{drilldownTitles[metric]}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{summary} · {formatShortRange(report.business_health.period)}</p>
          </div>
          <button type="button" onClick={onClose} autoFocus aria-label="Закрыть детализацию" className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] border border-[var(--line-soft)] text-xl text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-main)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
            ×
          </button>
        </header>

        <div className="p-5 sm:p-7">
          {businessMetric ? (
            businessRows.length === 0 ? (
              <EmptyState text="В выбранном периоде клиентов по этому показателю нет" />
            ) : (
              <div className="overflow-hidden rounded-[8px] border border-[var(--line-soft)]">
                <div className="hidden grid-cols-[1.2fr_1.2fr_0.7fr] gap-4 border-b border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-xs font-medium text-[var(--text-muted)] sm:grid">
                  <span>Клиент</span><span>{itemLabel}</span><span>{dateLabel}</span>
                </div>
                {businessRows.map((row, index) => (
                  <div key={row.client_id} className={`grid gap-2 px-4 py-4 text-sm sm:grid-cols-[1.2fr_1.2fr_0.7fr] sm:items-center sm:gap-4 ${index < businessRows.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}>
                    <Link href={`/clients/${row.client_id}`} className="font-medium text-[var(--text-main)] underline-offset-4 hover:text-[var(--accent)] hover:underline">
                      {row.client_name}
                    </Link>
                    <p className="text-[var(--text-muted)]">{row.subscription_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{row.date ? formatPeriodDate(row.date) : metric === "lost_clients" ? "В текущей CRM не было" : "Без срока"}</p>
                  </div>
                ))}
              </div>
            )
          ) : visitRows.length === 0 ? (
            <EmptyState text="В выбранном периоде посещений этого типа нет" />
          ) : (
            <div className="overflow-x-auto rounded-[8px] border border-[var(--line-soft)]">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[1.6fr_repeat(4,0.55fr)] gap-3 border-b border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-xs font-medium text-[var(--text-muted)]">
                  <span>Клиент</span><span>Группа</span><span>Персон.</span><span>Open Gym</span><span>Всего</span>
                </div>
                {visitRows.map((row, index) => (
                  <div key={row.client_id} className={`grid grid-cols-[1.6fr_repeat(4,0.55fr)] gap-3 px-4 py-4 text-sm ${index < visitRows.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}>
                    <Link href={`/clients/${row.client_id}`} className="font-medium text-[var(--text-main)] underline-offset-4 hover:text-[var(--accent)] hover:underline">
                      {row.client_name}
                    </Link>
                    <span className="text-[var(--text-muted)]">{row.group}</span>
                    <span className="text-[var(--text-muted)]">{row.personal}</span>
                    <span className="text-[var(--text-muted)]">{row.open_gym}</span>
                    <span className="font-semibold text-[var(--text-main)]">{row.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-12 text-center text-sm text-[var(--text-muted)]">
      {text}
    </div>
  );
}

function SectionTitle({ label, title }: { label?: string; title: string }) {
  return (
    <div>
      {label && <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">{label}</p>}
      <h2 className={label ? "mt-2 text-lg font-semibold text-[var(--text-main)]" : "text-lg font-semibold text-[var(--text-main)]"}>{title}</h2>
    </div>
  );
}

function ChecksTable({ checks }: { checks: AnalyticsCheck[] }) {
  if (checks.length === 0) {
    return <EmptyState text="За выбранный период обработанных чеков нет" />;
  }

  return (
    <section className="overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
      <div className="hidden grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr] gap-3 border-b border-[var(--line-soft)] bg-[var(--bg-panel)] px-4 py-3 text-xs font-medium text-[var(--text-muted)] lg:grid">
        <span>Чек и дата</span>
        <span>Клиент и оплата</span>
        <span>Статус</span>
        <span>Выручка</span>
        <span>Прибыль</span>
      </div>
      {checks.map((check, index) => (
        <details key={check.id} className={`group ${index < checks.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}>
          <summary className="grid cursor-pointer list-none gap-3 px-4 py-4 text-sm transition hover:bg-[rgba(255,255,255,0.025)] lg:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr] lg:items-center">
            <div>
              <p className="font-[family:var(--font-mono)] text-xs text-[var(--text-muted)]">#{shortId(check.id)}</p>
              <p className="mt-1 font-medium text-[var(--text-main)]">{formatDate(check.confirmed_at || check.created_at)}</p>
            </div>
            <div>
              <p className="text-[var(--text-main)]">{check.client_name || "Без клиента"}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{paymentLabels[check.payment_type || ""] || "Тип оплаты не указан"}</p>
            </div>
            <p className="text-[var(--text-muted)]">{statusLabels[check.status] || check.status}</p>
            <p className="font-semibold text-[var(--text-main)]">{formatMoney(check.revenue)}</p>
            <div className="flex items-center justify-between gap-3">
              <p className={`font-semibold ${check.profit >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{formatMoney(check.profit)}</p>
              <span aria-hidden="true" className="text-[var(--text-muted)] transition-transform group-open:rotate-180">⌄</span>
            </div>
          </summary>
          <div className="bg-[var(--bg-panel)] px-4 py-3">
            <div className="mb-2 hidden grid-cols-[0.8fr_2fr_0.7fr_0.7fr_0.7fr] gap-2 text-[11px] text-[var(--text-muted)] sm:grid">
              <span>Тип</span><span>Позиция</span><span>Количество</span><span>Выручка</span><span>Прибыль</span>
            </div>
            <div className="grid gap-2">
              {check.items.map((item) => (
                <div key={item.id} className="grid gap-1 border-t border-[var(--line-soft)] pt-2 text-xs text-[var(--text-muted)] first:border-0 first:pt-0 sm:grid-cols-[0.8fr_2fr_0.7fr_0.7fr_0.7fr] sm:gap-2">
                  <span>{kindLabels[item.kind]}</span>
                  <span className="min-w-0 truncate text-[var(--text-main)]">{item.name}</span>
                  <span>{formatNumber(item.active_quantity)} шт.</span>
                  <span>{formatMoney(item.revenue)}</span>
                  <span>{formatMoney(item.profit)}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      ))}
    </section>
  );
}

function SalesLinesTable({ lines, emptyText }: { lines: AnalyticsSaleLine[]; emptyText: string }) {
  if (lines.length === 0) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <section className="overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
      {lines.map((line, index) => (
        <div key={`${line.order_id || "legacy"}-${line.id}`} className={`grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1.5fr_0.6fr_0.8fr_0.8fr_0.8fr_1fr] lg:items-center ${index < lines.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}>
          <div className="min-w-0">
            <p className="truncate font-medium text-[var(--text-main)]">{line.name}</p>
            <p className="mt-1 font-[family:var(--font-mono)] text-xs text-[var(--text-muted)]">{line.sku || "без SKU"} · #{shortId(line.order_id)}</p>
          </div>
          <p className="text-[var(--text-muted)]">{formatNumber(line.active_quantity)} шт.</p>
          <p className="font-medium text-[var(--text-main)]">{formatMoney(line.revenue)}</p>
          <p className="text-[var(--text-muted)]">{formatMoney(line.cost)}</p>
          <p className={line.profit >= 0 ? "font-medium text-[var(--success)]" : "font-medium text-[var(--danger)]"}>{formatMoney(line.profit)}</p>
          <p className="text-xs text-[var(--text-muted)]">{formatDate(line.sold_at)}</p>
        </div>
      ))}
    </section>
  );
}

function Overview({ report }: { report: AnalyticsReport }) {
  const { summary } = report;
  const totalExpenses = summary.purchase_expenses + summary.external_expenses + summary.payroll_expenses;
  const hasFinancialActivity =
    report.checks.length > 0 ||
    report.product_sales.length > 0 ||
    report.service_sales.length > 0 ||
    report.purchases.length > 0 ||
    report.writeoffs.length > 0 ||
    report.external_expenses.length > 0 ||
    report.payroll_expenses.length > 0;

  if (!hasFinancialActivity) {
    return (
      <section className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-12 text-center">
        <h2 className="text-base font-semibold text-[var(--text-main)]">За выбранный период финансовых операций нет</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Выберите другой месяц, чтобы посмотреть финансовый результат.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.62)] p-4 sm:p-5">
        <SectionTitle title="Финансовый результат" />
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
          <StatCard label="Выручка" value={formatMoney(summary.revenue)} hint={`${summary.checks_count} чеков за период`} tone="good" />
          <div className="hidden items-center text-2xl text-[var(--text-muted)] md:flex">−</div>
          <StatCard label="Оплаченные расходы" value={formatMoney(totalExpenses)} hint="Закупки, внешние расходы и выплаченные зарплаты" tone="warn" />
          <div className="hidden items-center text-2xl text-[var(--text-muted)] md:flex">=</div>
          <StatCard label="Чистый результат" value={formatMoney(summary.cash_profit)} hint="Выручка за вычетом оплаченных расходов" tone={summary.cash_profit >= 0 ? "good" : "warn"} />
        </div>
      </section>

      <section className="rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] p-4 sm:p-5">
        <SectionTitle title="Из чего сложился результат" />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Товарка" value={formatMoney(summary.product_revenue)} hint={`${summary.product_items_sold} шт. продано`} />
          <StatCard label="Услуги" value={formatMoney(summary.service_revenue)} hint="Услуги и тренировочные продукты" />
          <StatCard label="Валовая прибыль" value={formatMoney(summary.gross_profit)} hint="Выручка минус себестоимость продаж" tone={summary.gross_profit >= 0 ? "good" : "warn"} />
          <StatCard label="Себестоимость продаж" value={formatMoney(summary.cost_of_sold_goods)} hint="Товарные позиции в чеках" />
          <StatCard label="Закупки склада" value={formatMoney(summary.purchase_expenses)} hint={`${report.purchases.length} приходных операций`} tone="warn" />
          <StatCard label="Списания" value={formatMoney(summary.writeoff_expenses)} hint={`${report.writeoffs.length} складских потерь · не вычитаются повторно`} />
          <StatCard label="Внешние расходы" value={formatMoney(summary.external_expenses)} hint={`${report.external_expenses.length} ручных позиций`} tone="warn" />
          <StatCard label="Зарплаты" value={formatMoney(summary.payroll_expenses)} hint={`${report.payroll_expenses.length} выплат сотрудникам`} tone="warn" />
        </div>
      </section>
    </div>
  );
}

type TrendMetricKey = "active_clients" | "new_clients" | "renewed_clients" | "lapsed_clients" | "lost_clients" | "visits_count";

const trendMetricRows: Array<{ key: TrendMetricKey; label: string; color: string }> = [
  { key: "active_clients", label: "Активные", color: "var(--accent)" },
  { key: "new_clients", label: "Новые", color: "var(--success)" },
  { key: "renewed_clients", label: "Повторные", color: "#7aa2f7" },
  { key: "lapsed_clients", label: "Без продления", color: "#f2a65a" },
  { key: "lost_clients", label: "Потерянные", color: "var(--danger)" },
  { key: "visits_count", label: "Посещения", color: "var(--text-muted)" },
];

function formatTrendLabel(range: { from: string; to: string }) {
  const [, month] = range.from.split("-").map(Number);
  const toDay = Number(range.to.slice(8, 10));
  const monthEnd = new Date(Number(range.from.slice(0, 4)), month, 0).getDate();
  const shortMonth = monthLabels[month - 1].slice(0, 3);

  return toDay < monthEnd ? `${shortMonth} · по ${toDay}` : shortMonth;
}

function TrendTable({ trend }: { trend: AnalyticsReport["business_health"]["trend"] }) {
  if (trend.length === 0) {
    return <EmptyState text="Для динамики пока недостаточно данных" />;
  }

  return (
    <div className="overflow-x-auto rounded-[8px] border border-[var(--line-soft)]">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[150px_repeat(6,minmax(82px,1fr))] border-b border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-xs text-[var(--text-muted)]">
          <span>Показатель</span>
          {trend.map((point) => <span key={point.from} className="text-center">{formatTrendLabel(point)}</span>)}
        </div>
        {trendMetricRows.map((metric, metricIndex) => {
          const maximum = Math.max(...trend.map((point) => point[metric.key]), 1);

          return (
            <div key={metric.key} className={`grid grid-cols-[150px_repeat(6,minmax(82px,1fr))] items-end px-4 py-3 ${metricIndex < trendMetricRows.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}>
              <span className="self-center text-sm font-medium text-[var(--text-main)]">{metric.label}</span>
              {trend.map((point) => {
                const value = point[metric.key];
                const height = Math.max(6, Math.round((value / maximum) * 40));

                return (
                  <div key={point.from} title={formatShortRange(point)} className="flex flex-col items-center justify-end gap-1">
                    <span className="text-xs font-medium text-[var(--text-main)]">{formatNumber(value)}</span>
                    <span className="flex h-10 items-end">
                      <span className="block w-5 rounded-t-[3px]" style={{ height, backgroundColor: metric.color }} />
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type AttentionKind = "expiring" | "inactive" | "lapsed";

function attentionDateLabel(row: AnalyticsAttentionClient, kind: AttentionKind) {
  if (kind === "inactive") {
    return row.last_visit ? `Последний визит ${formatPeriodDate(row.last_visit)}` : "Посещений ещё не было";
  }

  if (!row.date) return "Дата не указана";
  return kind === "expiring" ? `Действует до ${formatPeriodDate(row.date)}` : `Закончился ${formatPeriodDate(row.date)}`;
}

function AttentionRow({ row, kind, snap = false }: { row: AnalyticsAttentionClient; kind: AttentionKind; snap?: boolean }) {
  return (
    <div className={`min-h-[94px] border-t border-[var(--line-soft)] px-4 py-3 first:border-0 ${snap ? "snap-start snap-always" : ""}`}>
      <Link href={`/clients/${row.client_id}`} className="text-sm font-medium text-[var(--text-main)] underline-offset-4 hover:text-[var(--accent)] hover:underline">
        {row.client_name}
      </Link>
      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{row.subscription_name}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{attentionDateLabel(row, kind)}</p>
    </div>
  );
}

function AttentionGroup({
  title,
  hint,
  rows,
  kind,
}: {
  title: string;
  hint: string;
  rows: AnalyticsAttentionClient[];
  kind: AttentionKind;
}) {
  const scrollable = rows.length > 5;

  return (
    <section className="overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.48)]">
      <header className="px-4 py-4">
        <h3 className="text-sm font-semibold text-[var(--text-main)]">{title} · {rows.length}</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
      </header>
      {rows.length === 0 ? (
        <p className="border-t border-[var(--line-soft)] px-4 py-6 text-sm text-[var(--text-muted)]">Клиентов нет</p>
      ) : (
        <div className={scrollable ? "max-h-[470px] overflow-y-auto overscroll-contain scroll-smooth [scroll-snap-type:y_mandatory] [scrollbar-color:var(--line-soft)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]" : ""}>
          {rows.map((row) => <AttentionRow key={row.client_id} row={row} kind={kind} snap={scrollable} />)}
        </div>
      )}
    </section>
  );
}

function AnalyticsOverview({ report }: { report: AnalyticsReport }) {
  const [selectedMetric, setSelectedMetric] = useState<DrilldownMetric | null>(null);
  const { summary } = report;
  const { business_health: health } = report;
  const comparisonLabel = formatShortRange(health.comparison_period);
  const periodEndLabel = formatShortRange({ from: health.period.to, to: health.period.to });

  return (
    <div className="space-y-5">
      <section>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle title="Состояние клуба" />
          <p className="text-xs text-[var(--text-muted)]">Сравнение с {comparisonLabel}</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ComparisonCard label="Активные клиенты" value={health.current.active_clients} previous={health.previous.active_clients} comparisonLabel={comparisonLabel} hint={`На ${periodEndLabel}`} onClick={() => setSelectedMetric("active_clients")} />
          <ComparisonCard label="Новые клиенты" value={health.current.new_clients} previous={health.previous.new_clients} comparisonLabel={comparisonLabel} hint="Первая оплаченная покупка услуги" onClick={() => setSelectedMetric("new_clients")} />
          <ComparisonCard label="Повторные клиенты" value={health.current.renewed_clients} previous={health.previous.renewed_clients} comparisonLabel={comparisonLabel} hint="Уже покупали услуги раньше" onClick={() => setSelectedMetric("renewed_clients")} />
          <ComparisonCard label="Без продления" value={health.current.lapsed_clients} previous={health.previous.lapsed_clients} comparisonLabel={comparisonLabel} hint="Абонемент закончился не более 90 дней назад, нового нет" inverse onClick={() => setSelectedMetric("lapsed_clients")} />
          <ComparisonCard label="Потерянные" value={health.current.lost_clients} previous={health.previous.lost_clients} comparisonLabel={comparisonLabel} hint="Не посещали клуб более 90 дней" inverse onClick={() => setSelectedMetric("lost_clients")} />
          <ComparisonCard label="Посещения" value={health.current.visits_count} previous={health.previous.visits_count} comparisonLabel={comparisonLabel} hint={`${formatNumber(health.current.visitors_count)} посетителей · ${formatNumber(health.current.average_visits)} на клиента`} onClick={() => setSelectedMetric("visits")} />
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <SectionTitle title="Требуют внимания" />
          <p className="text-xs text-[var(--text-muted)]">На {formatPeriodDate(health.attention.as_of)}</p>
        </div>
        <div className="mt-4 grid items-start gap-3 lg:grid-cols-3">
          <AttentionGroup title="Заканчиваются" hint={`В ближайшие ${health.attention.expiry_days} дней`} rows={health.attention.expiring} kind="expiring" />
          <AttentionGroup title="Давно не были" hint={`${health.attention.inactivity_days} дней и больше`} rows={health.attention.inactive} kind="inactive" />
          <AttentionGroup title="Не продлили" hint={`За последние ${health.attention.lapsed_days} дней`} rows={health.attention.lapsed} kind="lapsed" />
        </div>
      </section>

      <section>
        <SectionTitle title="Динамика за 6 месяцев" />
        <p className="mt-1 text-xs text-[var(--text-muted)]">Текущий незавершённый месяц сравнивается по тем же календарным дням</p>
        <div className="mt-4">
          <TrendTable trend={health.trend} />
        </div>
      </section>

      <section>
        <SectionTitle title="Структура посещений" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StatCard label="Групповые" value={formatNumber(summary.group_visits)} hint="Посещения групповых тренировок" onClick={() => setSelectedMetric("group")} />
          <StatCard label="Персональные" value={formatNumber(summary.personal_visits)} hint="Посещения персональных тренировок" onClick={() => setSelectedMetric("personal")} />
          <StatCard label="Open Gym" value={formatNumber(summary.open_gym_visits)} hint="Самостоятельные тренировки" onClick={() => setSelectedMetric("open_gym")} />
        </div>
      </section>

      {selectedMetric && <AnalyticsDrilldown metric={selectedMetric} report={report} onClose={() => setSelectedMetric(null)} />}
    </div>
  );
}
function MonthPeriodPicker({
  month,
  onChange,
  onRefresh,
}: {
  month: string;
  onChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const { year, month: monthNumber } = parseMonthValue(month);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, index) => currentYear - 4 + index);

  function setMonthPart(nextMonth: number) {
    onChange(buildMonthValue(year, nextMonth));
  }

  function setYearPart(nextYear: number) {
    onChange(buildMonthValue(nextYear, monthNumber));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] p-2 backdrop-blur-[3px]">
      <span className="px-2 text-xs font-medium text-[var(--text-muted)]">Период</span>
      <button onClick={() => onChange(shiftMonthValue(month, -1))} className="h-9 w-9 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] text-lg leading-none text-[var(--text-main)] transition hover:border-[var(--accent)]" aria-label="Предыдущий месяц">
        ‹
      </button>
      <label>
        <span className="sr-only">Месяц</span>
        <select value={monthNumber} onChange={(event) => setMonthPart(Number(event.target.value))} className="h-9 min-w-[132px] rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none">
          {monthLabels.map((label, index) => (
            <option key={label} value={index + 1}>{label}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Год</span>
        <select value={year} onChange={(event) => setYearPart(Number(event.target.value))} className="h-9 w-[92px] rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none">
          {years.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <button onClick={() => onChange(shiftMonthValue(month, 1))} className="h-9 w-9 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] text-lg leading-none text-[var(--text-main)] transition hover:border-[var(--accent)]" aria-label="Следующий месяц">
        ›
      </button>
      <span className="mx-1 hidden h-5 w-px bg-[var(--line-soft)] sm:block" />
      <button onClick={() => onChange(currentMonthValue())} className="h-9 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-xs font-medium text-[var(--text-main)] transition hover:border-[var(--accent)]">
        Текущий месяц
      </button>
      <button onClick={onRefresh} className="h-9 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-xs font-medium text-[var(--text-main)] transition hover:border-[var(--accent)]">
        Обновить
      </button>
    </div>
  );
}
function ExternalExpenseForm({
  defaultDate,
  busy,
  onCreate,
}: {
  defaultDate: string;
  busy: boolean;
  onCreate: (data: { title: string; amount: number; expense_date: string; comment?: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(defaultDate);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExpenseDate(defaultDate);
  }, [defaultDate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number.parseFloat(amount.replace(",", "."));
    if (!title.trim()) {
      setError("Укажите статью расхода");
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Укажите сумму больше нуля");
      return;
    }

    await onCreate({
      title: title.trim(),
      amount: parsedAmount,
      expense_date: expenseDate,
      comment: comment.trim() || null,
    });

    setTitle("");
    setAmount("");
    setComment("");
  }

  return (
    <details className="group rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm font-medium text-[var(--text-main)]">
        <span>+ Добавить внешний расход</span>
        <span aria-hidden="true" className="text-[var(--text-muted)] transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <form onSubmit={submit} className="border-t border-[var(--line-soft)] p-4">
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_0.7fr_0.8fr_1.4fr_auto] lg:items-end">
        <label className="grid gap-1 text-xs text-[var(--text-muted)]">
          Статья
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Аренда, реклама, ремонт"
            className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--text-muted)]">
          Сумма
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--text-muted)]">
          Дата
          <input
            value={expenseDate}
            onChange={(event) => setExpenseDate(event.target.value)}
            type="date"
            className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--text-muted)]">
          Комментарий
          <input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Необязательно"
            className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </label>

        <button
          disabled={busy}
          className="h-10 rounded-[8px] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 text-sm font-medium text-[var(--accent)] transition hover:bg-[rgba(94,244,216,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Сохраняю" : "Добавить"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    </form>
    </details>
  );
}

function ExpenseRowDeleteButton({
  expense,
  busy,
  onDelete,
}: {
  expense: AnalyticsExternalExpense;
  busy: boolean;
  onDelete: (expense: AnalyticsExternalExpense) => Promise<void>;
}) {
  return (
    <button
      onClick={() => {
        void onDelete(expense);
      }}
      disabled={busy}
      className="rounded-[8px] border border-[rgba(255,116,57,0.35)] px-3 py-2 text-xs font-medium text-[var(--danger)] transition hover:bg-[rgba(255,116,57,0.1)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      Удалить
    </button>
  );
}

function todayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function PayrollRulesPanel({ rules, trainers, trainingTypes, services, busy, onCreate, onUpdate, onDelete }: {
  rules: PayrollRule[];
  trainers: Trainer[];
  trainingTypes: TrainingType[];
  services: Product[];
  busy: boolean;
  onCreate: (data: Parameters<typeof createPayrollRule>[0]) => Promise<void>;
  onUpdate: (id: number, data: Parameters<typeof createPayrollRule>[0]) => Promise<void>;
  onDelete: (rule: PayrollRule) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [name, setName] = useState("");
  const [allTrainers, setAllTrainers] = useState(true);
  const [trainerIds, setTrainerIds] = useState<number[]>([]);
  const [allActivities, setAllActivities] = useState(false);
  const [trainingTypeIds, setTrainingTypeIds] = useState<number[]>([]);
  const [productIds, setProductIds] = useState<number[]>([]);
  const [calculationType, setCalculationType] = useState<"fixed" | "per_attendee" | "percentage">("fixed");
  const [baseAmount, setBaseAmount] = useState("");
  const [bonusThreshold, setBonusThreshold] = useState("");
  const [bonusPerPerson, setBonusPerPerson] = useState("");
  const [perAttendeeAmount, setPerAttendeeAmount] = useState("");
  const [percentageRate, setPercentageRate] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayDateValue);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: number[], id: number) => list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  const money = (value: string) => Number.parseFloat(value.replace(",", ".")) || 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Укажите название правила");
    if (!allTrainers && trainerIds.length === 0) return setError("Выберите сотрудников");
    if (!allActivities && trainingTypeIds.length === 0 && productIds.length === 0) return setError("Выберите занятия");
    const payload = { name: name.trim(), trainer_ids: trainerIds, all_trainers: allTrainers, training_type_ids: trainingTypeIds, product_ids: productIds, all_activities: allActivities, calculation_type: calculationType, base_amount: calculationType === "fixed" ? money(baseAmount) : 0, per_attendee_amount: calculationType === "per_attendee" ? money(perAttendeeAmount) : 0, percentage_rate: calculationType === "percentage" ? money(percentageRate) : 0, bonus_threshold: calculationType === "fixed" && bonusThreshold ? Number(bonusThreshold) : null, bonus_per_person: calculationType === "fixed" ? money(bonusPerPerson) : 0, tiers: [], effective_from: effectiveFrom, comment: comment.trim() || null };
    if (editingId === null) await onCreate(payload); else await onUpdate(editingId, payload);
    setEditingId(null);
    setEditorOpen(false);
    setName(""); setTrainerIds([]); setTrainingTypeIds([]); setProductIds([]); setBaseAmount(""); setBonusThreshold(""); setBonusPerPerson(""); setPerAttendeeAmount(""); setPercentageRate(""); setComment("");
  }

  function startEdit(rule: PayrollRule) { setEditingId(rule.id); setEditorOpen(true); setName(rule.name); setAllTrainers(rule.all_trainers); setTrainerIds(rule.trainers.map((t)=>Number(t.trainer_id))); setAllActivities(rule.all_activities); setTrainingTypeIds(rule.items.filter((i)=>i.training_type_id!==null).map((i)=>Number(i.training_type_id))); setProductIds(rule.items.filter((i)=>i.product_id!==null).map((i)=>Number(i.product_id))); setCalculationType(rule.calculation_type === "tiered" ? "fixed" : rule.calculation_type); setBaseAmount(String(rule.base_amount || "")); setBonusThreshold(rule.bonus_threshold===null?"":String(rule.bonus_threshold)); setBonusPerPerson(String(rule.bonus_per_person || "")); setPerAttendeeAmount(String(rule.per_attendee_amount || "")); setPercentageRate(String(rule.percentage_rate || "")); setEffectiveFrom(rule.effective_from); setComment(rule.comment || ""); }

  function startCreate() { setEditingId(null); setEditorOpen(true); setName(""); setAllTrainers(true); setTrainerIds([]); setAllActivities(false); setTrainingTypeIds([]); setProductIds([]); setCalculationType("fixed"); setBaseAmount(""); setBonusThreshold(""); setBonusPerPerson(""); setPerAttendeeAmount(""); setPercentageRate(""); setEffectiveFrom(todayDateValue()); setComment(""); setError(null); }

  function ruleFormula(rule: PayrollRule) {
    if (rule.calculation_type === "per_attendee") return `${formatMoney(rule.per_attendee_amount)} за каждого пришедшего`;
    if (rule.calculation_type === "percentage") return `${rule.percentage_rate}% тренеру · ${100 - rule.percentage_rate}% залу`;
    if (rule.calculation_type === "tiered") return rule.tiers.map((tier) => `${tier.from}–${tier.to ?? "∞"}: ${formatMoney(tier.amount)}`).join(" · ");
    return `Ставка ${formatMoney(rule.base_amount)} за занятие${rule.bonus_threshold === null ? "" : ` · свыше ${rule.bonus_threshold}: +${formatMoney(rule.bonus_per_person || 0)}`}`;
  }

  const editor = <form onSubmit={submit} className="rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] p-4 backdrop-blur-[3px]">
      <SectionTitle title={editingId === null ? "Новое правило оплаты" : "Редактирование правила"} />
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_0.7fr_1fr]">
        <label className="grid gap-1 text-xs text-[var(--text-main)]">Название<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, групповые занятия" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)]" /></label>
        <label className="grid gap-1 text-xs text-[var(--text-main)]">Действует с<input value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} type="date" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)]" /></label>
        <label className="grid gap-1 text-xs text-[var(--text-main)]">Комментарий<input value={comment} onChange={(e) => setComment(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)]" /></label>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <fieldset className="rounded-[8px] border border-[var(--line-soft)] p-3"><legend className="px-2 text-sm font-medium text-[var(--text-main)]">Сотрудники</legend>
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={allTrainers} onChange={(e) => setAllTrainers(e.target.checked)} /> Все сотрудники</label>
          {!allTrainers && <div className="grid gap-2 sm:grid-cols-2">{trainers.filter((t) => t.is_active).map((trainer) => { const id=Number(trainer.id); return <label key={trainer.id} className={`flex items-center gap-2 rounded-[8px] border px-3 py-2 text-sm ${trainerIds.includes(id) ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line-soft)]"}`}><input type="checkbox" checked={trainerIds.includes(id)} onChange={() => setTrainerIds((list) => toggle(list,id))} />{trainer.last_name} {trainer.first_name}</label>; })}</div>}
        </fieldset>
        <fieldset className="rounded-[8px] border border-[var(--line-soft)] p-3"><legend className="px-2 text-sm font-medium text-[var(--text-main)]">Занятия</legend>
          <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={allActivities} onChange={(e) => setAllActivities(e.target.checked)} /> Все занятия</label>
          {!allActivities && <div className="grid max-h-56 gap-2 overflow-auto sm:grid-cols-2">{trainingTypes.map((item) => { const id=Number(item.id); return <label key={`t-${id}`} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={trainingTypeIds.includes(id)} onChange={() => setTrainingTypeIds((list) => toggle(list,id))} />{item.name}</label>; })}{services.map((item) => { const id=Number(item.id); return <label key={`p-${id}`} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={productIds.includes(id)} onChange={() => setProductIds((list) => toggle(list,id))} />{item.name}</label>; })}</div>}
        </fieldset>
      </div>

      <div className="mt-5 rounded-[8px] border border-[var(--line-soft)] p-3">
        <div className="max-w-md"><label className="grid gap-1 text-xs text-[var(--text-main)]">Расчёт за проведённое занятие<select value={calculationType} onChange={(e) => setCalculationType(e.target.value as typeof calculationType)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-main)]"><option value="fixed">Ставка за занятие + доплата</option><option value="percentage">Процент от стоимости услуги</option><option value="per_attendee">За каждого пришедшего</option></select></label></div>
        {calculationType === "fixed" && <label className="mt-3 grid max-w-xs gap-1 text-xs text-[var(--text-main)]">Ставка за занятие<input value={baseAmount} onChange={(e)=>setBaseAmount(e.target.value)} inputMode="decimal" placeholder="0" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-main)]" /><span className="text-[11px]">Фиксированная сумма за каждое проведённое занятие</span></label>}
        {calculationType === "fixed" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs text-[var(--text-main)]">Доплата после, чел.<input value={bonusThreshold} onChange={(e)=>setBonusThreshold(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-main)]" /></label><label className="grid gap-1 text-xs text-[var(--text-main)]">Доплата за человека<input value={bonusPerPerson} onChange={(e)=>setBonusPerPerson(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-main)]" /></label></div>}
        {calculationType === "per_attendee" && <label className="mt-3 grid max-w-xs gap-1 text-xs text-[var(--text-main)]">Сумма за пришедшего<input value={perAttendeeAmount} onChange={(e)=>setPerAttendeeAmount(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-main)]" /></label>}
        {calculationType === "percentage" && <label className="mt-3 grid max-w-xs gap-1 text-xs text-[var(--text-main)]">Процент тренеру<input value={percentageRate} onChange={(e)=>setPercentageRate(e.target.value)} inputMode="decimal" placeholder="50" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-main)]" /><span className="text-[11px]">Остаток автоматически остаётся залу</span></label>}
      </div>
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      <div className="mt-4 flex gap-3"><button disabled={busy} className="h-10 rounded-[8px] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 text-sm font-medium text-[var(--accent)] disabled:opacity-60">{busy ? "Сохраняю..." : editingId === null ? "Сохранить правило" : "Сохранить изменения"}</button><button type="button" onClick={() => { setEditorOpen(false); setEditingId(null); }} className="h-10 rounded-[8px] border border-[var(--line-soft)] px-4 text-sm text-[var(--text-main)]">Отмена</button></div>
    </form>

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <SectionTitle title="Правила оплаты" />
      <button type="button" onClick={startCreate} className="h-10 rounded-[8px] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 text-sm font-medium text-[var(--accent)]">+ Создать новое правило</button>
    </div>
    {editingId === null && editorOpen && editor}
    <section className="space-y-3">
      {rules.length === 0 ? <EmptyState text="Правил оплаты пока нет" /> : rules.map((rule) => <div key={rule.id} className="space-y-3">
        <article className="rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] p-4 backdrop-blur-[3px]"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[var(--text-main)]">{rule.name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{rule.all_trainers ? "Все сотрудники" : rule.trainers.map((t)=>t.trainer_name).join(", ")} · {rule.all_activities ? "Все занятия" : rule.items.map((i)=>i.training_type_name||i.product_name).filter(Boolean).join(", ")}</p></div><div className="flex gap-3"><button type="button" onClick={()=>startEdit(rule)} className="text-xs text-[var(--accent)]">Редактировать</button><button type="button" onClick={()=>void onDelete(rule)} className="text-xs text-[var(--danger)]">Удалить</button></div></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-[1.8fr_0.7fr]"><span>{ruleFormula(rule)}</span><span>с {formatPeriodDate(rule.effective_from)}</span></div>{rule.comment && <p className="mt-2 text-xs text-[var(--text-muted)]">{rule.comment}</p>}</article>
        {editingId === rule.id && editorOpen && editor}
      </div>)}
    </section>  </div>;
}
function PayrollCalculation({ report }: { report: PayrollReport }) {
  const [expandedTrainerId, setExpandedTrainerId] = useState<number | null>(null);

  if (report.trainers.length === 0) {
    return <EmptyState text="За выбранный период занятий с тренерами нет" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="К выплате" value={formatMoney(report.summary.total_amount)} hint={formatCount(report.summary.trainers_count, "тренер", "тренера", "тренеров")} tone="good" />
        <StatCard label="Занятия" value={formatNumber(report.summary.slots_count)} hint={`${formatCount(report.summary.attended_count, "посещение", "посещения", "посещений")} отмечено`} />
        <StatCard label="База" value={formatMoney(report.summary.base_amount)} hint="сумма базовых ставок" />
        <StatCard label="Доплаты" value={formatMoney(report.summary.bonus_amount)} hint={`${report.summary.warnings_count} предупреждений`} tone={report.summary.warnings_count > 0 ? "warn" : "neutral"} />
      </div>

      <section className="overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
        {report.trainers.map((trainer) => {
          const expanded = expandedTrainerId === Number(trainer.trainer_id);

          return (
            <div key={trainer.trainer_id} className="border-b border-[var(--line-soft)] last:border-b-0">
              <button
                onClick={() => setExpandedTrainerId(expanded ? null : Number(trainer.trainer_id))}
                className="grid w-full gap-3 px-4 py-4 text-left text-sm lg:grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr_0.8fr] lg:items-center"
              >
                <div>
                  <p className="font-semibold text-[var(--text-main)]">{trainer.trainer_name}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{formatCount(trainer.slots_count, "занятие", "занятия", "занятий")} · {formatCount(trainer.attended_count, "посещение", "посещения", "посещений")}</p>
                </div>
                <p className="text-[var(--text-muted)]">База {formatMoney(trainer.base_amount)}</p>
                <p className="text-[var(--text-muted)]">Доплаты {formatMoney(trainer.bonus_amount)}</p>
                <p className={trainer.warnings_count > 0 ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}>{trainer.warnings_count} предупреждений</p>
                <p className="text-right text-base font-semibold text-[var(--text-main)]">{formatMoney(trainer.total_amount)}</p>
              </button>

              {expanded && <PayrollTrainerDetails trainer={trainer} />}
            </div>
          );
        })}
      </section>
    </div>
  );
}

function PayrollTrainerDetails({ trainer }: { trainer: PayrollTrainerSummary }) {
  return (
    <div className="bg-[var(--bg-panel)] px-4 py-3">
      <div className="grid gap-2">
        {trainer.lines.map((line) => (
          <div key={line.slot_id} className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
            <div className="grid gap-2 text-sm lg:grid-cols-[1fr_1.4fr_0.7fr_0.8fr_0.8fr_0.8fr] lg:items-center">
              <p className="text-[var(--text-muted)]">{formatPeriodDate(line.date)} {line.start_time.slice(0, 5)}</p>
              <p className="min-w-0 truncate font-medium text-[var(--text-main)]">{line.training_type_name}</p>
              <p className="text-[var(--text-muted)]">пришло {line.attended_count}</p>
              <p className="text-[var(--text-muted)]">база {formatMoney(line.base_amount)}</p>
              <p className="text-[var(--text-muted)]">
                {line.bonus_threshold === null
                  ? "Доплата не предусмотрена"
                  : line.attended_count <= line.bonus_threshold
                    ? `Доплата после ${line.bonus_threshold} человек — порог не достигнут`
                    : `(${line.attended_count} − ${line.bonus_threshold}) × ${formatMoney(line.bonus_per_person)} = ${formatMoney(line.bonus_amount)}`}
              </p>
              <p className="text-right font-semibold text-[var(--text-main)]">{formatMoney(line.total_amount)}</p>
            </div>
            {line.warnings.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {line.warnings.map((warning) => (
                  <span key={warning} className="rounded-[8px] border border-[rgba(245,197,66,0.25)] bg-[rgba(245,197,66,0.08)] px-2 py-1 text-xs text-[var(--warning)]">
                    {warning}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PayrollRunsPanel() {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [from, setFrom] = useState(() => getMonthRange(currentMonthValue()).from);
  const [to, setTo] = useState(() => todayDateValue());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRuns() {
    setLoading(true);
    setError(null);

    try {
      setRuns(await fetchPayrollRuns());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить ведомости");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRuns();
  }, []);

  async function createRun() {
    setBusy(true);
    setError(null);

    try {
      await createPayrollRun({ from, to });
      await loadRuns();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось сформировать ведомость");
    } finally {
      setBusy(false);
    }
  }

  async function approveRun(id: number) {
    setBusy(true);
    setError(null);

    try {
      await approvePayrollRun(id);
      await loadRuns();
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Не удалось утвердить ведомость");
    } finally {
      setBusy(false);
    }
  }

  async function revokeApproval(id: number) {
    if (!window.confirm("Отменить утверждение ведомости? Она снова станет черновиком.")) return;

    setBusy(true);
    setError(null);

    try {
      await revokePayrollRunApproval(id);
      await loadRuns();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Не удалось отменить утверждение");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRun(id: number) {
    if (!window.confirm("Удалить черновик ведомости? Его можно будет сформировать заново.")) return;

    setBusy(true);
    setError(null);

    try {
      await deletePayrollRun(id);
      await loadRuns();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить черновик");
    } finally {
      setBusy(false);
    }
  }

  async function payEmployee(runId: number, employeeId: number) {
    setBusy(true);
    setError(null);

    try {
      await payPayrollRunEmployee(runId, employeeId, todayDateValue());
      await loadRuns();
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "Не удалось отметить выплату");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] p-4 backdrop-blur-[3px]">
        <SectionTitle title="Сформировать расчётную ведомость" />
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          После формирования суммы сохраняются снимком и больше не зависят от изменений правил.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            С
            <input value={from} onChange={(event) => setFrom(event.target.value)} type="date" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none" />
          </label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            По
            <input value={to} onChange={(event) => setTo(event.target.value)} type="date" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none" />
          </label>
          <button onClick={() => void createRun()} disabled={busy} className="h-10 rounded-[8px] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 text-sm font-medium text-[var(--accent)] disabled:opacity-60">
            {busy ? "Формирую..." : "Сформировать ведомость"}
          </button>
        </div>
      </section>

      {error && <div className="rounded-[8px] border border-[rgba(255,116,57,0.35)] bg-[rgba(255,116,57,0.1)] px-4 py-3 text-sm text-[var(--danger)]">{error}</div>}

      {loading ? (
        <EmptyState text="Загрузка ведомостей..." />
      ) : runs.length === 0 ? (
        <EmptyState text="Расчётных ведомостей пока нет" />
      ) : (
        runs.map((run) => (
          <details key={run.id} className="group overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] backdrop-blur-[3px]">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4 group-open:border-b group-open:border-[var(--line-soft)]">
              <div>
                <p className="text-sm font-semibold text-[var(--text-main)]">
                  Ведомость #{run.id} · {formatPeriodDate(run.date_from)} — {formatPeriodDate(run.date_to)} <span aria-hidden="true" className="ml-1 inline-block text-[var(--text-muted)] transition-transform group-open:rotate-180">⌄</span>
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {run.employees_count} сотрудников · выплачено {run.paid_count} · всего {formatMoney(run.total_amount)}
                </p>
              </div>
              {run.status === "draft" ? (
                <div className="flex items-center gap-2">
                  <button onClick={(event) => { event.preventDefault(); event.stopPropagation(); void deleteRun(run.id); }} disabled={busy} className="rounded-[8px] border border-[var(--line-soft)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] disabled:opacity-60">
                    Удалить черновик
                  </button>
                  <button onClick={(event) => { event.preventDefault(); event.stopPropagation(); void approveRun(run.id); }} disabled={busy} className="rounded-[8px] border border-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent)] disabled:opacity-60">
                    Утвердить
                  </button>
                </div>
              ) : run.paid_count === 0 ? (
                <button onClick={(event) => { event.preventDefault(); event.stopPropagation(); void revokeApproval(run.id); }} disabled={busy} className="rounded-[8px] border border-[var(--line-soft)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] disabled:opacity-60">
                  Отменить утверждение
                </button>
              ) : (
                <span className="text-xs font-medium text-[var(--success)]">Утверждена</span>
              )}
            </summary>

            <div>
              {run.employees.map((employee, index) => (
              <details key={employee.id} className={index < run.employees.length - 1 ? "border-b border-[var(--line-soft)]" : ""}>
                <summary className="grid cursor-pointer list-none gap-3 px-4 py-4 sm:grid-cols-[1.4fr_0.8fr_0.8fr_auto] sm:items-center">
                  <div>
                    <p className="font-medium text-[var(--text-main)]">{employee.trainer_name}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{formatCount(employee.slots_count, "занятие", "занятия", "занятий")} · {formatCount(employee.attended_count, "посещение", "посещения", "посещений")}</p>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">База {formatMoney(employee.base_amount)} · доплаты {formatMoney(employee.bonus_amount)}</p>
                  <p className="text-base font-semibold text-[var(--text-main)]">{formatMoney(employee.total_amount)}</p>
                  {employee.payment_status === "paid" ? (
                    <span className="text-xs font-medium text-[var(--success)]">Выплачено {employee.paid_date ? formatPeriodDate(employee.paid_date) : ""}</span>
                  ) : run.status === "approved" ? (
                    <button onClick={(event) => { event.preventDefault(); void payEmployee(run.id, employee.id); }} disabled={busy} className="rounded-[8px] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-medium text-[var(--accent)] disabled:opacity-60">
                      Отметить выплату
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">Ожидает утверждения</span>
                  )}
                </summary>
                <div className="space-y-2 bg-[rgba(17,21,32,0.62)] px-4 py-3">
                  {employee.calculation_snapshot.lines.map((line) => (
                    <div key={line.slot_id} className="grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-[0.8fr_1.4fr_0.5fr_0.7fr]">
                      <span>{formatPeriodDate(line.date)} · {String(line.start_time).slice(0, 5)}</span>
                      <span className="text-[var(--text-main)]">{line.training_type_name}</span>
                      <span>пришло {line.attended_count}</span>
                      <span className="font-medium text-[var(--text-main)]">{formatMoney(line.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            </div>
          </details>
        ))
      )}
    </div>
  );
}
function PayrollTab() {
  const initialRange = getMonthRange(currentMonthValue());
  const [mode, setMode] = useState<"runs" | "calculation" | "rules">("runs");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [rules, setRules] = useState<PayrollRule[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [trainingTypes, setTrainingTypes] = useState<TrainingType[]>([]);
  const [services, setServices] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [rulesBusy, setRulesBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const [nextReport, nextRules, nextTrainers, nextTrainingTypes, nextServices] = await Promise.all([
          fetchPayrollReport({ from, to }),
          fetchPayrollRules(),
          fetchTrainers(),
          fetchTrainingTypes({ include_inactive: true }),
          fetchProducts({ type: "service", includeArchived: true }),
        ]);

        if (!cancelled) {
          setReport(nextReport);
          setRules(nextRules);
          setTrainers(nextTrainers);
          setTrainingTypes(nextTrainingTypes);
          setServices(nextServices);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить зарплаты");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [from, to, reloadToken]);

  async function handleCreateRule(data: Parameters<typeof createPayrollRule>[0]) {
    setRulesBusy(true);
    setError(null);

    try {
      await createPayrollRule(data);
      setReloadToken((value) => value + 1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось сохранить правило");
      throw createError;
    } finally {
      setRulesBusy(false);
    }
  }

  async function handleUpdateRule(id: number, data: Parameters<typeof createPayrollRule>[0]) {
    setRulesBusy(true); setError(null);
    try { await updatePayrollRule(id, data); setReloadToken((value) => value + 1); }
    catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Не удалось обновить правило"); throw updateError; }
    finally { setRulesBusy(false); }
  }
  async function handleDeleteRule(rule: PayrollRule) {
    if (!window.confirm("Удалить правило оплаты? Прошлые расчёты по этому правилу перестанут находить ставку.")) {
      return;
    }

    setError(null);
    try {
      await deletePayrollRule(rule.id);
      setReloadToken((value) => value + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить правило");
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <SectionTitle title="Зарплаты" />
          </div>
          {mode !== "runs" && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">
              С
              <input value={from} onChange={(event) => setFrom(event.target.value)} type="date" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none" />
            </label>
            <label className="grid gap-1 text-xs text-[var(--text-muted)]">
              По
              <input value={to} onChange={(event) => setTo(event.target.value)} type="date" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none" />
            </label>
            <button onClick={() => setReloadToken((value) => value + 1)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-4 text-sm font-medium text-[var(--text-main)] transition hover:border-[var(--accent)]">
              Рассчитать
            </button>
          </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["runs", "Ведомости"],
            ["calculation", "Предварительный расчёт"],
            ["rules", "Правила оплаты"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id as "runs" | "calculation" | "rules")}
              className={`rounded-[8px] border px-3 py-2 text-sm font-medium transition ${
                mode === id
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--line-soft)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {mode !== "runs" && error && (
        <div className="rounded-[8px] border border-[rgba(255,116,57,0.35)] bg-[rgba(255,116,57,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {mode === "runs" ? (
        <PayrollRunsPanel />
      ) : loading ? (
        <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          Загрузка зарплат...
        </div>
      ) : mode === "rules" ? (
        <PayrollRulesPanel
          rules={rules}
          trainers={trainers}
          trainingTypes={trainingTypes}
          services={services}
          busy={rulesBusy}
          onCreate={handleCreateRule}
          onUpdate={handleUpdateRule}
          onDelete={handleDeleteRule}
        />
      ) : report ? (
        <PayrollCalculation report={report} />
      ) : null}
    </div>
  );
}

export function AnalyticsWorkspace({ section }: { section: AnalyticsSection }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState(currentMonthValue);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null);
  const range = useMemo(() => getMonthRange(month), [month]);
  const tabs = section === "finance" ? financeTabs : analyticsTabs;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchAnalyticsReport(range);
        if (!cancelled) {
          setReport(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить аналитику");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [range, reloadToken]);

  const expenseRows = useMemo(() => {
    if (!report) return [];

    return [
      ...report.purchases.map((item) => ({
        id: `purchase-${item.id}`,
        source: "purchase" as const,
        type: "Приёмка",
        name: item.product_name,
        detail: `${item.product_sku || "без SKU"} · ${formatNumber(item.quantity)} шт.`,
        amount: item.total_cost,
        date: item.created_at,
        external: null,
      })),
      ...report.writeoffs.map((item) => ({
        id: `writeoff-${item.id}`,
        source: "writeoff" as const,
        type: "Списание",
        name: item.product_name,
        detail: `${writeoffLabels[item.reason_type] || item.reason_type} · ${formatNumber(item.quantity)} шт.`,
        amount: item.total_cost,
        date: item.created_at,
        external: null,
      })),
      ...report.payroll_expenses.map((item) => ({
        id: "payroll-" + item.id,
        source: "payroll" as const,
        type: "Зарплата",
        name: item.trainer_name,
        detail: "Ведомость #" + item.run_id + " · " + formatPeriodDate(item.date_from) + "—" + formatPeriodDate(item.date_to),
        amount: item.amount,
        date: item.expense_date,
        external: null,
      })),      ...report.external_expenses.map((item) => ({
        id: `external-${item.id}`,
        source: "external" as const,
        type: "Внешний расход",
        name: item.title,
        detail: item.comment || "ручной расход",
        amount: item.amount,
        date: item.expense_date,
        external: item,
      })),
    ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [report]);

  async function handleCreateExpense(data: { title: string; amount: number; expense_date: string; comment?: string | null }) {
    setExpenseBusy(true);
    setError(null);

    try {
      await createAnalyticsExpense(data);
      setReloadToken((value) => value + 1);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось добавить расход");
      throw createError;
    } finally {
      setExpenseBusy(false);
    }
  }

  async function handleDeleteExpense(expense: AnalyticsExternalExpense) {
    if (!window.confirm(`Удалить внешний расход "${expense.title}" на ${formatMoney(expense.amount)}?`)) {
      return;
    }

    setDeletingExpenseId(expense.id);
    setError(null);

    try {
      await deleteAnalyticsExpense(expense.id);
      setReloadToken((value) => value + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить расход");
    } finally {
      setDeletingExpenseId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">
            {section === "finance" ? "Финансы" : "Аналитика"}
          </h1>
        </div>

        {tab !== "payroll" && (
          <MonthPeriodPicker month={month} onChange={setMonth} onRefresh={() => setReloadToken((value) => value + 1)} />
        )}
      </div>

      <section className="border-b border-[var(--line-soft)]">
        <div className="flex flex-wrap gap-6">
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

      {tab !== "payroll" && error && (
        <div className="rounded-[8px] border border-[rgba(255,116,57,0.35)] bg-[rgba(255,116,57,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {tab !== "payroll" && loading && (
        <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          Загрузка аналитики...
        </div>
      )}

      {tab === "payroll" && <PayrollTab />}

      {tab !== "payroll" && !loading && report && (
        <>
          {tab === "overview" && (section === "finance" ? <Overview report={report} /> : <AnalyticsOverview report={report} />)}
          {tab === "checks" && <ChecksTable checks={report.checks} />}
          {tab === "products" && <SalesLinesTable lines={report.product_sales} emptyText="Товарных продаж за выбранный период нет" />}
          {tab === "services" && (
            <SalesLinesTable lines={report.service_sales} emptyText="Услуг за выбранный период нет" />
          )}
          {tab === "expenses" && (
            <div className="space-y-4">
              <ExternalExpenseForm defaultDate={range.from} busy={expenseBusy} onCreate={handleCreateExpense} />

              {expenseRows.length === 0 ? (
                <EmptyState text="Расходов за выбранный период нет" />
              ) : (
                <section className="overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
                  <div className="hidden grid-cols-[0.8fr_1.4fr_1fr_0.8fr_1fr_auto] gap-3 border-b border-[var(--line-soft)] bg-[var(--bg-panel)] px-4 py-3 text-xs font-medium text-[var(--text-muted)] lg:grid">
                    <span>Тип</span><span>Наименование</span><span>Детали</span><span>Сумма</span><span>Дата</span><span />
                  </div>
                  {expenseRows.map((row, index) => (
                    <div key={row.id} className={`grid gap-3 px-4 py-4 text-sm lg:grid-cols-[0.8fr_1.4fr_1fr_0.8fr_1fr_auto] lg:items-center ${index < expenseRows.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}>
                      <p className={row.type === "Приёмка" ? "font-medium text-[var(--warning)]" : "font-medium text-[var(--danger)]"}>{row.type}</p>
                      <div className="min-w-0"><p className="truncate font-medium text-[var(--text-main)]">{row.name}</p>{row.amount === 0 && <p className="mt-1 text-xs text-[var(--warning)]">Не указана стоимость</p>}</div>
                      <p className="text-xs text-[var(--text-muted)]">{row.detail}</p>
                      <p className="font-semibold text-[var(--text-main)]">{formatMoney(row.amount)}</p>
                      <p className="text-xs text-[var(--text-muted)]">{formatDate(row.date)}</p>
                      {row.external ? (
                        <ExpenseRowDeleteButton
                          expense={row.external}
                          busy={deletingExpenseId === row.external.id}
                          onDelete={handleDeleteExpense}
                        />
                      ) : (
                        <span />
                      )}
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return <AnalyticsWorkspace section="analytics" />;
}
