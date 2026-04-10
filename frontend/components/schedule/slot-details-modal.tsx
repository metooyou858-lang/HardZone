"use client";

import { useEffect, useRef, useState } from "react";

import { describeSubscription, formatClientName } from "@/components/clients/shared";
import {
  addMinutesToTime,
  type BannerState,
  CheckIcon,
  CloseIcon,
  formatDateLabel,
  formatTime,
  getBookingStatusMeta,
  getSlotColor,
  getSlotTypeLabel,
  getSubscriptionOptionLabel,
  parseIsoDate,
  SearchIcon,
  withAlpha,
} from "@/components/schedule/schedule-shared";
import { inputCls, labelCls } from "@/components/warehouse/shared";
import {
  type ClientDetail,
  type ClientListItem,
  fetchClient,
  fetchClients,
  findClientByBarcode,
} from "@/lib/api/clients";
import {
  attendBooking,
  cancelScheduleSlot,
  createBooking,
  fetchScheduleSlot,
  type ScheduleSlotDetail,
} from "@/lib/api/schedule";
export function SlotDetailsModal({
  slotId,
  onClose,
  onEdit,
  onChanged,
  onNotice,
  canManageSchedule,
}: {
  slotId: string | null;
  onClose: () => void;
  onEdit: (slot: ScheduleSlotDetail) => void;
  onChanged: () => void;
  onNotice: (banner: BannerState) => void;
  canManageSchedule: boolean;
}) {
  const [detail, setDetail] = useState<ScheduleSlotDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientListItem[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(null);
  const [selectedClientDetail, setSelectedClientDetail] = useState<ClientDetail | null>(null);
  const [selectedSubscriptionId, setSelectedSubscriptionId] = useState("");
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingActionId, setBookingActionId] = useState<string | null>(null);
  const [cancellingSlot, setCancellingSlot] = useState(false);

  const clientScannerBufferRef = useRef("");
  const clientScannerLastTsRef = useRef(0);

  async function loadDetail(nextId: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetchScheduleSlot(nextId);
      setDetail(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить занятие");
    } finally {
      setLoading(false);
    }
  }

  async function selectClient(client: ClientListItem) {
    setSelectedClient(client);
    setClientError(null);

    try {
      const detailResponse = await fetchClient(client.id);
      const activeSubscriptions = detailResponse.subscriptions.filter((item) => item.status === "active");
      setSelectedClientDetail(detailResponse);
      setSelectedSubscriptionId(activeSubscriptions[0]?.id ?? "");
    } catch (loadError) {
      setClientError(loadError instanceof Error ? loadError.message : "Не удалось загрузить абонементы клиента");
      setSelectedClientDetail(null);
      setSelectedSubscriptionId("");
    }
  }

  async function handleClientBarcode(barcode: string) {
    setClientLoading(true);
    setClientError(null);

    try {
      const client = await findClientByBarcode(barcode);
      await selectClient(client);
    } catch (scanError) {
      setClientError(scanError instanceof Error ? scanError.message : "Клиент по штрихкоду не найден");
    } finally {
      setClientLoading(false);
    }
  }

  useEffect(() => {
    if (!slotId) {
      setDetail(null);
      setClientQuery("");
      setClientResults([]);
      setSelectedClient(null);
      setSelectedClientDetail(null);
      setSelectedSubscriptionId("");
      return;
    }

    void loadDetail(slotId);
  }, [slotId]);

  useEffect(() => {
    if (!slotId) {
      return;
    }

    const trimmedQuery = clientQuery.trim();

    if (trimmedQuery.length < 2) {
      setClientResults([]);
      return;
    }

    let cancelled = false;
    setClientLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const results = await fetchClients({ search: trimmedQuery, limit: 20, offset: 0 });
        if (!cancelled) {
          setClientResults(results);
        }
      } catch (loadError) {
        if (!cancelled) {
          setClientError(loadError instanceof Error ? loadError.message : "Не удалось найти клиентов");
        }
      } finally {
        if (!cancelled) {
          setClientLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientQuery, slotId]);

  if (!slotId) {
    return null;
  }

  const activeSubscriptions = selectedClientDetail?.subscriptions.filter((item) => item.status === "active") ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(5,8,12,0.82)] px-4 py-8">
      <div className="my-4 w-full max-w-4xl rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 shadow-[0_30px_90px_rgba(0,0,0,0.45)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="font-[family:var(--font-heading)] text-[1.9rem] font-semibold leading-none text-[var(--text-main)]">
              Детали занятия
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Записи, посещаемость и действия по слоту</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[var(--bg-card-soft)] text-[var(--text-muted)] shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-all hover:border-[rgba(255,255,255,0.14)] hover:text-[var(--text-main)]"
            aria-label="Закрыть"
          >
            <CloseIcon />
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-[var(--text-muted)]">Загружаем занятие...</div>
        ) : error ? (
          <div className="mt-6 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : detail ? (
          <div className="mt-6">
            <div className="space-y-5">
              <section className="rounded-[28px] border border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,rgba(40,50,78,0.92),rgba(23,30,47,0.98))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--text-muted)]">
                      {formatTime(detail.start_time)} - {addMinutesToTime(detail.start_time, detail.duration_minutes)}
                    </p>
                    <p className="mt-3 text-[1.75rem] font-semibold leading-tight text-[var(--text-main)]">
                      {detail.training_type_name || getSlotTypeLabel(detail.slot_type)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-[var(--text-muted)]">
                        {formatDateLabel(parseIsoDate(detail.date))}
                      </span>
                      <span>•</span>
                      <span>{detail.trainer_name || "Тренер не назначен"}</span>
                      <span>•</span>
                      <span>{detail.booked_count}/{detail.capacity} мест</span>
                    </div>
                  </div>
                  <span
                    className="rounded-full border px-3 py-1.5 text-xs font-medium shadow-[0_10px_24px_rgba(0,0,0,0.16)]"
                    style={{
                      borderColor: withAlpha(getSlotColor(detail), "66", "rgba(0,191,165,0.36)"),
                      backgroundColor: withAlpha(getSlotColor(detail), "1a", "rgba(0,191,165,0.12)"),
                      color: getSlotColor(detail),
                    }}
                  >
                    {getSlotTypeLabel(detail.slot_type)}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-[var(--text-main)] sm:grid-cols-2">
                  <div className="rounded-[20px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,15,25,0.35)] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Услуга</p>
                    <p className="mt-2">{detail.product_name || "Без услуги"}</p>
                  </div>
                  <div className="rounded-[20px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,15,25,0.35)] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Запись</p>
                    <p className="mt-2">
                      {detail.block_if_empty_hours
                        ? `Закрывается за ${detail.block_if_empty_hours} ч. при пустом слоте`
                        : "Без ограничений"}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,15,25,0.35)] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Бесплатное</p>
                    <p className="mt-2">{detail.is_free ? "Да" : "Нет"}</p>
                  </div>
                  <div className="rounded-[20px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,15,25,0.35)] px-4 py-3.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Комментарий</p>
                    <p className="mt-2">{detail.comment || "—"}</p>
                  </div>
                </div>

                {canManageSchedule ? (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[rgba(255,255,255,0.07)] pt-5">
                  <button
                    type="button"
                    onClick={() => onEdit(detail)}
                    className="rounded-[18px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-2.5 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.07)]"
                  >
                    Редактировать
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm("Отменить это занятие и все подтверждённые записи?")) {
                        return;
                      }

                      setCancellingSlot(true);

                      try {
                        await cancelScheduleSlot(detail.id);
                        onChanged();
                        onNotice({ tone: "success", text: "Занятие отменено" });
                        onClose();
                      } catch (cancelError) {
                        onNotice({
                          tone: "error",
                          text: cancelError instanceof Error ? cancelError.message : "Не удалось отменить занятие",
                        });
                      } finally {
                        setCancellingSlot(false);
                      }
                    }}
                    disabled={cancellingSlot}
                    className="rounded-[18px] border border-[rgba(248,81,73,0.24)] px-4 py-2.5 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.12)] disabled:opacity-50"
                  >
                    {cancellingSlot ? "Отменяем..." : "Отменить занятие"}
                  </button>
                </div>
                ) : null}
              </section>

              <section className="rounded-[26px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <SearchIcon />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-[var(--text-main)]">Записать клиента</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Поиск по имени или быстрое сканирование штрихкода клиента
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
                      value={clientQuery}
                      onChange={(event) => {
                        setClientError(null);
                        setClientQuery(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
                          return;
                        }

                        const now = Date.now();

                        if (event.key === "Enter") {
                          const barcode = clientScannerBufferRef.current.trim();
                          const isScannerInput = barcode.length >= 6 && now - clientScannerLastTsRef.current <= 100;
                          clientScannerBufferRef.current = "";
                          clientScannerLastTsRef.current = 0;

                          if (isScannerInput) {
                            event.preventDefault();
                            void handleClientBarcode(barcode);
                          }
                          return;
                        }

                        if (event.key.length === 1) {
                          if (now - clientScannerLastTsRef.current > 100) {
                            clientScannerBufferRef.current = "";
                          }

                          clientScannerBufferRef.current += event.key;
                          clientScannerLastTsRef.current = now;
                        }
                      }}
                      placeholder="Введите ФИО клиента или сканируйте штрихкод..."
                      className={`${inputCls} pl-12`}
                    />
                  </label>
                </div>

                {clientError && (
                  <div className="mt-4 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
                    {clientError}
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  {clientLoading ? (
                    <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                      Ищем клиентов...
                    </div>
                  ) : clientResults.length > 0 ? (
                    clientResults.slice(0, 5).map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => void selectClient(client)}
                        className="w-full rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)] hover:bg-[rgba(0,191,165,0.08)]"
                      >
                        <p className="text-sm font-semibold text-[var(--text-main)]">{formatClientName(client)}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {client.phone || "Телефон не указан"} • {describeSubscription(client)}
                        </p>
                      </button>
                    ))
                  ) : null}
                </div>

                {selectedClient && (
                  <div className="mt-4 rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-main)]">{formatClientName(selectedClient)}</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">{selectedClient.phone || "Телефон не указан"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedClient(null);
                          setSelectedClientDetail(null);
                          setSelectedSubscriptionId("");
                        }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--line-soft)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
                        aria-label="Очистить клиента"
                      >
                        <CloseIcon />
                      </button>
                    </div>

                    <div className="mt-4">
                      <label className={labelCls}>Абонемент для списания</label>
                      <select
                        value={selectedSubscriptionId}
                        onChange={(event) => setSelectedSubscriptionId(event.target.value)}
                        className={`mt-2 ${inputCls}`}
                      >
                        <option value="">Без списания</option>
                        {activeSubscriptions.map((subscription) => (
                          <option key={subscription.id} value={subscription.id}>
                            {getSubscriptionOptionLabel(subscription)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!selectedClient) {
                          return;
                        }

                        setBookingSaving(true);

                        try {
                          await createBooking({
                            slot_id: detail.id,
                            client_id: selectedClient.id,
                            subscription_id: selectedSubscriptionId || null,
                            booked_by: "admin",
                          });
                          setClientQuery("");
                          setClientResults([]);
                          setSelectedClient(null);
                          setSelectedClientDetail(null);
                          setSelectedSubscriptionId("");
                          await loadDetail(detail.id);
                          onChanged();
                          onNotice({ tone: "success", text: "Клиент записан на занятие" });
                        } catch (bookingError) {
                          setClientError(bookingError instanceof Error ? bookingError.message : "Не удалось записать клиента");
                        } finally {
                          setBookingSaving(false);
                        }
                      }}
                      disabled={bookingSaving}
                      className="mt-4 rounded-[18px] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      {bookingSaving ? "Записываем..." : "Записать клиента"}
                    </button>
                  </div>
                )}
              </section>

              <section className="rounded-[26px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[var(--text-main)]">Записанные клиенты</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Все брони по занятию и фиксация посещения прямо по строке клиента
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-1 text-xs text-[var(--text-muted)]">
                    {detail.bookings.length} записей
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {detail.bookings.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-[var(--line-soft)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                      Пока никто не записан
                    </div>
                  ) : (
                    detail.bookings.map((booking) => {
                      const meta = getBookingStatusMeta(booking.status);

                      return (
                        <div
                          key={booking.id}
                          className="rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text-main)]">
                                {booking.client_name || `Клиент #${booking.client_id}`}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                                <span>{booking.client_phone || "Телефон не указан"}</span>
                                <span>•</span>
                                <span>{booking.places_count} мест</span>
                                {booking.client_barcode && (
                                  <>
                                    <span>•</span>
                                    <span>{booking.client_barcode}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-3 py-1 text-xs ${meta.className}`}>{meta.label}</span>
                              {booking.status === "confirmed" && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setBookingActionId(booking.id);

                                    try {
                                      await attendBooking(booking.id);
                                      await loadDetail(detail.id);
                                      onChanged();
                                      onNotice({ tone: "success", text: "Посещение отмечено" });
                                    } catch (attendError) {
                                      onNotice({
                                        tone: "error",
                                        text: attendError instanceof Error ? attendError.message : "Не удалось отметить посещение",
                                      });
                                    } finally {
                                      setBookingActionId(null);
                                    }
                                  }}
                                  disabled={bookingActionId === booking.id}
                                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.1)] px-3 py-1.5 text-xs font-medium text-[var(--success)] transition-colors hover:bg-[rgba(63,185,80,0.16)] disabled:opacity-50"
                                >
                                  <CheckIcon />
                                  {bookingActionId === booking.id ? "Фиксируем..." : "Зафиксировать посещение"}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

