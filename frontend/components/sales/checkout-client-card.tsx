"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import type { ClientListItem } from "@/lib/api/clients";
import { CloseIcon, getClientName, getClientSubscriptionLabel, searchInputCls } from "@/components/sales/sales-shared";

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M8.5 14.5a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM17 17l-4.2-4.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type CheckoutClientCardProps = {
  selectedClient: ClientListItem | null;
  clientSelectionLocked: boolean;
  clientSaving: boolean;
  serviceRequiresClient: boolean;
  orderClientId: string | null;
  clientPickerOpen: boolean;
  setClientPickerOpen: (value: boolean) => void;
  clientQuery: string;
  setClientQuery: (value: string) => void;
  clientResults: ClientListItem[];
  clientLoading: boolean;
  clientError: string | null;
  setClientError: (value: string | null) => void;
  handleClientSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  applyClientSelection: (client: ClientListItem | null) => void | Promise<void>;
};

export function CheckoutClientCard({
  selectedClient,
  clientSelectionLocked,
  clientSaving,
  serviceRequiresClient,
  orderClientId,
  clientPickerOpen,
  setClientPickerOpen,
  clientQuery,
  setClientQuery,
  clientResults,
  clientLoading,
  clientError,
  setClientError,
  handleClientSearchKeyDown,
  applyClientSelection,
}: CheckoutClientCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!clientPickerOpen) return;
    setTimeout(() => inputRef.current?.focus(), 40);
  }, [clientPickerOpen]);

  useEffect(() => {
    if (!clientPickerOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setClientPickerOpen(false);
      }
    }
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setClientPickerOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [clientPickerOpen, setClientPickerOpen]);

  function openPicker() {
    setClientError(null);
    setClientPickerOpen(true);
  }

  return (
    <div ref={containerRef} className="mb-4">
      {selectedClient ? (
        <div className="flex items-center gap-3 rounded-[18px] border border-[rgba(94,244,216,0.15)] bg-[rgba(94,244,216,0.06)] px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-main)]">
              {getClientName(selectedClient)}
            </p>
            <p className="truncate text-xs text-[var(--text-muted)]">
              {getClientSubscriptionLabel(selectedClient)}
            </p>
          </div>
          <div className="flex shrink-0 items-center overflow-hidden rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)]">
            <button
              type="button"
              onClick={openPicker}
              disabled={clientSelectionLocked}
              className="px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-soft)] hover:text-[var(--text-main)] disabled:opacity-50"
            >
              Сменить
            </button>
            <div className="h-4 w-px bg-[var(--line-soft)]" />
            <button
              type="button"
              onClick={() => void applyClientSelection(null)}
              disabled={clientSelectionLocked}
              className="flex h-7 w-7 items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card-soft)] hover:text-[var(--danger)] disabled:opacity-50"
              aria-label="Убрать клиента из чека"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-[var(--text-muted)]">
            {serviceRequiresClient && !orderClientId ? (
              <span className="text-[var(--warning)]">Клиент обязателен для услуги</span>
            ) : (
              "Клиент (опционально)"
            )}
          </span>
          <button
            type="button"
            onClick={openPicker}
            disabled={clientSelectionLocked}
            className="rounded-full border border-[rgba(94,244,216,0.2)] px-3 py-1 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            Выбрать клиента
          </button>
        </div>
      )}

      {clientSaving && (
        <p className="mt-1 text-xs text-[var(--accent)]">Сохраняем...</p>
      )}

      {clientPickerOpen && (
        <div className="mt-2 overflow-hidden rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-panel)] shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
          <div className="p-3 pb-2">
            <label className="relative block">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--text-muted)]">
                <SearchIcon />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                onKeyDown={handleClientSearchKeyDown}
                placeholder="Поиск или сканирование карты..."
                className={`${searchInputCls} pl-9 py-2`}
              />
            </label>
          </div>

          {clientError && (
            <div className="mx-3 mb-2 rounded-xl border border-[rgba(255,116,57,0.3)] bg-[rgba(255,116,57,0.1)] px-3 py-2 text-xs text-[var(--danger)]">
              {clientError}
            </div>
          )}

          <div className="max-h-52 overflow-y-auto">
            {clientLoading ? (
              <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                Загружаем...
              </div>
            ) : clientResults.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                Клиенты не найдены
              </div>
            ) : (
              <div className="pb-1">
                {clientResults.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => void applyClientSelection(client)}
                    disabled={clientSaving}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--bg-card-soft)] disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-main)]">
                        {getClientName(client)}
                      </p>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {getClientSubscriptionLabel(client)}
                      </p>
                    </div>
                    {client.phone && (
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">
                        {client.phone}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
