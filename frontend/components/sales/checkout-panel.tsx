"use client";

import { useEffect, useState } from "react";

import type { ClientListItem } from "@/lib/api/clients";
import type { OrderDetail } from "@/lib/api/orders";
import {
  type BasketLine,
  type DiscountMode,
  CloseIcon,
  formatMoney,
  getClientName,
  getClientSubscriptionLabel,
  MinusIcon,
  PlusIcon,
  ReceiptIcon,
} from "@/components/sales/sales-shared";

type CheckoutPanelProps = {
  orderLoading: boolean;
  order: OrderDetail | null;
  basketLines: BasketLine[];
  selectedClient: ClientListItem | null;
  clientSelectionLocked: boolean;
  setClientError: (value: string | null) => void;
  setClientPickerOpen: (value: boolean) => void;
  applyClientSelection: (client: ClientListItem | null) => void | Promise<void>;
  clientSaving: boolean;
  serviceRequiresClient: boolean;
  orderClientId: string | null;
  lineBusyKey: string | null;
  orderLocked: boolean;
  editingLineDiscountKey: string | null;
  lineDiscountMode: DiscountMode;
  setLineDiscountMode: (value: DiscountMode) => void;
  lineDiscountValue: string;
  setLineDiscountValue: (value: string) => void;
  lineDiscountSavingKey: string | null;
  markingSavingKey: string | null;
  openLineDiscountEditor: (line: BasketLine) => void;
  removeLine: (line: BasketLine) => void | Promise<void>;
  decrementLine: (line: BasketLine) => void | Promise<void>;
  incrementLine: (line: BasketLine) => void | Promise<void>;
  saveLineDiscount: (line: BasketLine) => void | Promise<void>;
  saveLineMarking: (line: BasketLine, value: string) => void | Promise<void>;
  setEditingLineDiscountKey: (value: string | null) => void;
  receiptDiscountMode: DiscountMode;
  receiptDiscountValue: string;
  scheduleReceiptDiscount: (mode: DiscountMode, value: string) => void;
  receiptDiscountSaving: boolean;
  hasAnyDiscount: boolean;
  basketGrossTotal: number;
  basketLineDiscountTotal: number;
  orderLevelDiscount: number;
  confirming: boolean;
  orderAwaitingPayment: boolean;
  sendBlockedByClient: boolean;
  sendBlockedByMarking: boolean;
  handleConfirm: () => void | Promise<void>;
  handleStartNewOrder: () => void;
};

export function CheckoutPanel({
  orderLoading,
  order,
  basketLines,
  selectedClient,
  clientSelectionLocked,
  setClientError,
  setClientPickerOpen,
  applyClientSelection,
  clientSaving,
  serviceRequiresClient,
  orderClientId,
  lineBusyKey,
  orderLocked,
  editingLineDiscountKey,
  lineDiscountMode,
  setLineDiscountMode,
  lineDiscountValue,
  setLineDiscountValue,
  lineDiscountSavingKey,
  markingSavingKey,
  openLineDiscountEditor,
  removeLine,
  decrementLine,
  incrementLine,
  saveLineDiscount,
  saveLineMarking,
  setEditingLineDiscountKey,
  receiptDiscountMode,
  receiptDiscountValue,
  scheduleReceiptDiscount,
  receiptDiscountSaving,
  hasAnyDiscount,
  basketGrossTotal,
  basketLineDiscountTotal,
  orderLevelDiscount,
  confirming,
  orderAwaitingPayment,
  sendBlockedByClient,
  sendBlockedByMarking,
  handleConfirm,
  handleStartNewOrder,
}: CheckoutPanelProps) {
  const [markingDrafts, setMarkingDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setMarkingDrafts((current) => {
      const next: Record<string, string> = {};

      for (const line of basketLines) {
        if (line.markingRequired) {
          next[line.key] = current[line.key] ?? line.markingCode ?? "";
        }
      }

      return next;
    });
  }, [basketLines]);

  return (
    <aside className="flex min-h-0 flex-col rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
      <div className="border-b border-[var(--line-soft)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
              Текущий чек
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {orderLoading
                ? "Создаём новый чек..."
                : order
                  ? `${basketLines.length} позиций • ${order.status === "open" ? "открыт" : order.status}`
                  : "Чек создастся при первой позиции"}
            </p>
          </div>
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <ReceiptIcon />
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-5 rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Клиент</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                {selectedClient
                  ? "Чек будет привязан к выбранному клиенту"
                  : "Для товаров клиент не обязателен, для услуг и абонементов обязателен"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setClientError(null);
                  setClientPickerOpen(true);
                }}
                disabled={clientSelectionLocked}
                className="rounded-full border border-[rgba(0,191,165,0.24)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-50"
              >
                {selectedClient ? "Сменить клиента" : "Выбрать клиента"}
              </button>
              {selectedClient && (
                <button
                  type="button"
                  onClick={() => void applyClientSelection(null)}
                  disabled={clientSelectionLocked}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line-soft)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)] disabled:opacity-50"
                  aria-label="Убрать клиента из чека"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          </div>

          {selectedClient ? (
            <div className="mt-4 rounded-[20px] border border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.08)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--text-main)]">{getClientName(selectedClient)}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                <span>{selectedClient.phone || "Телефон не указан"}</span>
                <span>{getClientSubscriptionLabel(selectedClient)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[20px] border border-dashed border-[var(--line-soft)] bg-[rgba(13,17,23,0.24)] px-4 py-4 text-sm text-[var(--text-muted)]">
              Клиент не выбран
            </div>
          )}

          {clientSaving && <p className="mt-3 text-xs text-[var(--accent)]">Сохраняем клиента...</p>}
          {serviceRequiresClient && !orderClientId && (
            <p className="mt-3 text-xs text-[var(--warning)]">
              В чеке есть услуга. Выберите клиента перед отправкой на кассу.
            </p>
          )}
        </div>

        {orderLoading ? (
          <div className="py-16 text-center text-sm text-[var(--text-muted)]">Подготавливаем чек...</div>
        ) : basketLines.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-12 text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <ReceiptIcon />
            </div>
            <p className="mt-4 text-base font-medium text-[var(--text-main)]">Чек пуст</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Выберите позицию слева или отсканируйте штрихкод
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {basketLines.map((line) => {
              const busy = lineBusyKey === line.key;
              const savingDiscount = lineDiscountSavingKey === line.key;
              const isEditingDiscount = editingLineDiscountKey === line.key;
              const hasLineDiscount = line.discountTotal > 0;
              const isMarkingSaving = markingSavingKey === line.key;
              const markingValue = markingDrafts[line.key] ?? line.markingCode ?? "";

              return (
                <div
                  key={line.key}
                  className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-main)]">{line.name}</p>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                        {line.sku && <span className="font-[family:var(--font-mono)]">{line.sku}</span>}
                        <span>{formatMoney(line.salePrice)} за шт.</span>
                        {line.markingRequired && (
                          <span className="rounded-full border border-[rgba(210,153,34,0.24)] px-2 py-0.5 text-[10px] text-[var(--warning)]">
                            Честный знак
                          </span>
                        )}
                        {hasLineDiscount && (
                          <span className="rounded-full border border-[rgba(0,191,165,0.22)] px-2 py-0.5 text-[10px] text-[var(--accent)]">
                            Скидка {line.discountMoney > 0 ? formatMoney(line.discountMoney) : `${line.discountPercent}%`}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void removeLine(line)}
                      disabled={busy || orderLocked}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(248,81,73,0.22)] text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.1)] disabled:opacity-50"
                      aria-label={`Удалить ${line.name}`}
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--line-soft)] bg-[rgba(13,17,23,0.38)] p-1.5">
                      <button
                        type="button"
                        onClick={() => void decrementLine(line)}
                        disabled={busy || orderLocked}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-main)] transition-colors hover:bg-white/5 disabled:opacity-50"
                        aria-label={`Уменьшить количество ${line.name}`}
                      >
                        <MinusIcon />
                      </button>
                      <span className="min-w-10 text-center text-sm font-semibold text-[var(--text-main)]">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => void incrementLine(line)}
                        disabled={busy || orderLocked}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-main)] transition-colors hover:bg-white/5 disabled:opacity-50"
                        aria-label={`Увеличить количество ${line.name}`}
                      >
                        <PlusIcon />
                      </button>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Итого</p>
                      {hasLineDiscount && (
                        <p className="mt-1 text-xs text-[var(--text-muted)] line-through">
                          {formatMoney(line.grossTotal)}
                        </p>
                      )}
                      <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">
                        {formatMoney(line.total)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => openLineDiscountEditor(line)}
                      disabled={busy || orderLocked || savingDiscount}
                      className="text-xs text-[var(--accent)] underline underline-offset-4 transition-colors hover:text-[var(--text-main)] disabled:opacity-50"
                    >
                      {hasLineDiscount ? "Изменить скидку" : "Скидка"}
                    </button>
                    {hasLineDiscount && (
                      <p className="text-xs text-[var(--accent)]">−{formatMoney(line.discountTotal)}</p>
                    )}
                  </div>

                  {isEditingDiscount && (
                    <div className="mt-3 rounded-2xl border border-[var(--line-soft)] bg-[rgba(13,17,23,0.38)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLineDiscountMode("percent")}
                          className={`rounded-full px-3 py-1 text-xs transition-colors ${
                            lineDiscountMode === "percent"
                              ? "bg-[var(--accent)] text-[#062b26]"
                              : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                          }`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => setLineDiscountMode("money")}
                          className={`rounded-full px-3 py-1 text-xs transition-colors ${
                            lineDiscountMode === "money"
                              ? "bg-[var(--accent)] text-[#062b26]"
                              : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                          }`}
                        >
                          ₽
                        </button>
                        <input
                          type="number"
                          min="0"
                          step={lineDiscountMode === "percent" ? "0.1" : "0.01"}
                          value={lineDiscountValue}
                          onChange={(event) => setLineDiscountValue(event.target.value)}
                          placeholder={lineDiscountMode === "percent" ? "0%" : "0 ₽"}
                          className="min-w-[120px] flex-1 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                        />
                        <button
                          type="button"
                          onClick={() => void saveLineDiscount(line)}
                          disabled={savingDiscount}
                          className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#062b26] disabled:opacity-50"
                        >
                          {savingDiscount ? "Сохраняем..." : "Сохранить"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLineDiscountKey(null);
                            setLineDiscountValue("");
                          }}
                          className="rounded-xl border border-[var(--line-soft)] px-3 py-2 text-xs text-[var(--text-muted)]"
                        >
                          Закрыть
                        </button>
                      </div>
                    </div>
                  )}

                  {line.markingRequired && (
                    <div className="mt-3 rounded-2xl border border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.06)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                            Код маркировки
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {line.markingCode
                              ? "Код маркировки уже сохранён для этой единицы товара"
                              : "Отсканируйте DataMatrix перед отправкой чека на кассу"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                            line.markingCode
                              ? "border border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]"
                              : "border border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] text-[var(--warning)]"
                          }`}
                        >
                          {line.markingCode ? "Считан" : "Нужен"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={markingValue}
                          onChange={(event) =>
                            setMarkingDrafts((current) => ({
                              ...current,
                              [line.key]: event.target.value,
                            }))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void saveLineMarking(line, markingValue);
                            }
                          }}
                          placeholder="Сканируйте или вставьте код маркировки"
                          disabled={orderLocked || isMarkingSaving}
                          className="min-w-0 flex-1 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
                        />
                        <button
                          type="button"
                          onClick={() => void saveLineMarking(line, markingValue)}
                          disabled={orderLocked || isMarkingSaving}
                          className="rounded-xl border border-[rgba(0,191,165,0.24)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent)] transition-colors hover:brightness-110 disabled:opacity-50"
                        >
                          {isMarkingSaving ? "Сохраняем..." : "Сохранить код"}
                        </button>
                      </div>
                    </div>
                  )}

                  {busy && <p className="mt-3 text-xs text-[var(--accent)]">Обновляем позицию...</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line-soft)] p-5">
        <div className="rounded-[24px] border border-[rgba(0,191,165,0.24)] bg-[linear-gradient(135deg,rgba(0,191,165,0.12),rgba(28,35,51,0.96))] p-5">
          {basketLines.length > 0 && (
            <div className="mb-5 rounded-[20px] border border-[var(--line-soft)] bg-[rgba(13,17,23,0.28)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Скидка на чек</p>
                <button
                  type="button"
                  onClick={() =>
                    scheduleReceiptDiscount(
                      "percent",
                      receiptDiscountMode === "percent" ? receiptDiscountValue : ""
                    )
                  }
                  disabled={orderLocked}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    receiptDiscountMode === "percent"
                      ? "bg-[var(--accent)] text-[#062b26]"
                      : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() =>
                    scheduleReceiptDiscount(
                      "money",
                      receiptDiscountMode === "money" ? receiptDiscountValue : ""
                    )
                  }
                  disabled={orderLocked}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    receiptDiscountMode === "money"
                      ? "bg-[var(--accent)] text-[#062b26]"
                      : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                  }`}
                >
                  ₽
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  step={receiptDiscountMode === "percent" ? "0.1" : "0.01"}
                  value={receiptDiscountValue}
                  onChange={(event) => scheduleReceiptDiscount(receiptDiscountMode, event.target.value)}
                  placeholder={receiptDiscountMode === "percent" ? "0%" : "0 ₽"}
                  disabled={orderLocked}
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
                />
                {receiptDiscountSaving && <span className="text-xs text-[var(--accent)]">Сохраняем...</span>}
              </div>
            </div>
          )}

          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Итог</p>
              {hasAnyDiscount && (
                <p className="mt-2 text-sm text-[var(--text-muted)] line-through">
                  {formatMoney(basketGrossTotal)}
                </p>
              )}
              <p className="mt-2 text-3xl font-semibold text-[var(--text-main)]">
                {formatMoney(order?.total_amount ?? 0)}
              </p>
              {hasAnyDiscount && (
                <p className="mt-2 text-xs text-[var(--accent)]">
                  Скидка: −{formatMoney(basketLineDiscountTotal + orderLevelDiscount)}
                </p>
              )}
            </div>
            <p className="text-right text-xs text-[var(--text-muted)]">
              {basketLines.reduce((sum, line) => sum + line.quantity, 0)} шт.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={
              confirming ||
              orderLoading ||
              basketLines.length === 0 ||
              orderAwaitingPayment ||
              sendBlockedByClient ||
              sendBlockedByMarking ||
              clientSaving
            }
            className="mt-5 inline-flex w-full items-center justify-center rounded-[18px] bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirming
              ? "Отправляем..."
              : orderAwaitingPayment
                ? "Отправлено на кассу"
                : "Отправить на кассу"}
          </button>

          {sendBlockedByClient && (
            <p className="mt-3 text-sm text-[var(--warning)]">Выберите клиента для услуги</p>
          )}
          {sendBlockedByMarking && (
            <p className="mt-3 text-sm text-[var(--warning)]">
              Для маркированных товаров нужно отсканировать код маркировки
            </p>
          )}

          {orderAwaitingPayment && (
            <>
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                Чек уже отправлен на кассу. Проверяйте оплату во вкладке истории продаж.
              </p>
              <button
                type="button"
                onClick={handleStartNewOrder}
                className="mt-3 inline-flex w-full items-center justify-center rounded-[18px] border border-[var(--line-soft)] px-4 py-3 text-sm font-medium text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
              >
                Новый чек
              </button>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
