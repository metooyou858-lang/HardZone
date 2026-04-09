"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { describeSubscription, formatClientName } from "@/components/clients/shared";
import { inputCls, labelCls } from "@/components/warehouse/shared";
import { ClientListItem, fetchClients, findClientByBarcode } from "@/lib/api/clients";
import { checkInOpenGym, fetchGymOverview, GymHour, GymOverview, saveGymHours } from "@/lib/api/schedule";

type BannerTone = "info" | "success" | "error";

const weekdayLabels: Record<number, string> = {
  1: "Понедельник",
  2: "Вторник",
  3: "Среда",
  4: "Четверг",
  5: "Пятница",
  6: "Суббота",
  7: "Воскресенье",
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M8.75 15a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM17.5 17.5l-4.375-4.375"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DoorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path d="M7.5 3.75h5A1.25 1.25 0 0 1 13.75 5v10a1.25 1.25 0 0 1-1.25 1.25h-5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.75 10H5.417m0 0 2.083-2.083M5.417 10l2.083 2.083" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <circle cx="10" cy="10" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.667v3.75l2.5 1.666" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatTimeValue(value: string | null) {
  if (!value) {
    return "—";
  }

  return value.slice(0, 5);
}

function formatVisitedAt(value: string) {
  return new Intl.DateTimeFormat("ru", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export function GymAccessPanel({
  canManageHours = true,
  onNotice,
}: {
  canManageHours?: boolean;
  onNotice: (notice: { tone: BannerTone; text: string }) => void;
}) {
  const [overview, setOverview] = useState<GymOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingHours, setSavingHours] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [hoursForm, setHoursForm] = useState<GymHour[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ClientListItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const scannerBufferRef = useRef("");
  const scannerLastTsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    fetchGymOverview()
      .then((response) => {
        if (!cancelled) {
          setOverview(response);
          setHoursForm(response.hours);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          onNotice({
            tone: "error",
            text: error instanceof Error ? error.message : "Не удалось загрузить данные по залу",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetchClients({ search: trimmed, limit: 20, offset: 0 });
        if (!cancelled) {
          setResults(response);
          setSearchError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setSearchError(error instanceof Error ? error.message : "Не удалось найти клиентов");
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const todayLabel = useMemo(() => {
    if (!overview?.today?.current_date) {
      return "";
    }

    return new Intl.DateTimeFormat("ru", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(`${overview.today.current_date}T00:00:00`));
  }, [overview?.today?.current_date]);

  async function reloadOverview() {
    const response = await fetchGymOverview();
    setOverview(response);
    setHoursForm(response.hours);
  }

  async function handleCheckIn(client: ClientListItem) {
    setCheckingInId(client.id);

    try {
      const response = await checkInOpenGym({
        client_id: client.id,
        created_by: "admin",
      });

      setOverview((previous) =>
        previous
          ? {
              ...previous,
              today: response.today,
              visits: response.visits,
              total_today: response.total_today,
            }
          : null
      );
      setQuery("");
      setResults([]);
      setSearchError(null);
      onNotice({
        tone: response.within_hours ? "success" : "info",
        text: response.within_hours
          ? `${formatClientName(client)} отмечен в зале`
          : `${formatClientName(client)} отмечен в зале. Сейчас время вне расписания`,
      });
    } catch (error) {
      onNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось отметить вход в зал",
      });
    } finally {
      setCheckingInId(null);
    }
  }

  async function handleBarcode(barcode: string) {
    try {
      const client = await findClientByBarcode(barcode);
      await handleCheckIn(client);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Клиент по штрихкоду не найден");
    }
  }

  if (loading) {
    return (
      <div className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
        Загружаем часы работы и посещения зала...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <section className="rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-[var(--text-main)]">Часы работы зала</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Настройка открытых дней и времени для свободного посещения
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                setSavingHours(true);
                try {
                  const response = await saveGymHours(hoursForm);
                  setOverview(response);
                  setHoursForm(response.hours);
                  onNotice({ tone: "success", text: "Часы работы зала сохранены" });
                } catch (error) {
                  onNotice({
                    tone: "error",
                    text: error instanceof Error ? error.message : "Не удалось сохранить часы работы",
                  });
                } finally {
                  setSavingHours(false);
                }
              }}
              hidden={!canManageHours}
              disabled={savingHours || !canManageHours}
              className="rounded-[18px] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
            >
              {savingHours ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {hoursForm.map((day) => (
              <div
                key={day.day_of_week}
                className="grid gap-3 rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4 lg:grid-cols-[180px_140px_1fr_1fr]"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-main)]">{weekdayLabels[day.day_of_week]}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {day.is_open
                      ? `${formatTimeValue(day.open_time)} – ${formatTimeValue(day.close_time)}`
                      : "Выходной"}
                  </p>
                </div>

                <label className="inline-flex items-center gap-3 text-sm text-[var(--text-main)]">
                  <input
                    type="checkbox"
                    checked={day.is_open}
                    onChange={(event) =>
                      setHoursForm((previous) =>
                        previous.map((item) =>
                          item.day_of_week === day.day_of_week
                            ? {
                                ...item,
                                is_open: event.target.checked,
                                open_time: event.target.checked ? item.open_time || "06:00:00" : null,
                                close_time: event.target.checked ? item.close_time || "22:00:00" : null,
                              }
                            : item
                        )
                      )
                    }
                    disabled={!canManageHours}
                    />
                  Открыто
                </label>

                <label className="block">
                  <span className={labelCls}>Открытие</span>
                  <input
                    type="time"
                    value={day.open_time ? day.open_time.slice(0, 5) : ""}
                    onChange={(event) =>
                      setHoursForm((previous) =>
                        previous.map((item) =>
                          item.day_of_week === day.day_of_week
                            ? { ...item, open_time: event.target.value ? `${event.target.value}:00` : null }
                            : item
                        )
                      )
                    }
                    disabled={!day.is_open || !canManageHours}
                    className={`mt-2 ${inputCls}`}
                  />
                </label>

                <label className="block">
                  <span className={labelCls}>Закрытие</span>
                  <input
                    type="time"
                    value={day.close_time ? day.close_time.slice(0, 5) : ""}
                    onChange={(event) =>
                      setHoursForm((previous) =>
                        previous.map((item) =>
                          item.day_of_week === day.day_of_week
                            ? { ...item, close_time: event.target.value ? `${event.target.value}:00` : null }
                            : item
                        )
                      )
                    }
                    disabled={!day.is_open || !canManageHours}
                    className={`mt-2 ${inputCls}`}
                  />
                </label>
              </div>
            ))}
          </div>
          {!canManageHours ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">Тренер может отмечать вход в зал, но не менять часы работы.</p>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="rounded-[30px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(0,191,165,0.16),rgba(13,17,23,0.18))] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">Зал сейчас</p>
                <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">
                  {overview?.today?.is_open_now ? "Открыт" : "Закрыт"}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {todayLabel || "Сегодня"} • {formatTimeValue(overview?.today?.open_time ?? null)} –{" "}
                  {formatTimeValue(overview?.today?.close_time ?? null)}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  overview?.today?.is_open_now
                    ? "border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]"
                    : "border-[rgba(248,81,73,0.24)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]"
                }`}
              >
                {overview?.today?.is_open_now ? "В рабочее время" : "Вне расписания"}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,15,25,0.26)] px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.06)] text-[var(--accent)]">
                    <DoorIcon />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Входов сегодня</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--text-main)]">{overview?.total_today ?? 0}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,15,25,0.26)] px-4 py-4">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.06)] text-[var(--accent)]">
                    <ClockIcon />
                  </span>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Текущее время</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--text-main)]">
                      {formatTimeValue(overview?.today?.current_time ?? null)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <SearchIcon />
              </span>
              <div>
                <p className="text-lg font-semibold text-[var(--text-main)]">Отметить вход в зал</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Найдите клиента по имени или быстро отсканируйте его штрихкод
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="relative block">
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--text-muted)]">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearchError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
                      return;
                    }

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
                      if (now - scannerLastTsRef.current > 100) {
                        scannerBufferRef.current = "";
                      }

                      scannerBufferRef.current += event.key;
                      scannerLastTsRef.current = now;
                    }
                  }}
                  placeholder="Введите ФИО клиента или сканируйте штрихкод..."
                  className={`${inputCls} pl-12`}
                />
              </label>
            </div>

            {searchError && (
              <div className="mt-4 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
                {searchError}
              </div>
            )}

            <div className="mt-4 space-y-3">
              {searching ? (
                <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                  Ищем клиентов...
                </div>
              ) : results.length > 0 ? (
                results.slice(0, 6).map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center justify-between gap-3 rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-main)]">{formatClientName(client)}</p>
                      <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
                        {client.phone || "Телефон не указан"} • {describeSubscription(client)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCheckIn(client)}
                      disabled={checkingInId === client.id}
                      className="shrink-0 rounded-[16px] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      {checkingInId === client.id ? "Отмечаем..." : "Отметить вход"}
                    </button>
                  </div>
                ))
              ) : query.trim().length >= 2 ? (
                <div className="rounded-[20px] border border-dashed border-[var(--line-soft)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                  Клиенты не найдены
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-[var(--text-main)]">Посещения зала сегодня</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Все отметки свободного посещения за текущий день</p>
          </div>
          <button
            type="button"
            onClick={() => void reloadOverview()}
            className="rounded-[16px] border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
          >
            Обновить
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {(overview?.visits ?? []).length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[var(--line-soft)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              Сегодня входы в зал ещё не фиксировались
            </div>
          ) : (
            overview?.visits.map((visit) => (
              <div
                key={visit.id}
                className="flex flex-col gap-2 rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--text-main)]">{visit.client_name}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                    <span>{visit.client_phone || "Телефон не указан"}</span>
                    {visit.client_barcode && (
                      <>
                        <span>•</span>
                        <span>{visit.client_barcode}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-sm text-[var(--text-muted)]">{formatVisitedAt(visit.visited_at)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
