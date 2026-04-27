import { inputCls, labelCls } from "@/components/warehouse/shared";
import type { GymHour } from "@/lib/api/schedule";

type GymHoursSectionProps = {
  title: string;
  subtitle: string;
  saveLabel: string;
  helperText: string | null;
  openLabel: string;
  openTimeLabel: string;
  closeTimeLabel: string;
  closedLabel: string;
  weekdayLabels: Record<number, string>;
  hours: GymHour[];
  canManageHours: boolean;
  savingHours: boolean;
  formatTimeValue: (value: string | null) => string;
  onSave: () => void | Promise<void>;
  onToggleOpen: (dayOfWeek: number, isOpen: boolean) => void;
  onTimeChange: (dayOfWeek: number, field: "open_time" | "close_time", value: string) => void;
};

export function GymHoursSection({
  title,
  subtitle,
  saveLabel,
  helperText,
  openLabel,
  openTimeLabel,
  closeTimeLabel,
  closedLabel,
  weekdayLabels,
  hours,
  canManageHours,
  savingHours,
  formatTimeValue,
  onSave,
  onToggleOpen,
  onTimeChange,
}: GymHoursSectionProps) {
  return (
    <section className="rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-[var(--text-main)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => void onSave()}
          hidden={!canManageHours}
          disabled={savingHours || !canManageHours}
          className="rounded-[18px] bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
        >
          {saveLabel}
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {hours.map((day) => (
          <div
            key={day.day_of_week}
            className="grid gap-3 rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4 lg:grid-cols-[180px_140px_1fr_1fr]"
          >
            <div>
              <p className="text-sm font-semibold text-[var(--text-main)]">{weekdayLabels[day.day_of_week]}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {day.is_open ? `${formatTimeValue(day.open_time)} - ${formatTimeValue(day.close_time)}` : closedLabel}
              </p>
            </div>

            <label className="inline-flex items-center gap-3 text-sm text-[var(--text-main)]">
              <input
                type="checkbox"
                checked={day.is_open}
                onChange={(event) => onToggleOpen(day.day_of_week, event.target.checked)}
                disabled={!canManageHours}
              />
              {openLabel}
            </label>

            <label className="block">
              <span className={labelCls}>{openTimeLabel}</span>
              <input
                type="time"
                value={day.open_time ? day.open_time.slice(0, 5) : ""}
                onChange={(event) => onTimeChange(day.day_of_week, "open_time", event.target.value)}
                disabled={!day.is_open || !canManageHours}
                className={`mt-2 ${inputCls}`}
              />
            </label>

            <label className="block">
              <span className={labelCls}>{closeTimeLabel}</span>
              <input
                type="time"
                value={day.close_time ? day.close_time.slice(0, 5) : ""}
                onChange={(event) => onTimeChange(day.day_of_week, "close_time", event.target.value)}
                disabled={!day.is_open || !canManageHours}
                className={`mt-2 ${inputCls}`}
              />
            </label>
          </div>
        ))}
      </div>

      {helperText ? <p className="mt-4 text-sm text-[var(--text-muted)]">{helperText}</p> : null}
    </section>
  );
}
