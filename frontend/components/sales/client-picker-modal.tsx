import { ClientListItem } from "@/lib/api/clients";
import type { KeyboardEvent } from "react";

type ClientPickerModalProps = {
  open: boolean;
  query: string;
  error: string | null;
  loading: boolean;
  results: ClientListItem[];
  saving: boolean;
  searchInputClassName: string;
  onClose: () => void;
  onQueryChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSelect: (client: ClientListItem) => void;
  getClientName: (client: ClientListItem) => string;
  getClientSubscriptionLabel: (client: ClientListItem) => string;
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

function ScanIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M5 4.167H3.75V7.5M15 4.167h1.25V7.5M5 15.833H3.75V12.5M15 15.833h1.25V12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.083 5.833v8.334M10 5.833v8.334M12.917 5.833v8.334" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="m6.25 6.25 7.5 7.5m0-7.5-7.5 7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ClientPickerModal({
  open,
  query,
  error,
  loading,
  results,
  saving,
  searchInputClassName,
  onClose,
  onQueryChange,
  onKeyDown,
  onSelect,
  getClientName,
  getClientSubscriptionLabel,
}: ClientPickerModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.72)] px-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
              Выбор клиента
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Поиск по имени, телефону, email или сканированию штрихкода
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--line-soft)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
            aria-label="Закрыть окно выбора клиента"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-5">
          <label className="relative block">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--text-muted)]">
              <SearchIcon />
            </span>
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Поиск клиента или сканирование штрихкода..."
              className={`${searchInputClassName} pl-12`}
            />
          </label>
        </div>

        <div className="mt-3 inline-flex items-center gap-2 rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-3 py-2 text-xs text-[var(--text-muted)]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <ScanIcon />
          </span>
          <span>Сканер клиента: 6+ символов за 100мс + Enter</span>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {loading ? (
            <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-10 text-center text-sm text-[var(--text-muted)]">
              Загружаем клиентов...
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-10 text-center text-sm text-[var(--text-muted)]">
              Клиенты не найдены
            </div>
          ) : (
            results.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => onSelect(client)}
                disabled={saving}
                className="w-full rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[rgba(0,191,165,0.08)] disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-main)]">{getClientName(client)}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                      <span>{client.phone || "Телефон не указан"}</span>
                      {client.email && <span>{client.email}</span>}
                    </div>
                  </div>
                  <span className="rounded-full border border-[rgba(0,191,165,0.22)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">
                    #{client.id}
                  </span>
                </div>
                <p className="mt-3 text-xs text-[var(--text-muted)]">{getClientSubscriptionLabel(client)}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
