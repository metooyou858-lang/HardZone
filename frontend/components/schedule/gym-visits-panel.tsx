import type { OpenGymVisit } from "@/lib/api/schedule";

type GymVisitsPanelProps = {
  title: string;
  subtitle: string;
  refreshLabel: string;
  emptyLabel: string;
  phoneFallback: string;
  visits: OpenGymVisit[];
  formatVisitedAt: (value: string) => string;
  onRefresh: () => void | Promise<void>;
};

export function GymVisitsPanel({
  title,
  subtitle,
  refreshLabel,
  emptyLabel,
  phoneFallback,
  visits,
  formatVisitedAt,
  onRefresh,
}: GymVisitsPanelProps) {
  return (
    <section className="rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-[var(--text-main)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="rounded-[16px] border border-[var(--line-soft)] px-3 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
        >
          {refreshLabel}
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {visits.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[var(--line-soft)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
            {emptyLabel}
          </div>
        ) : (
          visits.map((visit) => (
            <div
              key={visit.id}
              className="flex flex-col gap-2 rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-[var(--text-main)]">{visit.client_name}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                  <span>{visit.client_phone || phoneFallback}</span>
                  {visit.client_barcode ? (
                    <>
                      <span>-</span>
                      <span>{visit.client_barcode}</span>
                    </>
                  ) : null}
                </div>
              </div>
              <span className="text-sm text-[var(--text-muted)]">{formatVisitedAt(visit.visited_at)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
