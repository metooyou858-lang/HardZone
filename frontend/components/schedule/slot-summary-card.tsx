"use client";

import type { ScheduleSlotDetail } from "@/lib/api/schedule";
import {
  addMinutesToTime,
  formatDateLabel,
  formatTime,
  getSlotColor,
  getSlotTypeLabel,
  parseIsoDate,
  withAlpha,
} from "@/components/schedule/schedule-shared";

type SlotSummaryCardProps = {
  detail: ScheduleSlotDetail;
  canEdit: boolean;
  canCancel: boolean;
  cancellingSlot: boolean;
  onEdit: (slot: ScheduleSlotDetail) => void;
  onCancel: () => void | Promise<void>;
};

export function SlotSummaryCard({
  detail,
  canEdit,
  canCancel,
  cancellingSlot,
  onEdit,
  onCancel,
}: SlotSummaryCardProps) {
  const hasActions = canEdit || canCancel;

  return (
    <section className="rounded-[28px] border border-[rgba(255,255,255,0.07)] bg-[linear-gradient(180deg,rgba(40,50,78,0.92),rgba(23,30,47,0.98))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.24)]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--text-muted)]">
                {formatTime(detail.start_time)} - {addMinutesToTime(detail.start_time, detail.duration_minutes)}
              </p>
              <p className="mt-3 text-[1.75rem] font-semibold leading-tight text-[var(--text-main)]">
                {detail.training_type_name || getSlotTypeLabel(detail.slot_type)}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium shadow-[0_10px_24px_rgba(0,0,0,0.16)]"
              style={{
                borderColor: withAlpha(getSlotColor(detail), "66", "rgba(0,191,165,0.36)"),
                backgroundColor: withAlpha(getSlotColor(detail), "1a", "rgba(0,191,165,0.12)"),
                color: getSlotColor(detail),
              }}
            >
              {getSlotTypeLabel(detail.slot_type)}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[var(--text-main)]">
            <span className="rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-[var(--text-muted)]">
              {formatDateLabel(parseIsoDate(detail.date))}
            </span>
            <span className="text-[var(--text-muted)]">•</span>
            <span>{detail.trainer_name || "Тренер не назначен"}</span>
            <span className="text-[var(--text-muted)]">•</span>
            <span>
              {detail.booked_count}/{detail.capacity} мест
            </span>
          </div>
        </div>

        {hasActions ? (
          <div className="flex w-full flex-col gap-2 border-t border-[rgba(255,255,255,0.07)] pt-4 sm:flex-row lg:w-[190px] lg:flex-col lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(detail)}
                className="inline-flex h-11 w-full items-center justify-center rounded-[16px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 text-sm font-medium text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.07)]"
              >
                Редактировать
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={() => void onCancel()}
                disabled={cancellingSlot}
                className="inline-flex h-11 w-full items-center justify-center rounded-[16px] border border-[rgba(248,81,73,0.24)] px-4 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.12)] disabled:opacity-50"
              >
                {cancellingSlot ? "Отменяем..." : "Отменить занятие"}
              </button>
            )}
          </div>
        ) : null}
      </div>

      {detail.block_if_empty_hours ? (
        <div className="mt-4 rounded-[18px] border border-[rgba(255,255,255,0.07)] bg-[rgba(10,15,25,0.28)] px-4 py-3 text-sm text-[var(--text-muted)]">
          Запись закрывается за {detail.block_if_empty_hours} ч. при пустом слоте
        </div>
      ) : null}
    </section>
  );
}
