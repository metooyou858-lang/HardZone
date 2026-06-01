"use client";

import { useEffect, useState } from "react";

interface StuckOrder {
  id: string;
  status: string;
  aqsi_payment_status: string | null;
  aqsi_receipt_status: string | null;
  aqsi_error: string | null;
  created_at: string;
  total_amount: number;
}

interface RecentError {
  ts: string;
  category: string;
  message?: string;
  [key: string]: unknown;
}

interface SystemStatus {
  uptime_seconds: number;
  db_ok: boolean;
  recent_errors: RecentError[];
  stuck_orders: StuckOrder[];
}

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
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatAmount(kopeks: number): string {
  return (kopeks / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

export function SystemStatusPanel() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetch("/api/system/status", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Нет доступа или сервер недоступен");
        return r.json() as Promise<SystemStatus>;
      })
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
        Загружаем статус...
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-10 text-center text-sm text-[var(--danger)]">
        {error ?? "Нет данных"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Индикаторы */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
          <p className="text-sm text-[var(--text-muted)]">Бэкенд</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
            <span className="text-base font-semibold text-[var(--text-main)]">Работает</span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Uptime {formatUptime(status.uptime_seconds)}</p>
        </div>

        <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
          <p className="text-sm text-[var(--text-muted)]">База данных</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${status.db_ok ? "bg-[var(--success)]" : "bg-[var(--danger)]"}`} />
            <span className="text-base font-semibold text-[var(--text-main)]">
              {status.db_ok ? "Доступна" : "Недоступна"}
            </span>
          </div>
        </div>

        <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
          <p className="text-sm text-[var(--text-muted)]">Проблемные заказы</p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${status.stuck_orders.length > 0 ? "bg-[var(--warning,#f0a500)]" : "bg-[var(--success)]"}`} />
            <span className="text-base font-semibold text-[var(--text-main)]">
              {status.stuck_orders.length > 0 ? `${status.stuck_orders.length} шт.` : "Нет"}
            </span>
          </div>
        </div>
      </div>

      {/* Проблемные заказы */}
      {status.stuck_orders.length > 0 && (
        <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
          <p className="mb-3 text-base font-semibold text-[var(--text-main)]">Проблемные заказы</p>
          <div className="space-y-2">
            {status.stuck_orders.map((order) => (
              <div key={order.id} className="rounded-[18px] border border-[rgba(248,81,73,0.2)] bg-[rgba(248,81,73,0.06)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-[var(--text-muted)]">{order.id.slice(0, 8)}…</span>
                    <span className="text-[var(--text-muted)]">•</span>
                    <span className="text-[var(--text-main)]">{formatAmount(order.total_amount)}</span>
                    <span className="text-[var(--text-muted)]">•</span>
                    <span className="text-[var(--text-muted)]">{formatTime(order.created_at)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {order.aqsi_payment_status && (
                      <span className="rounded-full bg-[rgba(248,81,73,0.15)] px-2 py-0.5 text-xs text-[var(--danger)]">
                        оплата: {order.aqsi_payment_status}
                      </span>
                    )}
                    {order.aqsi_receipt_status && order.aqsi_receipt_status !== "completed" && (
                      <span className="rounded-full bg-[rgba(248,81,73,0.15)] px-2 py-0.5 text-xs text-[var(--danger)]">
                        чек: {order.aqsi_receipt_status}
                      </span>
                    )}
                  </div>
                </div>
                {order.aqsi_error && (
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">{order.aqsi_error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Последние ошибки */}
      <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold text-[var(--text-main)]">Последние ошибки</p>
          <button
            type="button"
            onClick={load}
            className="rounded-[14px] border border-[var(--line-soft)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
          >
            Обновить
          </button>
        </div>

        {status.recent_errors.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Ошибок нет</p>
        ) : (
          <div className="space-y-2">
            {status.recent_errors.map((err, i) => (
              <div key={i} className="rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-main)] px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span>{formatTime(err.ts)}</span>
                  <span>•</span>
                  <span className="rounded-full bg-[rgba(248,81,73,0.12)] px-2 py-0.5 text-[var(--danger)]">{err.category}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-main)]">
                  {err.message ?? JSON.stringify(Object.fromEntries(Object.entries(err).filter(([k]) => !["ts", "category"].includes(k))))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
