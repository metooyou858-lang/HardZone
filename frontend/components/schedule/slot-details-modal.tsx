"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { useRouter } from "next/navigation";

import { CloseIcon, type BannerState } from "@/components/schedule/schedule-shared";
import { SlotBookingForm } from "@/components/schedule/slot-booking-form";
import { SlotBookingsPanel } from "@/components/schedule/slot-bookings-panel";
import { SlotSummaryCard } from "@/components/schedule/slot-summary-card";
import {
  type ClientDetail,
  type ClientListItem,
  fetchClient,
  fetchClients,
  findClientByBarcode,
} from "@/lib/api/clients";
import {
  attachEligibleSubscriptionToBooking,
  attendBooking,
  cancelBooking,
  cancelScheduleSlot,
  createBooking,
  fetchScheduleSlot,
  unattendBooking,
  type ScheduleSlotDetail,
  type ScheduleBooking,
} from "@/lib/api/schedule";

export function SlotDetailsModal({
  slotId,
  onClose,
  onEdit,
  onChanged,
  onNotice,
  canEditSchedule,
  canCancelSlot,
  canManageClients,
  canManageAttendance,
}: {
  slotId: string | null;
  onClose: () => void;
  onEdit: (slot: ScheduleSlotDetail) => void;
  onChanged: () => void;
  onNotice: (banner: BannerState) => void;
  canEditSchedule: boolean;
  canCancelSlot: boolean;
  canManageClients: boolean;
  canManageAttendance: boolean;
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

  // сплит-партнёр
  const [partnerEnabled, setPartnerEnabled] = useState(false);
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerResults, setPartnerResults] = useState<ClientListItem[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<ClientListItem | null>(null);

  const router = useRouter();
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

  function handleClientSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
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
  }

  function resetPartner() {
    setPartnerEnabled(false);
    setPartnerQuery("");
    setPartnerResults([]);
    setSelectedPartner(null);
    setPartnerError(null);
  }

  async function handleCreateBooking() {
    if (!detail || !selectedClient) {
      return;
    }

    setBookingSaving(true);

    try {
      const primaryBooking = await createBooking({
        slot_id: detail.id,
        client_id: selectedClient.id,
        subscription_id: selectedSubscriptionId || null,
        booked_by: "admin",
      });

      if (partnerEnabled && selectedPartner) {
        await createBooking({
          slot_id: detail.id,
          client_id: selectedPartner.id,
          subscription_id: null,
          booked_by: "admin",
          covered_by_booking_id: primaryBooking.id,
        });
      }

      setClientQuery("");
      setClientResults([]);
      setSelectedClient(null);
      setSelectedClientDetail(null);
      setSelectedSubscriptionId("");
      resetPartner();

      await loadDetail(detail.id);
      onChanged();
      onNotice({
        tone: "success",
        text: partnerEnabled && selectedPartner ? "Оба клиента записаны на занятие" : "Клиент записан на занятие",
      });
    } catch (bookingError) {
      setClientError(bookingError instanceof Error ? bookingError.message : "Не удалось записать клиента");
    } finally {
      setBookingSaving(false);
    }
  }

  async function handleCreateUnpaidBooking() {
    if (!detail || !selectedClient) {
      return;
    }

    setBookingSaving(true);

    try {
      await createBooking({
        slot_id: detail.id,
        client_id: selectedClient.id,
        subscription_id: null,
        allow_unpaid: true,
        unpaid_reason: "no_subscription",
        booked_by: "admin",
      });

      setClientQuery("");
      setClientResults([]);
      setSelectedClient(null);
      setSelectedClientDetail(null);
      setSelectedSubscriptionId("");
      resetPartner();

      await loadDetail(detail.id);
      onChanged();
      onNotice({ tone: "info", text: "Клиент записан к оплате" });
    } catch (bookingError) {
      setClientError(bookingError instanceof Error ? bookingError.message : "Не удалось записать клиента");
    } finally {
      setBookingSaving(false);
    }
  }

  async function handleAttendBooking(bookingId: string) {
    if (!detail) {
      return;
    }

    setBookingActionId(bookingId);

    try {
      await attendBooking(bookingId);
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
  }

  async function handleUnattendBooking(bookingId: string) {
    if (!detail) {
      return;
    }

    setBookingActionId(bookingId);

    try {
      await unattendBooking(bookingId);
      await loadDetail(detail.id);
      onChanged();
      onNotice({ tone: "success", text: "Запись удалена, визит возвращён" });
    } catch (unattendError) {
      onNotice({
        tone: "error",
        text: unattendError instanceof Error ? unattendError.message : "Не удалось отменить отметку",
      });
    } finally {
      setBookingActionId(null);
    }
  }

  async function handleCancelBooking(bookingId: string) {
    if (!detail) {
      return;
    }

    if (!window.confirm("Отменить запись клиента?")) {
      return;
    }

    setBookingActionId(bookingId);

    try {
      await cancelBooking(bookingId);
      await loadDetail(detail.id);
      onChanged();
      onNotice({ tone: "success", text: "Запись отменена" });
    } catch (cancelError) {
      onNotice({
        tone: "error",
        text: cancelError instanceof Error ? cancelError.message : "Не удалось отменить запись",
      });
    } finally {
      setBookingActionId(null);
    }
  }

  async function handleResolveUnpaidBooking(booking: ScheduleBooking) {
    if (!detail) {
      return;
    }

    setBookingActionId(booking.id);

    try {
      const result = await attachEligibleSubscriptionToBooking(booking.id);
      if (result.attached) {
        await loadDetail(detail.id);
        onChanged();
        onNotice({ tone: "success", text: "Абонемент найден и привязан к записи" });
        return;
      }

      onClose();
      router.push(`/sales?client_id=${booking.client_id}`);
    } catch (resolveError) {
      onNotice({
        tone: "error",
        text: resolveError instanceof Error ? resolveError.message : "Не удалось проверить абонемент",
      });
    } finally {
      setBookingActionId(null);
    }
  }

  async function handleCancelSlot() {
    if (!detail) {
      return;
    }

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
  }

  useEffect(() => {
    if (!slotId) {
      setDetail(null);
      setClientQuery("");
      setClientResults([]);
      setSelectedClient(null);
      setSelectedClientDetail(null);
      setSelectedSubscriptionId("");
      resetPartner();
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

  useEffect(() => {
    if (!slotId || !partnerEnabled) {
      return;
    }

    const trimmedQuery = partnerQuery.trim();

    if (trimmedQuery.length < 2) {
      setPartnerResults([]);
      return;
    }

    let cancelled = false;
    setPartnerLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        const results = await fetchClients({ search: trimmedQuery, limit: 20, offset: 0 });
        if (!cancelled) {
          setPartnerResults(results);
        }
      } catch (loadError) {
        if (!cancelled) {
          setPartnerError(loadError instanceof Error ? loadError.message : "Не удалось найти клиентов");
        }
      } finally {
        if (!cancelled) {
          setPartnerLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [partnerQuery, slotId, partnerEnabled]);

  useEffect(() => {
    if (!slotId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [slotId, onClose]);

  if (!slotId) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(5,8,12,0.82)] px-4 py-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="my-4 w-full max-w-4xl rounded-[2.5rem] p-5 sm:p-6"
        style={{ background: "var(--bg-card)", boxShadow: "0 30px 90px rgba(0,0,0,0.5)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
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
          <div className="mt-6 space-y-5">
            <SlotSummaryCard
              detail={detail}
              canEdit={canEditSchedule}
              canCancel={canCancelSlot}
              cancellingSlot={cancellingSlot}
              onEdit={onEdit}
              onCancel={handleCancelSlot}
            />

            {canManageClients && (
              <SlotBookingForm
                clientQuery={clientQuery}
                clientResults={clientResults}
                clientLoading={clientLoading}
                clientError={clientError}
                selectedClient={selectedClient}
                selectedClientDetail={selectedClientDetail}
                selectedSubscriptionId={selectedSubscriptionId}
                bookingSaving={bookingSaving}
                slotType={detail.slot_type}
                slotTrainingTypeId={detail.training_type_id}
                allowPartner={detail.slot_type === "personal" && detail.capacity > 1}
                partnerEnabled={partnerEnabled}
                partnerQuery={partnerQuery}
                partnerResults={partnerResults}
                partnerLoading={partnerLoading}
                partnerError={partnerError}
                selectedPartner={selectedPartner}
                onTogglePartner={() => {
                  setPartnerEnabled((v) => !v);
                  setPartnerQuery("");
                  setPartnerResults([]);
                  setSelectedPartner(null);
                  setPartnerError(null);
                }}
                onPartnerQueryChange={(value) => {
                  setPartnerError(null);
                  setPartnerQuery(value);
                }}
                onSelectPartner={(c) => {
                  setSelectedPartner(c);
                  setPartnerQuery("");
                  setPartnerResults([]);
                }}
                onClearPartner={() => setSelectedPartner(null)}
                onClientQueryChange={(value) => {
                  setClientError(null);
                  setClientQuery(value);
                }}
                onClientSearchKeyDown={handleClientSearchKeyDown}
                onSelectClient={selectClient}
                onClearClient={() => {
                  setSelectedClient(null);
                  setSelectedClientDetail(null);
                  setSelectedSubscriptionId("");
                }}
                onSubscriptionChange={setSelectedSubscriptionId}
                onCreateBooking={handleCreateBooking}
                onCreateUnpaidBooking={handleCreateUnpaidBooking}
              />
            )}

            <SlotBookingsPanel
              bookings={detail.bookings}
              bookingActionId={bookingActionId}
              canManageAttendance={canManageAttendance}
              canManageClients={canManageClients}
              onAttend={handleAttendBooking}
              onUnattend={handleUnattendBooking}
              onCancel={handleCancelBooking}
              onResolveUnpaid={handleResolveUnpaidBooking}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
