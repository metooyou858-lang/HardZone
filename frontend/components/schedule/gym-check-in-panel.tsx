import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import { describeSubscription, formatClientName } from "@/components/clients/shared";
import { SearchIcon } from "@/components/schedule/gym-access-shared";
import { inputCls } from "@/components/warehouse/shared";
import type { ClientListItem } from "@/lib/api/clients";

type GymCheckInPanelProps = {
  title: string;
  subtitle: string;
  placeholder: string;
  searchingLabel: string;
  emptyLabel: string;
  phoneFallback: string;
  actionLabel: string;
  actionPendingLabel: string;
  query: string;
  searchError: string | null;
  searching: boolean;
  results: ClientListItem[];
  checkingInId: string | null;
  onQueryChange: (value: string) => void;
  onQueryKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onCheckIn: (client: ClientListItem) => void | Promise<void>;
};

export function GymCheckInPanel({
  title,
  subtitle,
  placeholder,
  searchingLabel,
  emptyLabel,
  phoneFallback,
  actionLabel,
  actionPendingLabel,
  query,
  searchError,
  searching,
  results,
  checkingInId,
  onQueryChange,
  onQueryKeyDown,
  onCheckIn,
}: GymCheckInPanelProps) {
  return (
    <div className="rounded-[30px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <SearchIcon />
        </span>
        <div>
          <p className="text-lg font-semibold text-[var(--text-main)]">{title}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
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
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={onQueryKeyDown}
            placeholder={placeholder}
            className={`${inputCls} pl-12`}
          />
        </label>
      </div>

      {searchError ? (
        <div className="mt-4 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {searchError}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {searching ? (
          <div className="rounded-[20px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
            {searchingLabel}
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
                  {client.phone || phoneFallback} - {describeSubscription(client)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void onCheckIn(client)}
                disabled={checkingInId === client.id}
                className="shrink-0 rounded-[16px] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
              >
                {checkingInId === client.id ? actionPendingLabel : actionLabel}
              </button>
            </div>
          ))
        ) : query.trim().length >= 2 ? (
          <div className="rounded-[20px] border border-dashed border-[var(--line-soft)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            {emptyLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
