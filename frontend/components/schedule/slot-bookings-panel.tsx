"use client";

import Link from "next/link";

import type { ScheduleBooking } from "@/lib/api/schedule";

const coverageLabels: Record<string, string> = {
  pending: "Ожидает",
  covered: "Списано",
  unpaid: "К оплате",
  comped: "Без списания",
  not_required: "Не требуется",
};

function formatDate(value?: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString("ru-RU");
}

function getSubscriptionSourceLabel(booking: ScheduleBooking, coverageStatus: string) {
  if (booking.covered_by_booking_id) {
    return "Оплачено сплитом";
  }

  if (coverageStatus === "comped") {
    return "Без списания";
  }

  if (coverageStatus === "not_required") {
    return "Списание не требуется";
  }

  if (!booking.subscription_id) {
    return coverageStatus === "unpaid" ? "Абонемент не определен" : null;
  }

  const title = booking.subscription_product_name || "Абонемент";
  const visits =
    booking.subscription_visits_total === null || booking.subscription_visits_total === undefined
      ? null
      : `${booking.subscription_visits_left ?? 0}/${booking.subscription_visits_total}`;
  const expiresAt = formatDate(booking.subscription_expires_at);
  const details = [visits ? `${visits} занятий` : null, expiresAt ? `до ${expiresAt}` : null].filter(Boolean).join(" · ");
  const prefix =
    coverageStatus === "covered"
      ? "Списано"
      : coverageStatus === "pending"
        ? "Запланировано"
        : coverageStatus === "unpaid"
          ? "Не списано"
          : coverageLabels[coverageStatus] || coverageStatus;

  return `${prefix}: ${title}${details ? ` · ${details}` : ""}`;
}

function CircleCheckBtn({
  onClick,
  disabled,
  loading,
  danger,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
        danger
          ? "border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.08)] text-[var(--danger)] hover:bg-[rgba(248,81,73,0.18)]"
          : "border-[rgba(63,185,80,0.3)] bg-[rgba(63,185,80,0.08)] text-[var(--success)] hover:bg-[rgba(63,185,80,0.18)]"
      }`}
    >
      {loading ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="animate-spin">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function CircleXBtn({
  onClick,
  disabled,
  loading,
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-soft)] bg-[var(--bg-card-soft)] text-[var(--text-muted)] transition-colors hover:border-[rgba(248,81,73,0.3)] hover:text-[var(--danger)] disabled:opacity-50"
    >
      {loading ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="animate-spin">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

type SlotBookingsPanelProps = {
  bookings: ScheduleBooking[];
  bookingActionId: string | null;
  canManageAttendance: boolean;
  canManageClients: boolean;
  onAttend: (bookingId: string) => void | Promise<void>;
  onUnattend: (bookingId: string) => void | Promise<void>;
  onCancel: (bookingId: string) => void | Promise<void>;
  onResolveUnpaid?: (booking: ScheduleBooking) => void | Promise<void>;
};

export function SlotBookingsPanel({
  bookings,
  bookingActionId,
  canManageAttendance,
  canManageClients,
  onAttend,
  onUnattend,
  onCancel,
  onResolveUnpaid,
}: SlotBookingsPanelProps) {
  return (
    <section className="rounded-[26px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-[var(--text-main)]">Записанные клиенты</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Все брони по занятию и фиксация посещения прямо по строке клиента
          </p>
        </div>
        <span className="rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-1 text-xs text-[var(--text-muted)]">
          {bookings.filter((b) => b.status !== "cancelled").length} записей
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {bookings.filter((b) => b.status !== "cancelled").length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[var(--line-soft)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
            Пока никто не записан
          </div>
        ) : (
          bookings.filter((b) => b.status !== "cancelled").map((booking) => {
            const isActing = bookingActionId === booking.id;
            const isCoveredPartner = !!booking.covered_by_booking_id;
            const coverageStatus = booking.coverage_status || (booking.subscription_id || isCoveredPartner ? "covered" : "unpaid");
            const subscriptionSourceLabel = getSubscriptionSourceLabel(booking, coverageStatus);
            const attendedOk = booking.status === "attended" && ["covered", "not_required", "comped"].includes(coverageStatus);
            const attendedNoSub = booking.status === "attended" && coverageStatus === "unpaid";

            const rowClass = attendedOk
              ? "rounded-[22px] border border-[rgba(63,185,80,0.3)] bg-[rgba(63,185,80,0.08)] px-4 py-4"
              : attendedNoSub
              ? "rounded-[22px] border border-[rgba(248,81,73,0.3)] bg-[rgba(248,81,73,0.08)] px-4 py-4"
              : "rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-4";

            return (
              <div key={booking.id} className={rowClass}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                      <Link
                        href={`/clients/${booking.client_id}`}
                        className="truncate text-sm font-semibold text-[var(--text-main)] transition-colors hover:text-[var(--accent)]"
                        title="Открыть карточку клиента"
                      >
                        {booking.client_name || `Клиент #${booking.client_id}`}
                      </Link>
                      {isCoveredPartner && (
                        <span className="shrink-0 inline-flex items-center rounded-full border border-[rgba(0,191,165,0.3)] bg-[rgba(0,191,165,0.1)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                          Сплит
                        </span>
                      )}
                      <span
                        className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${
                          coverageStatus === "unpaid"
                            ? "border-[rgba(248,191,0,0.35)] bg-[rgba(248,191,0,0.12)] text-[#f8bf00]"
                            : coverageStatus === "covered"
                              ? "border-[rgba(63,185,80,0.3)] bg-[rgba(63,185,80,0.1)] text-[var(--success)]"
                              : "border-[var(--line-soft)] bg-[var(--bg-card-soft)] text-[var(--text-muted)]"
                        }`}
                      >
                        {coverageLabels[coverageStatus] || coverageStatus}
                      </span>
                    </div>
                    {subscriptionSourceLabel && (
                      <p className="text-xs text-[var(--text-muted)]">{subscriptionSourceLabel}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {["confirmed", "missed"].includes(booking.status) && canManageAttendance && (
                      <>
                        <CircleCheckBtn
                          onClick={() => void onAttend(booking.id)}
                          disabled={isActing}
                          loading={isActing}
                          danger={coverageStatus === "unpaid" && !booking.subscription_id}
                          title={
                            isCoveredPartner
                              ? "Пришёл (сплит — оплачено партнёром)"
                              : coverageStatus === "unpaid" && !booking.subscription_id
                                ? "Пришёл — отметить к оплате без списания"
                                : "Пришёл — проверить и списать, если абонемент действует"
                          }
                        />
                        {coverageStatus === "unpaid" && !booking.subscription_id && (
                          <button
                            type="button"
                            onClick={() => void onResolveUnpaid?.(booking)}
                            disabled={isActing}
                            className="shrink-0 inline-flex items-center rounded-2xl border border-[rgba(248,191,0,0.4)] bg-[rgba(248,191,0,0.12)] px-3 py-1.5 text-xs font-semibold text-[#f8bf00] transition-colors hover:bg-[rgba(248,191,0,0.22)] disabled:opacity-50"
                          >
                            Не оплачено
                          </button>
                        )}
                        {booking.status === "confirmed" && canManageClients && (
                          <CircleXBtn
                            onClick={() => void onCancel(booking.id)}
                            disabled={isActing}
                            loading={false}
                            title="Отменить запись"
                          />
                        )}
                      </>
                    )}

                    {booking.status === "attended" && canManageAttendance && (
                      <>
                        {coverageStatus === "unpaid" && (
                          <button
                            type="button"
                            onClick={() => void onResolveUnpaid?.(booking)}
                            disabled={isActing}
                            className="shrink-0 inline-flex items-center rounded-2xl border border-[rgba(248,191,0,0.4)] bg-[rgba(248,191,0,0.12)] px-3 py-1.5 text-xs font-semibold text-[#f8bf00] transition-colors hover:bg-[rgba(248,191,0,0.22)] disabled:opacity-50"
                          >
                            Не оплачено
                          </button>
                        )}
                        <CircleXBtn
                          onClick={() => void onUnattend(booking.id)}
                          disabled={isActing}
                          loading={isActing}
                          title="Удалить строку и вернуть визит"
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
