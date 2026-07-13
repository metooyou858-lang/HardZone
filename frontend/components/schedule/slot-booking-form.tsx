"use client";

import { useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { formatClientName } from "@/components/clients/shared";
import { CloseIcon, SearchIcon } from "@/components/schedule/schedule-shared";
import type { ClientDetail, ClientListItem, ClientSubscription } from "@/lib/api/clients";
import type { SlotType } from "@/lib/api/schedule";

function formatSubLabel(sub: ClientSubscription): string {
  const name = sub.product_name || sub.type;

  if (sub.type === "single") return name;
  if (sub.type === "visits") return `${name} — ${sub.visits_left ?? 0} из ${sub.visits_total ?? "?"} занятий`;

  if (sub.expires_at) {
    const date = new Date(sub.expires_at).toLocaleDateString("ru", { day: "numeric", month: "short" });
    return `${name} — до ${date}`;
  }

  return name;
}

function getTrainingTypeIds(sub: ClientSubscription): number[] {
  return sub.training_type_ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
}

type SlotBookingFormProps = {
  clientQuery: string;
  clientResults: ClientListItem[];
  clientLoading: boolean;
  clientError: string | null;
  selectedClient: ClientListItem | null;
  selectedClientDetail: ClientDetail | null;
  selectedSubscriptionId: string;
  bookingSaving: boolean;
  slotType: SlotType;
  slotTrainingTypeId?: string | null;
  // партнёр по сплиту — только для персональных с вместимостью > 1
  allowPartner: boolean;
  partnerEnabled: boolean;
  partnerQuery: string;
  partnerResults: ClientListItem[];
  partnerLoading: boolean;
  partnerError: string | null;
  selectedPartner: ClientListItem | null;
  onTogglePartner: () => void;
  onPartnerQueryChange: (value: string) => void;
  onSelectPartner: (client: ClientListItem) => void;
  onClearPartner: () => void;
  onClientQueryChange: (value: string) => void;
  onClientSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onSelectClient: (client: ClientListItem) => void | Promise<void>;
  onClearClient: () => void;
  onSubscriptionChange: (value: string) => void;
  onCreateBooking: () => void | Promise<void>;
  onCreateUnpaidBooking: () => void | Promise<void>;
};

export function SlotBookingForm({
  clientQuery,
  clientResults,
  clientLoading,
  clientError,
  selectedClient,
  selectedClientDetail,
  selectedSubscriptionId,
  bookingSaving,
  slotType,
  slotTrainingTypeId,
  allowPartner,
  partnerEnabled,
  partnerQuery,
  partnerResults,
  partnerLoading,
  partnerError,
  selectedPartner,
  onTogglePartner,
  onPartnerQueryChange,
  onSelectPartner,
  onClearPartner,
  onClientQueryChange,
  onClientSearchKeyDown,
  onSelectClient,
  onClearClient,
  onSubscriptionChange,
  onCreateBooking,
  onCreateUnpaidBooking,
}: SlotBookingFormProps) {
  const activeSubscriptions =
    selectedClientDetail?.subscriptions.filter((s) => s.status === "active") ?? [];

  // Подходящие — только по праву на формат слота и, если задано, по виду тренировки.
  const relevantSubs = activeSubscriptions.filter((s) => {
    if (slotType === "group" && !s.allow_group_training) return false;
    if (slotType === "personal" && !s.allow_personal_training) return false;
    if (!["group", "personal"].includes(slotType)) return false;
    if (!slotTrainingTypeId) return true;
    const trainingTypeIds = getTrainingTypeIds(s);
    if (trainingTypeIds.length === 0) return true;
    return trainingTypeIds.includes(Number(slotTrainingTypeId));
  });

  const otherSubs = activeSubscriptions.filter((s) => !relevantSubs.includes(s));
  const canCreateBooking = !selectedClient || Boolean(selectedSubscriptionId);
  const canCreateUnpaidBooking = Boolean(selectedClient) && !partnerEnabled;

  useEffect(() => {
    if (!selectedSubscriptionId) {
      if (relevantSubs[0]) {
        onSubscriptionChange(String(relevantSubs[0].id));
      }
      return;
    }
    if (relevantSubs.some((sub) => String(sub.id) === String(selectedSubscriptionId))) return;
    onSubscriptionChange(relevantSubs[0] ? String(relevantSubs[0].id) : "");
  }, [onSubscriptionChange, relevantSubs, selectedSubscriptionId]);

  return (
    <section className="rounded-[26px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <SearchIcon />
        </span>
        <div>
          <p className="text-lg font-semibold text-[var(--text-main)]">Записать клиента</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Поиск по имени или сканирование штрихкода
          </p>
        </div>
      </div>

      <div className="mt-4">
        <label className="relative block">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--text-muted)]">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={clientQuery}
            onChange={(e) => onClientQueryChange(e.target.value)}
            onKeyDown={onClientSearchKeyDown}
            placeholder="Введите ФИО или сканируйте штрихкод..."
            className="w-full rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card)] py-3 pl-12 pr-4 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[rgba(0,191,165,0.4)]"
          />
        </label>
      </div>

      {clientError && (
        <div className="mt-4 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
          {clientError}
        </div>
      )}

      {/* Результаты поиска */}
      {(clientLoading || clientResults.length > 0) && (
        <div className="mt-3 space-y-2">
          {clientLoading ? (
            <p className="px-2 text-sm text-[var(--text-muted)]">Ищем клиентов...</p>
          ) : (
            clientResults.slice(0, 5).map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => void onSelectClient(client)}
                className="w-full rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)] hover:bg-[rgba(0,191,165,0.08)]"
              >
                <p className="text-sm font-semibold text-[var(--text-main)]">{formatClientName(client)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{client.phone || "Телефон не указан"}</p>
              </button>
            ))
          )}
        </div>
      )}

      {/* Выбранный клиент + абонементы */}
      {selectedClient && (
        <div className="mt-4 rounded-[22px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-main)]">{formatClientName(selectedClient)}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{selectedClient.phone || "Телефон не указан"}</p>
            </div>
            <button
              type="button"
              onClick={onClearClient}
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[var(--line-soft)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
              aria-label="Очистить"
            >
              <CloseIcon />
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-[var(--text-muted)]">Выберите абонемент для списания:</p>

            {/* Подходящие абонементы */}
            {relevantSubs.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => onSubscriptionChange(String(selectedSubscriptionId) === String(sub.id) ? "" : String(sub.id))}
                className={`w-full rounded-[16px] border px-4 py-3 text-left text-sm transition-colors ${
                  String(selectedSubscriptionId) === String(sub.id)
                    ? "border-[var(--accent)] bg-[rgba(0,191,165,0.12)] text-[var(--text-main)]"
                    : "border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.06)] text-[var(--text-main)] hover:bg-[rgba(0,191,165,0.12)]"
                }`}
              >
                {formatSubLabel(sub)}
              </button>
            ))}

            {relevantSubs.length === 0 && (
              <p className="px-1 text-xs text-[var(--text-muted)]">Нет абонементов для этого формата занятия</p>
            )}

            {/* Неподходящие абонементы — только информационно, не кликабельны */}
            {otherSubs.length > 0 && (
              <>
                <p className="pt-1 text-xs text-[var(--text-muted)]">Не подходит для этой тренировки:</p>
                {otherSubs.map((sub) => (
                  <div
                    key={sub.id}
                    className="w-full cursor-not-allowed rounded-[16px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-left text-sm text-[var(--text-muted)] opacity-40 select-none"
                  >
                    {formatSubLabel(sub)}
                  </div>
                ))}
              </>
            )}

          </div>

          {/* Сплит-партнёр — только для персональных с вместимостью > 1 */}
          {allowPartner && <div className="border-t border-[var(--line-soft)] pt-4">
            {!partnerEnabled ? (
              <button
                type="button"
                onClick={onTogglePartner}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
              >
                + Добавить партнёра (сплит-тренировка)
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[var(--accent)]">Партнёр по сплиту</p>
                  <button
                    type="button"
                    onClick={onTogglePartner}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                  >
                    Убрать
                  </button>
                </div>

                {!selectedPartner ? (
                  <>
                    <label className="relative block">
                      <input
                        type="text"
                        value={partnerQuery}
                        onChange={(e) => onPartnerQueryChange(e.target.value)}
                        placeholder="Поиск партнёра по имени..."
                        className="w-full rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] py-2.5 pl-4 pr-4 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[rgba(0,191,165,0.4)]"
                      />
                    </label>
                    {partnerError && (
                      <p className="text-xs text-[var(--danger)]">{partnerError}</p>
                    )}
                    {(partnerLoading || partnerResults.length > 0) && (
                      <div className="space-y-1.5">
                        {partnerLoading ? (
                          <p className="px-2 text-xs text-[var(--text-muted)]">Ищем...</p>
                        ) : (
                          partnerResults.slice(0, 4).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => onSelectPartner(c)}
                              className="w-full rounded-[14px] border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-left transition-colors hover:border-[var(--accent)]"
                            >
                              <p className="text-xs font-semibold text-[var(--text-main)]">{c.first_name} {c.last_name}</p>
                              <p className="text-[11px] text-[var(--text-muted)]">{c.phone || "Телефон не указан"}</p>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between rounded-[16px] border border-[rgba(0,191,165,0.3)] bg-[rgba(0,191,165,0.08)] px-3 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-main)]">{selectedPartner.first_name} {selectedPartner.last_name}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">Оплата покрыта основным клиентом</p>
                    </div>
                    <button
                      type="button"
                      onClick={onClearPartner}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>}

          <button
            type="button"
            onClick={() => void onCreateBooking()}
            disabled={bookingSaving || !canCreateBooking}
            className="w-full rounded-[18px] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:opacity-50"
          >
            {bookingSaving ? "Записываем..." : partnerEnabled && selectedPartner ? "Записать обоих" : "Записать клиента"}
          </button>

          {selectedClient && relevantSubs.length === 0 && (
            <button
              type="button"
              onClick={() => void onCreateUnpaidBooking()}
              disabled={bookingSaving || !canCreateUnpaidBooking}
              className="w-full rounded-[18px] border border-[rgba(248,191,0,0.35)] bg-[rgba(248,191,0,0.1)] px-4 py-3 text-sm font-semibold text-[#f8bf00] transition-all hover:bg-[rgba(248,191,0,0.18)] disabled:opacity-50"
            >
              Записать к оплате
            </button>
          )}
        </div>
      )}
    </section>
  );
}
