"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  approvePayrollRun,
  createAnalyticsExpense,
  createPayrollRule,
  createPayrollRun,
  deleteAnalyticsExpense,
  deletePayrollRule,
  fetchAnalyticsReport,
  fetchPayrollReport,
  fetchPayrollRules,
  fetchPayrollRuns,
  payPayrollRunEmployee,
  updatePayrollRule,
  type AnalyticsCheck,
  type AnalyticsExternalExpense,
  type AnalyticsReport,
  type AnalyticsSaleLine,
  type PayrollReport,
  type PayrollRule,
  type PayrollRun,
  type PayrollTrainerSummary,
} from "@/lib/api/analytics";
import { fetchProducts, type Product } from "@/lib/api/products";
import { fetchTrainingTypes, type TrainingType } from "@/lib/api/training-types";
import { fetchTrainers, type Trainer } from "@/lib/api/trainers";

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
          <StatCard label="Зарплаты" value={formatMoney(summary.payroll_expenses)} hint={formatNumber(report.payroll_expenses.length) + " выплат сотрудникам"} tone="warn" />
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
  const [name, setName] = useState("");
  const [allTrainers, setAllTrainers] = useState(true);
  const [trainerIds, setTrainerIds] = useState<number[]>([]);
  const [allActivities, setAllActivities] = useState(false);
  const [trainingTypeIds, setTrainingTypeIds] = useState<number[]>([]);
  const [productIds, setProductIds] = useState<number[]>([]);
  const [salaryAmount, setSalaryAmount] = useState("");
  const [calculationType, setCalculationType] = useState<"fixed" | "per_attendee" | "tiered" | "percentage">("fixed");
  const [baseAmount, setBaseAmount] = useState("");
  const [bonusThreshold, setBonusThreshold] = useState("");
  const [bonusPerPerson, setBonusPerPerson] = useState("");
  const [perAttendeeAmount, setPerAttendeeAmount] = useState("");
  const [percentageRate, setPercentageRate] = useState("");
  const [tiers, setTiers] = useState([{ from: "1", to: "", amount: "" }]);
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
    const parsedTiers = tiers.map((tier) => ({ from: Number(tier.from), to: tier.to === "" ? null : Number(tier.to), amount: money(tier.amount) }));
    if (calculationType === "tiered" && parsedTiers.some((tier) => !Number.isInteger(tier.from) || (tier.to !== null && (!Number.isInteger(tier.to) || tier.to < tier.from)))) return setError("Проверьте диапазоны посетителей");
    const payload = { name: name.trim(), trainer_ids: trainerIds, all_trainers: allTrainers, training_type_ids: trainingTypeIds, product_ids: productIds, all_activities: allActivities, salary_amount: money(salaryAmount), calculation_type: calculationType, base_amount: money(baseAmount), per_attendee_amount: money(perAttendeeAmount), percentage_rate: money(percentageRate), bonus_threshold: bonusThreshold ? Number(bonusThreshold) : null, bonus_per_person: money(bonusPerPerson), tiers: parsedTiers, effective_from: effectiveFrom, comment: comment.trim() || null };
    if (editingId === null) await onCreate(payload); else await onUpdate(editingId, payload);
    setEditingId(null);
    setName(""); setTrainerIds([]); setTrainingTypeIds([]); setProductIds([]); setSalaryAmount(""); setBaseAmount(""); setBonusThreshold(""); setBonusPerPerson(""); setPerAttendeeAmount(""); setPercentageRate(""); setTiers([{ from: "1", to: "", amount: "" }]); setComment("");
  }

  function startEdit(rule: PayrollRule) { setEditingId(rule.id); setName(rule.name); setAllTrainers(rule.all_trainers); setTrainerIds(rule.trainers.map((t)=>Number(t.trainer_id))); setAllActivities(rule.all_activities); setTrainingTypeIds(rule.items.filter((i)=>i.training_type_id!==null).map((i)=>Number(i.training_type_id))); setProductIds(rule.items.filter((i)=>i.product_id!==null).map((i)=>Number(i.product_id))); setSalaryAmount(String(rule.salary_amount || "")); setCalculationType(rule.calculation_type); setBaseAmount(String(rule.base_amount || "")); setBonusThreshold(rule.bonus_threshold===null?"":String(rule.bonus_threshold)); setBonusPerPerson(String(rule.bonus_per_person || "")); setPerAttendeeAmount(String(rule.per_attendee_amount || "")); setPercentageRate(String(rule.percentage_rate || "")); setTiers(rule.tiers.length ? rule.tiers.map((t)=>({from:String(t.from),to:t.to===null?"":String(t.to),amount:String(t.amount)})) : [{from:"1",to:"",amount:""}]); setEffectiveFrom(rule.effective_from); setComment(rule.comment || ""); window.scrollTo({top:0,behavior:"smooth"}); }

  function ruleFormula(rule: PayrollRule) {
    if (rule.calculation_type === "per_attendee") return `${formatMoney(rule.per_attendee_amount)} за каждого пришедшего`;
    if (rule.calculation_type === "percentage") return `${rule.percentage_rate}% тренеру · ${100 - rule.percentage_rate}% залу`;
    if (rule.calculation_type === "tiered") return rule.tiers.map((tier) => `${tier.from}–${tier.to ?? "∞"}: ${formatMoney(tier.amount)}`).join(" · ");
    return `${formatMoney(rule.base_amount)} за занятие${rule.bonus_threshold === null ? "" : ` · свыше ${rule.bonus_threshold}: +${formatMoney(rule.bonus_per_person || 0)}`}`;
  }

  return <div className="space-y-4">
    <form onSubmit={submit} className="rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] p-4 backdrop-blur-[3px]">
      <SectionTitle label="payroll rules" title={editingId === null ? "Новое правило оплаты" : "Редактирование правила"} />
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_0.7fr_1fr]">
        <label className="grid gap-1 text-xs text-[var(--text-muted)]">Название<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, групповые занятия" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)]" /></label>
        <label className="grid gap-1 text-xs text-[var(--text-muted)]">Действует с<input value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} type="date" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)]" /></label>
        <label className="grid gap-1 text-xs text-[var(--text-muted)]">Комментарий<input value={comment} onChange={(e) => setComment(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)]" /></label>
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
        <div className="grid gap-3 md:grid-cols-[0.8fr_1fr]"><label className="grid gap-1 text-xs text-[var(--text-muted)]">Оклад за расчётный период<input value={salaryAmount} onChange={(e) => setSalaryAmount(e.target.value)} inputMode="decimal" placeholder="0" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]" /></label><label className="grid gap-1 text-xs text-[var(--text-muted)]">Расчёт за проведённое занятие<select value={calculationType} onChange={(e) => setCalculationType(e.target.value as typeof calculationType)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]"><option value="fixed">Фиксированная сумма</option><option value="per_attendee">За каждого пришедшего</option><option value="tiered">По диапазонам посетителей</option><option value="percentage">Процент от стоимости услуги</option></select></label></div>
        {calculationType === "fixed" && <div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="grid gap-1 text-xs text-[var(--text-muted)]">Сумма за занятие<input value={baseAmount} onChange={(e)=>setBaseAmount(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]" /></label><label className="grid gap-1 text-xs text-[var(--text-muted)]">Доплата после, чел.<input value={bonusThreshold} onChange={(e)=>setBonusThreshold(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]" /></label><label className="grid gap-1 text-xs text-[var(--text-muted)]">Доплата за человека<input value={bonusPerPerson} onChange={(e)=>setBonusPerPerson(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]" /></label></div>}
        {calculationType === "per_attendee" && <label className="mt-3 grid max-w-xs gap-1 text-xs text-[var(--text-muted)]">Сумма за пришедшего<input value={perAttendeeAmount} onChange={(e)=>setPerAttendeeAmount(e.target.value)} className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]" /></label>}
        {calculationType === "percentage" && <label className="mt-3 grid max-w-xs gap-1 text-xs text-[var(--text-muted)]">Процент тренеру<input value={percentageRate} onChange={(e)=>setPercentageRate(e.target.value)} inputMode="decimal" placeholder="50" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]" /><span className="text-[11px]">Остаток автоматически остаётся залу</span></label>}
        {calculationType === "tiered" && <div className="mt-3 space-y-2">{tiers.map((tier,index)=><div key={index} className="grid gap-2 sm:grid-cols-[0.7fr_0.7fr_1fr_auto]"><input value={tier.from} onChange={(e)=>setTiers((list)=>list.map((v,i)=>i===index?{...v,from:e.target.value}:v))} placeholder="От" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]"/><input value={tier.to} onChange={(e)=>setTiers((list)=>list.map((v,i)=>i===index?{...v,to:e.target.value}:v))} placeholder="До (пусто = ∞)" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]"/><input value={tier.amount} onChange={(e)=>setTiers((list)=>list.map((v,i)=>i===index?{...v,amount:e.target.value}:v))} placeholder="Сумма за занятие" className="h-10 rounded-[8px] border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]"/><button type="button" onClick={()=>setTiers((list)=>list.filter((_,i)=>i!==index))} className="px-3 text-xs text-[var(--danger)]">Удалить</button></div>)}<button type="button" onClick={()=>setTiers((list)=>[...list,{from:"",to:"",amount:""}])} className="text-sm text-[var(--accent)]">+ Добавить диапазон</button></div>}
      </div>
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      <button disabled={busy} className="mt-4 h-10 rounded-[8px] border border-[var(--accent)] bg-[var(--accent-soft)] px-4 text-sm font-medium text-[var(--accent)] disabled:opacity-60">{busy ? "Сохраняю..." : editingId === null ? "Сохранить правило" : "Сохранить изменения"}</button>
    </form>

    <section className="space-y-3">{rules.length === 0 ? <EmptyState text="Правил оплаты пока нет" /> : rules.map((rule)=><article key={rule.id} className="rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] p-4 backdrop-blur-[3px]"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[var(--text-main)]">{rule.name}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{rule.all_trainers ? "Все сотрудники" : rule.trainers.map((t)=>t.trainer_name).join(", ")} · {rule.all_activities ? "Все занятия" : rule.items.map((i)=>i.training_type_name||i.product_name).filter(Boolean).join(", ")}</p></div><div className="flex gap-3"><button type="button" onClick={()=>startEdit(rule)} className="text-xs text-[var(--accent)]">Редактировать</button><button type="button" onClick={()=>void onDelete(rule)} className="text-xs text-[var(--danger)]">Удалить</button></div></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-[0.6fr_1.8fr_0.7fr]"><span>Оклад: {formatMoney(rule.salary_amount)}</span><span>{ruleFormula(rule)}</span><span>с {formatPeriodDate(rule.effective_from)}</span></div>{rule.comment && <p className="mt-2 text-xs text-[var(--text-muted)]">{rule.comment}</p>}</article>)}</section>
  </div>;
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
        <SectionTitle label="payroll statement" title="Сформировать расчётную ведомость" />
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
            {busy ? "Формирую..." : "Сформировать"}
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
          <section key={run.id} className="overflow-hidden rounded-[8px] border border-[var(--line-soft)] bg-[rgba(22,27,39,0.58)] backdrop-blur-[3px]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-soft)] px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-[var(--text-main)]">
                  Ведомость #{run.id} · {formatPeriodDate(run.date_from)} — {formatPeriodDate(run.date_to)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {run.employees_count} сотрудников · выплачено {run.paid_count} · всего {formatMoney(run.total_amount)}
                </p>
              </div>
              {run.status === "draft" ? (
                <button onClick={() => void approveRun(run.id)} disabled={busy} className="rounded-[8px] border border-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent)] disabled:opacity-60">
                  Утвердить
                </button>
              ) : (
                <span className="text-xs font-medium text-[var(--success)]">Утверждена</span>
              )}
            </div>

            {run.employees.map((employee, index) => (
              <details key={employee.id} className={index < run.employees.length - 1 ? "border-b border-[var(--line-soft)]" : ""}>
                <summary className="grid cursor-pointer list-none gap-3 px-4 py-4 sm:grid-cols-[1.4fr_0.8fr_0.8fr_auto] sm:items-center">
                  <div>
                    <p className="font-medium text-[var(--text-main)]">{employee.trainer_name}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{employee.slots_count} занятий · {employee.attended_count} посещений</p>
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">База {formatMoney(employee.base_amount)} · доплаты {formatMoney(employee.bonus_amount)}</p>
                  <p className="text-base font-semibold text-[var(--text-main)]">{formatMoney(employee.total_amount)}</p>
                  {employee.payment_status === "paid" ? (
                    <span className="text-xs font-medium text-[var(--success)]">Выплачено {employee.paid_date ? formatPeriodDate(employee.paid_date) : ""}</span>
                  ) : run.status === "approved" ? (
                    <button onClick={(event) => { event.preventDefault(); void payEmployee(run.id, employee.id); }} disabled={busy} className="rounded-[8px] border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-medium text-[var(--accent)] disabled:opacity-60">
                      Выплачено
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
          </section>
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
            <SectionTitle label="payroll" title="Зарплаты" />
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
