"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { useRouter } from "next/navigation";

import { formatClientName } from "@/components/clients/shared";
import { formatTimeValue } from "@/components/schedule/gym-access-shared";
import type { BannerTone } from "@/components/schedule/schedule-shared";
import { type ClientListItem, type ClientSubscription, fetchClient, fetchClients, findClientByBarcode } from "@/lib/api/clients";
import { checkInOpenGym, deleteGymVisit, fetchGymOverview, type GymOverview, type OpenGymVisit } from "@/lib/api/schedule";

const subscriptionTypeLabels: Record<string, string> = {
  single: "Разовое",
  visits: "Визитный",
  period: "Месячный",
  unlimited: "Безлимит",
};

function formatSubscriptionLabel(sub: ClientSubscription): string {
  const name = sub.product_name || subscriptionTypeLabels[sub.type] || sub.type;
  if (sub.type === "visits" || sub.type === "single") {
    return `${name} — ${sub.visits_left ?? 0} из ${sub.visits_total ?? "?"} визитов`;
  }
  if (sub.expires_at) {
    const date = new Date(sub.expires_at).toLocaleDateString("ru", { day: "numeric", month: "short" });
    return `${name} — до ${date}`;
  }
  return name;
}

function formatVisitDate(value?: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString("ru-RU");
}

function getOpenGymSubscriptionLabel(visit: OpenGymVisit) {
  if (visit.coverage_status === "comped") {
    return "Без списания";
  }

  if (visit.coverage_status === "not_required") {
    return "Без списания";
  }

  if (!visit.subscription_id) {
    return null;
  }

  const title = visit.subscription_product_name || "Абонемент";
  const expiresAt = formatVisitDate(visit.subscription_expires_at);

  return `${title}${expiresAt ? ` · до ${expiresAt}` : ""}`;
}

export function GymSidebarBlock({
  selectedDate,
  canGymAccess,
  onNotice,
}: {
  selectedDate: string;
  canGymAccess: boolean;
  onNotice: (notice: { tone: BannerTone; text: string }) => void;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState<GymOverview | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ClientListItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Шаг выбора абонемента
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(null);
  const [subscriptions, setSubscriptions] = useState<ClientSubscription[]>([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);

  const scannerBufferRef = useRef("");
  const scannerLastTsRef = useRef(0);

  useEffect(() => {
    fetchGymOverview(selectedDate)
      .then(setOverview)
      .catch(() => {});
  }, [selectedDate]);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetchClients({ search: trimmed, limit: 10, offset: 0 });
        if (!cancelled) {
          setResults(response);
          setSearchError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setSearchError(error instanceof Error ? error.message : "Не удалось найти клиентов");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  async function selectClient(client: ClientListItem) {
    setResults([]);
    setQuery("");
    setSelectedClient(client);
    setLoadingSubscriptions(true);

    try {
      const detail = await fetchClient(client.id);
      const active = detail.subscriptions.filter((s) => s.status === "active" && s.allow_free_visit);
      setSubscriptions(active);
    } catch {
      setSubscriptions([]);
    } finally {
      setLoadingSubscriptions(false);
    }
  }

  async function handleCheckIn(client: ClientListItem, subscriptionId: string | null) {
    setCheckingIn(true);

    try {
      const response = await checkInOpenGym({
        client_id: client.id,
        subscription_id: subscriptionId,
        attendance_mode: subscriptionId ? "auto" : "unpaid",
        created_by: "admin",
        overview_date: selectedDate,
      });

      setOverview((prev) =>
        prev
          ? { ...prev, today: response.today, visits: response.visits, total_today: response.total_today }
          : null
      );
      setSelectedClient(null);
      setSubscriptions([]);
      setSearchError(null);
      onNotice({
        tone: response.within_hours ? "success" : "info",
        text: response.within_hours
          ? `${formatClientName(client)} отмечен в зале`
          : `${formatClientName(client)} отмечен вне расписания`,
      });
    } catch (error) {
      onNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось отметить вход",
      });
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleDeleteVisit(visitId: string) {
    setDeletingVisitId(visitId);
    try {
      const response = await deleteGymVisit(visitId, selectedDate);
      setOverview((prev) =>
        prev ? { ...prev, today: response.today, visits: response.visits, total_today: response.total_today } : null
      );
    } catch (error) {
      onNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось удалить визит",
      });
    } finally {
      setDeletingVisitId(null);
    }
  }

  async function handleBarcode(barcode: string) {
    try {
      const client = await findClientByBarcode(barcode);
      await selectClient(client as ClientListItem);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Клиент по штрихкоду не найден");
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

    const now = Date.now();

    if (event.key === "Enter") {
      const barcode = scannerBufferRef.current.trim();
      const isScannerInput = barcode.length >= 6 && now - scannerLastTsRef.current <= 100;
      scannerBufferRef.current = "";
      scannerLastTsRef.current = 0;

      if (isScannerInput) {
        event.preventDefault();
        void handleBarcode(barcode);
      }
      return;
    }

    if (event.key.length === 1) {
      if (now - scannerLastTsRef.current > 100) scannerBufferRef.current = "";
      scannerBufferRef.current += event.key;
      scannerLastTsRef.current = now;
    }
  }

  const today = overview?.today;
  const isOpen = today?.is_open_now ?? false;

  return (
    <div className="rounded-[2rem] p-5 space-y-4" style={{ background: "var(--bg-card)", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--text-main)]">Вход в зал</p>
        <div className="flex items-center gap-2">
          {overview && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                isOpen
                  ? "bg-[rgba(63,185,80,0.12)] text-[var(--success)] border border-[rgba(63,185,80,0.24)]"
                  : "bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)] border border-[var(--line-soft)]"
              }`}
            >
              {isOpen ? "Открыт" : "Закрыт"}
            </span>
          )}
          {today && (
            <span className="text-xs text-[var(--text-muted)]">
              {formatTimeValue(today.open_time)}–{formatTimeValue(today.close_time)}
            </span>
          )}
        </div>
      </div>

      {/* Шаг 1: поиск клиента */}
      {canGymAccess && !selectedClient && (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="ФИО или штрихкод..."
            className="w-full rounded-[1.25rem] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[rgba(94,244,216,0.25)]"
            style={{ background: "var(--bg-card-soft)" }}
          />

          {(results.length > 0 || searching) && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-[1.25rem] overflow-hidden" style={{ background: "var(--bg-card-soft)", boxShadow: "0 20px 40px rgba(0,0,0,0.35)" }}>
              {searching ? (
                <p className="px-4 py-3 text-sm text-[var(--text-muted)]">Ищем...</p>
              ) : (
                results.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => void selectClient(client)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-[rgba(255,255,255,0.04)] transition-colors"
                  >
                    <span className="text-[var(--text-main)]">{formatClientName(client)}</span>
                    <span className="text-xs text-[var(--text-muted)]">{client.phone || ""}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {searchError && (
            <p className="mt-1 text-xs text-[var(--danger)]">{searchError}</p>
          )}
        </div>
      )}

      {/* Шаг 2: выбор абонемента */}
      {canGymAccess && selectedClient && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--text-main)]">{formatClientName(selectedClient)}</p>
            <button
              type="button"
              onClick={() => { setSelectedClient(null); setSubscriptions([]); }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
            >
              Изменить
            </button>
          </div>

          {loadingSubscriptions ? (
            <p className="text-xs text-[var(--text-muted)]">Загружаем абонементы...</p>
          ) : (
            <div className="space-y-2">
              {subscriptions.length > 0 && (
                <p className="text-xs text-[var(--text-muted)]">Выберите абонемент для списания:</p>
              )}

              {subscriptions.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  disabled={checkingIn}
                  onClick={() => void handleCheckIn(selectedClient, sub.id)}
                  className="w-full rounded-[1.25rem] px-4 py-2.5 text-left text-sm text-[var(--text-main)] transition-colors disabled:opacity-50"
                  style={{ background: "rgba(94,244,216,0.08)" }}
                >
                  {formatSubscriptionLabel(sub)}
                </button>
              ))}

              <button
                type="button"
                onClick={() => router.push(`/sales?client_id=${selectedClient.id}`)}
                className="w-full rounded-[1.25rem] px-4 py-2.5 text-left text-sm text-[var(--energy)] transition-colors"
                style={{ background: "var(--energy-soft)" }}
              >
                Нет абонемента
              </button>
              <button
                type="button"
                disabled={checkingIn}
                onClick={() => void handleCheckIn(selectedClient, null)}
                className="w-full rounded-[1.25rem] border border-[rgba(248,191,0,0.35)] px-4 py-2.5 text-left text-sm font-semibold text-[#f8bf00] transition-colors disabled:opacity-50"
                style={{ background: "rgba(248,191,0,0.1)" }}
              >
                Отметить вход к оплате
              </button>
            </div>
          )}
        </div>
      )}

      {/* Список посещений сегодня */}
      {overview && overview.visits.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-xs text-[var(--text-muted)]">Сегодня в зале — {overview.total_today}</p>
          <div className="space-y-1 max-h-[180px] overflow-y-auto">
            {overview.visits.map((visit) => {
              const coverageStatus = visit.coverage_status || (visit.subscription_id ? "covered" : "unpaid");
              const subscriptionLabel = getOpenGymSubscriptionLabel(visit);
              const isUnpaid = coverageStatus === "unpaid";

              return (
              <div
                key={visit.id}
                className="rounded-[1rem] px-3 py-2"
                style={{ background: isUnpaid ? "var(--energy-soft)" : "var(--bg-card-soft)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-sm text-[var(--text-main)]">{visit.client_name}</span>
                    {subscriptionLabel && (
                      <span className="min-w-0 truncate border-l border-[var(--line-soft)] pl-2 text-xs text-[var(--text-muted)]">
                        {subscriptionLabel}
                      </span>
                    )}
                    {!visit.subscription_id && (
                      <button
                        type="button"
                        onClick={() => router.push(`/sales?client_id=${visit.client_id}`)}
                        className="shrink-0 inline-flex items-center rounded-full border border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.12)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.22)]"
                      >
                        Нет абонемента
                      </button>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">
                      {new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(
                        new Date(visit.visited_at)
                      )}
                    </span>
                    {canGymAccess && (
                      <button
                        type="button"
                        disabled={deletingVisitId === visit.id}
                        onClick={() => void handleDeleteVisit(visit.id)}
                        title="Удалить визит"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line-soft)] bg-transparent text-[var(--text-muted)] transition-colors hover:border-[rgba(248,81,73,0.3)] hover:text-[var(--danger)] disabled:opacity-50"
                      >
                        {deletingVisitId === visit.id ? (
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="animate-spin">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {overview && overview.visits.length === 0 && (
        <p className="text-xs text-[var(--text-muted)] pt-1">Сегодня входов ещё не было</p>
      )}
    </div>
  );
}
