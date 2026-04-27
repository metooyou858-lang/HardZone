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
  return (
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
            <span>
              {detail.booked_count}/{detail.capacity} мест
            </span>
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

      {(canEdit || canCancel) ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[rgba(255,255,255,0.07)] pt-5">
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit(detail)}
              className="rounded-[18px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] px-4 py-2.5 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.07)]"
            >
              Редактировать
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => void onCancel()}
              disabled={cancellingSlot}
              className="rounded-[18px] border border-[rgba(248,81,73,0.24)] px-4 py-2.5 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.12)] disabled:opacity-50"
            >
              {cancellingSlot ? "Отменяем..." : "Отменить занятие"}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
