import { ClockIcon, DoorIcon } from "@/components/schedule/gym-access-shared";

type GymOverviewCardProps = {
  eyebrow: string;
  openLabel: string;
  closedLabel: string;
  inHoursLabel: string;
  outsideHoursLabel: string;
  totalTodayLabel: string;
  currentTimeLabel: string;
  fallbackTodayLabel: string;
  todayLabel: string;
  isOpenNow: boolean;
  openTime: string;
  closeTime: string;
  totalToday: number;
  currentTime: string;
};

export function GymOverviewCard({
  eyebrow,
  openLabel,
  closedLabel,
  inHoursLabel,
  outsideHoursLabel,
  totalTodayLabel,
  currentTimeLabel,
  fallbackTodayLabel,
  todayLabel,
  isOpenNow,
  openTime,
  closeTime,
  totalToday,
  currentTime,
}: GymOverviewCardProps) {
  return (
    <div className="rounded-[30px] border border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(0,191,165,0.16),rgba(13,17,23,0.18))] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">{eyebrow}</p>
          <p className="mt-3 text-2xl font-semibold text-[var(--text-main)]">{isOpenNow ? openLabel : closedLabel}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {todayLabel || fallbackTodayLabel} - {openTime} - {closeTime}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            isOpenNow
              ? "border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]"
              : "border-[rgba(248,81,73,0.24)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]"
          }`}
        >
          {isOpenNow ? inHoursLabel : outsideHoursLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,15,25,0.26)] px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.06)] text-[var(--accent)]">
              <DoorIcon />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">{totalTodayLabel}</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text-main)]">{totalToday}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-[rgba(255,255,255,0.08)] bg-[rgba(10,15,25,0.26)] px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(255,255,255,0.06)] text-[var(--accent)]">
              <ClockIcon />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">{currentTimeLabel}</p>
              <p className="mt-1 text-xl font-semibold text-[var(--text-main)]">{currentTime}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
