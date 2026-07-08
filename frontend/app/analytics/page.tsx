"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  createAnalyticsExpense,
  deleteAnalyticsExpense,
  fetchAnalyticsReport,
  type AnalyticsCheck,
  type AnalyticsExternalExpense,
  type AnalyticsReport,
  type AnalyticsSaleLine,
} from "@/lib/api/analytics";

type Tab = "overview" | "checks" | "products" | "services" | "expenses" | "visits";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "checks", label: "Чеки" },
  { id: "products", label: "Товарка" },
  { id: "services", label: "Услуги" },
  { id: "expenses", label: "Расходы" },
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
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
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
        : "border-[var(--line-soft)] bg-[var(--bg-card)]";

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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Выручка" value={formatMoney(summary.revenue)} hint={`${summary.checks_count} чеков за период`} tone="good" />
        <StatCard label="Валовая прибыль" value={formatMoney(summary.gross_profit)} hint="Выручка минус себестоимость проданного" tone={summary.gross_profit >= 0 ? "good" : "warn"} />
        <StatCard label="Денежный итог" value={formatMoney(summary.cash_profit)} hint="Выручка минус закупки и списания" tone={summary.cash_profit >= 0 ? "good" : "warn"} />
        <StatCard label="Посещения" value={formatNumber(summary.visits_count)} hint={`${summary.group_visits} групповых · ${summary.open_gym_visits} Open Gym`} />
      </div>

      <section className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
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

function MonthPeriodPicker({
  month,
  range,
  onChange,
}: {
  month: string;
  range: { from: string; to: string };
  onChange: (value: string) => void;
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
    <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-3">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <button
          onClick={() => onChange(shiftMonthValue(month, -1))}
          className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-lg leading-none text-[var(--text-main)] transition hover:border-[var(--accent)]"
          aria-label="Предыдущий месяц"
        >
          ‹
        </button>

        <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            Месяц
            <select
              value={monthNumber}
              onChange={(event) => setMonthPart(Number(event.target.value))}
              className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none"
            >
              {monthLabels.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs text-[var(--text-muted)]">
            Год
            <select
              value={year}
              onChange={(event) => setYearPart(Number(event.target.value))}
              className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none"
            >
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          onClick={() => onChange(shiftMonthValue(month, 1))}
          className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-lg leading-none text-[var(--text-main)] transition hover:border-[var(--accent)]"
          aria-label="Следующий месяц"
        >
          ›
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">
          Период: <span className="text-[var(--text-main)]">{formatPeriodDate(range.from)} - {formatPeriodDate(range.to)}</span>
        </p>
        <button
          onClick={() => onChange(currentMonthValue())}
          className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 py-2 text-xs font-medium text-[var(--text-main)] transition hover:border-[var(--accent)]"
        >
          Текущий месяц
        </button>
      </div>
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

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState(currentMonthValue);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [expenseBusy, setExpenseBusy] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null);
  const range = useMemo(() => getMonthRange(month), [month]);

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
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)] sm:text-4xl">
            Аналитика
          </h1>
        </div>

        <div className="grid gap-3 xl:min-w-[520px]">
          <MonthPeriodPicker month={month} range={range} onChange={setMonth} />
          <button onClick={() => setReloadToken((value) => value + 1)} className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-4 py-2 text-sm font-medium text-[var(--text-main)] transition hover:border-[var(--accent)]">
            Обновить
          </button>
        </div>
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

      {error && (
        <div className="rounded-[8px] border border-[rgba(255,116,57,0.35)] bg-[rgba(255,116,57,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          Загрузка аналитики...
        </div>
      )}

      {!loading && report && (
        <>
          {tab === "overview" && <Overview report={report} />}
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
