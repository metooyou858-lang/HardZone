"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createAnalyticsExpense,
  createPayrollRule,
  deleteAnalyticsExpense,
  deletePayrollRule,
  fetchAnalyticsReport,
  fetchPayrollReport,
  fetchPayrollRules,
  type AnalyticsCheck,
  type AnalyticsExternalExpense,
  type AnalyticsReport,
  type AnalyticsSaleLine,
  type PayrollReport,
  type PayrollRule,
  type PayrollTrainerSummary,
} from "@/lib/api/analytics";
import { fetchProducts, type Product } from "@/lib/api/products";
import { fetchTrainingTypes, type TrainingType } from "@/lib/api/training-types";

type Tab = "overview" | "checks" | "products" | "services" | "expenses" | "visits" | "payroll";
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
  { id: "visits", label: "Посещения" },
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

function StatCard({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint: string; tone?: "neutral" | "good" | "warn" }) {
  const toneClass =
    tone === "good"
      ? "border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.08)]"
      : tone === "warn"
        ? "border-[rgba(255,116,57,0.25)] bg-[rgba(255,116,57,0.08)]"
        : "border-[var(--line-soft)] bg-[rgba(22,27,39,0.68)]";

  return (
    <article className={`rounded-[8px] border p-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{hint}</p>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-12 text-center text-sm text-[var(--text-muted)]">
      {text}
    </div>
  );
}

function SectionTitle({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <p className="font-[family:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--text-muted)]">{label}</p>
      <h2 className="mt-2 text-lg font-semibold text-[var(--text-main)]">{title}</h2>
    </div>
  );
}

function ChecksTable({ checks }: { checks: AnalyticsCheck[] }) {
  if (checks.length === 0) {
    return <EmptyState text="За выбранный период обработанных чеков нет" />;
  }

  return (
    <section className="overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
      {checks.map((check, index) => (
        <div key={check.id} className={index < checks.length - 1 ? "border-b border-[var(--line-soft)]" : ""}>
          <div className="grid gap-3 px-4 py-4 lg:grid-cols-[1.1fr_1fr_0.8fr_0.8fr_0.8fr] lg:items-center">
            <div>
              <p className="font-[family:var(--font-mono)] text-xs text-[var(--text-muted)]">#{shortId(check.id)}</p>
              <p className="mt-1 text-sm font-medium text-[var(--text-main)]">{formatDate(check.confirmed_at || check.created_at)}</p>
            </div>
            <div>
              <p className="text-sm text-[var(--text-main)]">{check.client_name || "Без клиента"}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{paymentLabels[check.payment_type || ""] || "Тип оплаты не указан"}</p>
            </div>
            <p className="text-sm text-[var(--text-muted)]">{statusLabels[check.status] || check.status}</p>
            <p className="text-sm font-semibold text-[var(--text-main)]">{formatMoney(check.revenue)}</p>
            <p className={`text-sm font-semibold ${check.profit >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{formatMoney(check.profit)}</p>
          </div>
          <div className="bg-[var(--bg-panel)] px-4 py-3">
            <div className="grid gap-2">
              {check.items.map((item) => (
                <div key={item.id} className="grid gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-[0.8fr_2fr_0.7fr_0.7fr_0.7fr]">
                  <span>{kindLabels[item.kind]}</span>
                  <span className="min-w-0 truncate text-[var(--text-main)]">{item.name}</span>
                  <span>{formatNumber(item.active_quantity)} шт.</span>
                  <span>{formatMoney(item.revenue)}</span>
                  <span>{formatMoney(item.profit)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
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

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Выручка" value={formatMoney(summary.revenue)} hint={`${summary.checks_count} чеков за период`} tone="good" />
        <StatCard label="Валовая прибыль" value={formatMoney(summary.gross_profit)} hint="Выручка минус себестоимость проданного" tone={summary.gross_profit >= 0 ? "good" : "warn"} />
        <StatCard label="Денежный итог" value={formatMoney(summary.cash_profit)} hint="Выручка минус закупки и списания" tone={summary.cash_profit >= 0 ? "good" : "warn"} />
      </div>

      <section className="rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] p-5 backdrop-blur-[3px]">
        <SectionTitle label="finance split" title="Разбор выручки и расходов" />
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <StatCard label="Товарка" value={formatMoney(summary.product_revenue)} hint={`${summary.product_items_sold} шт. продано`} />
          <StatCard label="Услуги" value={formatMoney(summary.service_revenue)} hint="Услуги и тренировочные продукты" />
          <StatCard label="Закупки склада" value={formatMoney(summary.purchase_expenses)} hint={`${report.purchases.length} приходных операций`} tone="warn" />
          <StatCard label="Списания" value={formatMoney(summary.writeoff_expenses)} hint={`${report.writeoffs.length} складских списаний по себестоимости`} tone="warn" />
          <StatCard label="Внешние расходы" value={formatMoney(summary.external_expenses)} hint={`${report.external_expenses.length} ручных позиций`} tone="warn" />
          <StatCard label="Себестоимость продаж" value={formatMoney(summary.cost_of_sold_goods)} hint="Себестоимость товарных позиций в чеках" />
        </div>
      </section>
    </div>
  );
}

function AnalyticsOverview({ report }: { report: AnalyticsReport }) {
  const { summary } = report;
  const uniqueClients = new Set(report.visits.map((visit) => visit.client_name)).size;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Посещения" value={formatNumber(summary.visits_count)} hint="Всего посещений за период" />
        <StatCard label="Групповые" value={formatNumber(summary.group_visits)} hint="Посещения групповых тренировок" />
        <StatCard label="Open Gym" value={formatNumber(summary.open_gym_visits)} hint="Самостоятельные тренировки" />
        <StatCard label="Клиенты" value={formatNumber(uniqueClients)} hint="Уникальные посетители за период" />
      </div>
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
    <form onSubmit={submit} className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
      <SectionTitle label="manual expense" title="Добавить внешний расход" />
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

function PayrollRulesPanel({
  rules,
  trainingTypes,
  services,
  busy,
  onCreate,
  onDelete,
}: {
  rules: PayrollRule[];
  trainingTypes: TrainingType[];
  services: Product[];
  busy: boolean;
  onCreate: (data: {
    training_type_ids: number[];
    product_ids: number[];
    base_amount: number;
    bonus_threshold?: number | null;
    bonus_per_person?: number | null;
    effective_from: string;
    comment?: string | null;
  }) => Promise<void>;
  onDelete: (rule: PayrollRule) => Promise<void>;
}) {
  const [selectedTrainingTypes, setSelectedTrainingTypes] = useState<number[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [baseAmount, setBaseAmount] = useState("");
  const [bonusThreshold, setBonusThreshold] = useState("");
  const [bonusPerPerson, setBonusPerPerson] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayDateValue);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  function toggleId(list: number[], id: number) {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedBase = Number.parseFloat(baseAmount.replace(",", "."));
    const parsedBonusThreshold = bonusThreshold.trim() ? Number.parseInt(bonusThreshold, 10) : null;
    const parsedBonus = bonusPerPerson.trim() ? Number.parseFloat(bonusPerPerson.replace(",", ".")) : null;

    if (selectedTrainingTypes.length === 0 && selectedProducts.length === 0) {
      setError("Выберите хотя бы одно занятие или услугу");
      return;
    }

    if (!Number.isFinite(parsedBase) || parsedBase < 0) {
      setError("Укажите базовую сумму");
      return;
    }

    if (parsedBonusThreshold !== null && (!Number.isInteger(parsedBonusThreshold) || parsedBonusThreshold < 0)) {
      setError("Порог доплаты должен быть целым числом");
      return;
    }

    if (parsedBonus !== null && (!Number.isFinite(parsedBonus) || parsedBonus < 0)) {
      setError("Укажите корректную доплату");
      return;
    }

    await onCreate({
      training_type_ids: selectedTrainingTypes,
      product_ids: selectedProducts,
      base_amount: parsedBase,
      bonus_threshold: parsedBonusThreshold,
      bonus_per_person: parsedBonus,
      effective_from: effectiveFrom,
      comment: comment.trim() || null,
    });

    setSelectedTrainingTypes([]);
    setSelectedProducts([]);
    setBaseAmount("");
    setBonusThreshold("");
    setBonusPerPerson("");
    setComment("");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
        <SectionTitle label="payroll rules" title="Правило оплаты занятий" />

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Типы тренировок</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {trainingTypes.map((item) => {
                const id = Number(item.id);
                const checked = selectedTrainingTypes.includes(id);

                return (
                  <label key={item.id} className={`flex items-center gap-2 rounded-[8px] border px-3 py-2 text-sm ${checked ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line-soft)] text-[var(--text-main)]"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelectedTrainingTypes((list) => toggleId(list, id))}
                    />
                    <span className="min-w-0 truncate">{item.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">Услуги</p>
            <div className="grid max-h-[220px] gap-2 overflow-auto pr-1">
              {services.map((item) => {
                const id = Number(item.id);
                const checked = selectedProducts.includes(id);

                return (
                  <label key={item.id} className={`flex items-center gap-2 rounded-[8px] border px-3 py-2 text-sm ${checked ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line-soft)] text-[var(--text-main)]"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelectedProducts((list) => toggleId(list, id))}
                    />
                    <span className="min-w-0 truncate">{item.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_0.8fr_0.8fr_0.9fr_1.3fr_auto] lg:items-end">
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            База
            <input value={baseAmount} onChange={(event) => setBaseAmount(event.target.value)} inputMode="decimal" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none" />
          </label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            Порог
            <input value={bonusThreshold} onChange={(event) => setBonusThreshold(event.target.value)} inputMode="numeric" placeholder="10" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]" />
          </label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            Доплата
            <input value={bonusPerPerson} onChange={(event) => setBonusPerPerson(event.target.value)} inputMode="decimal" placeholder="50" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)]" />
          </label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            Действует с
            <input value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} type="date" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none" />
          </label>
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            Комментарий
            <input value={comment} onChange={(event) => setComment(event.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none" />
          </label>
          <button disabled={busy} className="h-10 rounded-[8px] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 text-sm font-medium text-[var(--accent)] transition hover:bg-[rgba(94,244,216,0.18)] disabled:opacity-60">
            {busy ? "Сохраняю" : "Сохранить"}
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      </form>

      <section className="overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
        {rules.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-[var(--text-muted)]">Правил оплаты пока нет</div>
        ) : (
          rules.map((rule, index) => (
            <div key={rule.id} className={`grid gap-3 px-4 py-4 text-sm lg:grid-cols-[1.4fr_0.7fr_0.9fr_0.8fr_auto] lg:items-center ${index < rules.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}>
              <div className="min-w-0">
                <p className="font-medium text-[var(--text-main)]">{rule.items.map((item) => item.training_type_name || item.product_name).filter(Boolean).join(", ")}</p>
                {rule.comment && <p className="mt-1 text-xs text-[var(--text-muted)]">{rule.comment}</p>}
              </div>
              <p className="font-medium text-[var(--text-main)]">{formatMoney(rule.base_amount)}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {rule.bonus_threshold === null ? "без доплаты" : `свыше ${rule.bonus_threshold}: +${formatMoney(rule.bonus_per_person || 0)}`}
              </p>
              <p className="text-xs text-[var(--text-muted)]">с {formatPeriodDate(rule.effective_from)}</p>
              <button onClick={() => void onDelete(rule)} className="rounded-[8px] border border-[rgba(255,116,57,0.35)] px-3 py-2 text-xs font-medium text-[var(--danger)] transition hover:bg-[rgba(255,116,57,0.1)]">
                Удалить
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function PayrollCalculation({ report }: { report: PayrollReport }) {
  const [expandedTrainerId, setExpandedTrainerId] = useState<number | null>(null);

  if (report.trainers.length === 0) {
    return <EmptyState text="За выбранный период занятий с тренерами нет" />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="К выплате" value={formatMoney(report.summary.total_amount)} hint={`${report.summary.trainers_count} тренеров`} tone="good" />
        <StatCard label="Занятия" value={formatNumber(report.summary.slots_count)} hint={`${report.summary.attended_count} посещений отмечено`} />
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
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{trainer.slots_count} занятий · {trainer.attended_count} посещений</p>
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
                  ? "доплаты нет"
                  : `(${line.attended_count} - ${line.bonus_threshold}) x ${formatMoney(line.bonus_per_person)} = ${formatMoney(line.bonus_amount)}`}
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

function PayrollTab() {
  const initialRange = getMonthRange(currentMonthValue());
  const [mode, setMode] = useState<"calculation" | "rules">("calculation");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [rules, setRules] = useState<PayrollRule[]>([]);
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
        const [nextReport, nextRules, nextTrainingTypes, nextServices] = await Promise.all([
          fetchPayrollReport({ from, to }),
          fetchPayrollRules(),
          fetchTrainingTypes({ include_inactive: true }),
          fetchProducts({ type: "service", includeArchived: true }),
        ]);

        if (!cancelled) {
          setReport(nextReport);
          setRules(nextRules);
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
            <SectionTitle label="payroll" title="Зарплаты за период" />
          </div>
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
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["calculation", "Расчёт"],
            ["rules", "Правила оплаты"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id as "calculation" | "rules")}
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

      {error && (
        <div className="rounded-[8px] border border-[rgba(255,116,57,0.35)] bg-[rgba(255,116,57,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          Загрузка зарплат...
        </div>
      ) : mode === "rules" ? (
        <PayrollRulesPanel
          rules={rules}
          trainingTypes={trainingTypes}
          services={services}
          busy={rulesBusy}
          onCreate={handleCreateRule}
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
      ...report.external_expenses.map((item) => ({
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
                  {expenseRows.map((row, index) => (
                    <div key={row.id} className={`grid gap-3 px-4 py-4 text-sm lg:grid-cols-[0.8fr_1.4fr_1fr_0.8fr_1fr_auto] lg:items-center ${index < expenseRows.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}>
                      <p className={row.type === "Приёмка" ? "font-medium text-[var(--warning)]" : "font-medium text-[var(--danger)]"}>{row.type}</p>
                      <p className="min-w-0 truncate font-medium text-[var(--text-main)]">{row.name}</p>
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
          {tab === "visits" && (
            report.visits.length === 0 ? (
              <EmptyState text="Посещений за выбранный период нет" />
            ) : (
              <section className="overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
                {report.visits.map((visit, index) => (
                  <div key={visit.id} className={`grid gap-3 px-4 py-4 text-sm sm:grid-cols-[1.5fr_0.8fr_1fr] sm:items-center ${index < report.visits.length - 1 ? "border-b border-[var(--line-soft)]" : ""}`}>
                    <p className="font-medium text-[var(--text-main)]">{visit.client_name}</p>
                    <p className="text-[var(--text-muted)]">{visit.visit_type === "open_gym" ? "Open Gym" : "Группа"}</p>
                    <p className="text-xs text-[var(--text-muted)]">{formatDate(visit.visited_at)}</p>
                  </div>
                ))}
              </section>
            )
          )}
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return <AnalyticsWorkspace section="analytics" />;
}
