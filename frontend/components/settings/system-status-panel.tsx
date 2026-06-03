"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api/client";

type CheckStatus = "ok" | "warning" | "critical";

interface StuckOrder {
  id: string;
  status: string;
  aqsi_payment_status: string | null;
  aqsi_receipt_status: string | null;
  aqsi_error: string | null;
  created_at: string;
  total_amount: string | number;
}

interface TerminalBlocker {
  operation_id: string;
  order_id: string | null;
  op_status: string | null;
  source: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

interface RecentError {
  ts: string;
  category: string;
  message?: string;
  [key: string]: unknown;
}

interface BackupFile {
  name: string;
  path: string;
  size_bytes: number;
  modified_at: string;
}

interface OperationalCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  command: string;
}

interface SystemStatus {
  generated_at: string;
  uptime_seconds: number;
  db_ok: boolean;
  environment: {
    node_env: string;
    host: string;
    port: number;
    production_ip: string;
    primary_domain: string;
    www_domain: string;
  };
  table_counts: {
    users: number;
    clients: number;
    orders: number;
    products: number;
    schema_migrations: number;
  };
  latest_migrations: Array<{ filename: string; executed_at: string }>;
  backups: {
    directory: string;
    latest: BackupFile | null;
    files: BackupFile[];
    restore_evidence: {
      checked_at: string;
      file: string;
      result: string;
      counts: {
        users: number;
        clients: number;
        orders: number;
        schema_migrations: number;
      };
    };
  };
  domain: {
    status: string;
    records: Array<{ host: string; type: string; value: string }>;
    next_steps: string[];
  };
  operational_checks: OperationalCheck[];
  commands: Array<{ label: string; value: string }>;
  docs: Array<{ label: string; path: string }>;
  recent_errors: RecentError[];
  stuck_orders: StuckOrder[];
  terminal_blockers: TerminalBlocker[];
}

const statusLabels: Record<CheckStatus, string> = {
  ok: "Работает",
  warning: "Внимание",
  critical: "Критично",
};

const statusClasses: Record<CheckStatus, string> = {
  ok: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  critical: "border-red-400/35 bg-red-400/10 text-red-200",
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} д ${h} ч`;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatAmount(value: string | number): string {
  const amount = Number(value || 0);
  return amount.toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function Pill({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="rounded-md border border-[var(--line-soft)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
    >
      {copied ? "Скопировано" : "Копировать"}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
      <h2 className="text-base font-semibold text-[var(--text-main)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SystemStatusPanel() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    apiFetch<SystemStatus>("/system/status")
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const summary = useMemo(() => {
    if (!status) return { ok: 0, warning: 0, critical: 0 };
    return status.operational_checks.reduce(
      (acc, check) => ({ ...acc, [check.status]: acc[check.status] + 1 }),
      { ok: 0, warning: 0, critical: 0 } as Record<CheckStatus, number>
    );
  }, [status]);

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
        Загружаем системную диагностику...
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-10 text-center text-sm text-[var(--danger)]">
        {error ?? "Нет данных"}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-lg font-semibold text-[var(--text-main)]">Система и диагностика</p>
            <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
              Здесь собраны проверки, backup/restore, AQSI-риски, домен, последние ошибки и команды, которые мы использовали при стабилизации.
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Обновлено: {formatTime(status.generated_at)}</p>
          </div>
          <button
            type="button"
            onClick={load}
            className="rounded-md border border-[var(--line-soft)] px-4 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          >
            Обновить
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Backend</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{formatUptime(status.uptime_seconds)}</p>
          </div>
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-4">
            <p className="text-xs text-[var(--text-muted)]">PostgreSQL</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{status.db_ok ? "Доступен" : "Недоступен"}</p>
          </div>
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Проверки</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{summary.ok} ok / {summary.warning} warn</p>
          </div>
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-4">
            <p className="text-xs text-[var(--text-muted)]">AQSI-заказы</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{status.stuck_orders.length}</p>
          </div>
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-4">
            <p className="text-xs text-[var(--text-muted)]">Ошибки</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{status.recent_errors.length}</p>
          </div>
        </div>
      </div>

      <Section title="Операционные проверки">
        <div className="grid gap-3 lg:grid-cols-2">
          {status.operational_checks.map((check) => (
            <div key={check.key} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--text-main)]">{check.label}</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">{check.detail}</p>
                </div>
                <Pill status={check.status} />
              </div>
              <div className="mt-3 flex items-start gap-2 rounded-md bg-black/20 p-3">
                <code className="flex-1 break-all text-xs text-[var(--text-muted)]">{check.command}</code>
                <CopyButton value={check.command} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Backup и restore">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[var(--text-muted)]">Каталог backup</p>
              <code className="mt-1 block break-all text-sm text-[var(--text-main)]">{status.backups.directory}</code>
            </div>

            {status.backups.latest ? (
              <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-4">
                <p className="text-sm font-medium text-emerald-200">Последний backup</p>
                <p className="mt-1 break-all text-sm text-[var(--text-main)]">{status.backups.latest.name}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {formatBytes(status.backups.latest.size_bytes)} · {formatTime(status.backups.latest.modified_at)}
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-200">
                Backup-файлы не найдены.
              </p>
            )}

            <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-4">
              <p className="text-sm font-medium text-[var(--text-main)]">Restore evidence</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {status.backups.restore_evidence.result === "ok" ? "Успешно" : status.backups.restore_evidence.result} · {formatTime(status.backups.restore_evidence.checked_at)}
              </p>
              <p className="mt-2 break-all text-xs text-[var(--text-muted)]">{status.backups.restore_evidence.file}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)]">
                <span>users: {status.backups.restore_evidence.counts.users}</span>
                <span>clients: {status.backups.restore_evidence.counts.clients}</span>
                <span>orders: {status.backups.restore_evidence.counts.orders}</span>
                <span>migrations: {status.backups.restore_evidence.counts.schema_migrations}</span>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Домен и production">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-4">
                <p className="text-xs text-[var(--text-muted)]">Основной домен</p>
                <p className="mt-1 font-medium text-[var(--text-main)]">{status.environment.primary_domain}</p>
              </div>
              <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-4">
                <p className="text-xs text-[var(--text-muted)]">Production IP</p>
                <p className="mt-1 font-medium text-[var(--text-main)]">{status.environment.production_ip}</p>
              </div>
            </div>
            <div className="space-y-2">
              {status.domain.records.map((record) => (
                <div key={`${record.host}-${record.type}`} className="flex items-center justify-between rounded-md border border-[var(--line-soft)] px-3 py-2 text-sm">
                  <span className="text-[var(--text-main)]">{record.host} · {record.type}</span>
                  <span className="font-mono text-xs text-[var(--text-muted)]">{record.value}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-main)]">Следующие шаги</p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
                {status.domain.next_steps.map((step) => <li key={step}>• {step}</li>)}
              </ul>
            </div>
          </div>
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="AQSI и проблемные заказы">
          {status.stuck_orders.length === 0 && status.terminal_blockers.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Проблемных заказов и активных блокировок терминала нет.</p>
          ) : (
            <div className="space-y-3">
              {status.stuck_orders.map((order) => (
                <div key={order.id} className="rounded-lg border border-red-400/25 bg-red-400/10 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-[var(--text-muted)]">{order.id.slice(0, 8)}...</span>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span className="text-[var(--text-main)]">{formatAmount(order.total_amount)}</span>
                    <span className="text-[var(--text-muted)]">· {formatTime(order.created_at)}</span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    оплата: {order.aqsi_payment_status ?? "-"} · чек: {order.aqsi_receipt_status ?? "-"}
                  </p>
                  {order.aqsi_error && <p className="mt-2 text-sm text-red-200">{order.aqsi_error}</p>}
                </div>
              ))}
              {status.terminal_blockers.map((blocker) => (
                <div key={blocker.operation_id} className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
                  <p className="break-all font-mono text-xs text-[var(--text-main)]">{blocker.operation_id}</p>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    статус: {blocker.op_status ?? "-"} · источник: {blocker.source ?? "-"} · последнее обновление: {formatTime(blocker.last_seen_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Данные и миграции">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {Object.entries(status.table_counts).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-3">
                <p className="text-xs text-[var(--text-muted)]">{key}</p>
                <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2">
            {status.latest_migrations.map((migration) => (
              <div key={migration.filename} className="rounded-md border border-[var(--line-soft)] px-3 py-2">
                <p className="break-all text-xs text-[var(--text-main)]">{migration.filename}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{formatTime(migration.executed_at)}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Команды и документы">
          <div className="space-y-3">
            {status.commands.map((command) => (
              <div key={command.value} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-3">
                <p className="text-sm font-medium text-[var(--text-main)]">{command.label}</p>
                <div className="mt-2 flex items-start gap-2">
                  <code className="flex-1 break-all text-xs text-[var(--text-muted)]">{command.value}</code>
                  <CopyButton value={command.value} />
                </div>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-2">
              {status.docs.map((doc) => (
                <div key={doc.path} className="rounded-md border border-[var(--line-soft)] px-3 py-2">
                  <p className="text-sm text-[var(--text-main)]">{doc.label}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{doc.path}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Последние ошибки backend">
          {status.recent_errors.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Ошибок в памяти backend нет.</p>
          ) : (
            <div className="space-y-2">
              {status.recent_errors.map((err, index) => (
                <div key={`${err.ts}-${index}`} className="rounded-lg border border-[var(--line-soft)] bg-[var(--bg-main)] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span>{formatTime(err.ts)}</span>
                    <span>·</span>
                    <span className="rounded-full bg-red-400/10 px-2 py-0.5 text-red-200">{err.category}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-main)]">
                    {err.message ?? JSON.stringify(Object.fromEntries(Object.entries(err).filter(([key]) => !["ts", "category"].includes(key))))}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
