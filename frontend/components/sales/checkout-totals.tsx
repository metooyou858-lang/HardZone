"use client";

import { useState } from "react";

import { type DiscountMode, formatMoney } from "@/components/sales/sales-shared";
import type { OrderDetail } from "@/lib/api/orders";

type CheckoutTotalsProps = {
  order: OrderDetail | null;
  orderLocked: boolean;
  confirming: boolean;
  orderLoading: boolean;
  basketLinesCount: number;
  basketItemsCount: number;
  hasAnyDiscount: boolean;
  basketGrossTotal: number;
  basketLineDiscountTotal: number;
  orderLevelDiscount: number;
  receiptDiscountMode: DiscountMode;
  receiptDiscountValue: string;
  receiptDiscountSaving: boolean;
  sendBlockedByClient: boolean;
  sendBlockedByMarking: boolean;
  clientSaving: boolean;
  receiptError: boolean;
  conflictingOperationId: string | null;
  paymentBusy: boolean;
  scheduleReceiptDiscount: (mode: DiscountMode, value: string) => void;
  handleConfirmCash: () => void | Promise<void>;
  handleInitiatePayment: () => void | Promise<void>;
  handleSyncV4: () => void | Promise<void>;
  slipPending: boolean;
};

export function CheckoutTotals({
  order,
  orderLocked,
  confirming,
  orderLoading,
  basketLinesCount,
  basketItemsCount,
  hasAnyDiscount,
  basketGrossTotal,
  basketLineDiscountTotal,
  orderLevelDiscount,
  receiptDiscountMode,
  receiptDiscountValue,
  receiptDiscountSaving,
  sendBlockedByClient,
  sendBlockedByMarking,
  clientSaving,
  receiptError,
  conflictingOperationId,
  paymentBusy,
  scheduleReceiptDiscount,
  handleConfirmCash,
  handleInitiatePayment,
  handleSyncV4,
  slipPending,
}: CheckoutTotalsProps) {
  const [discountOpen, setDiscountOpen] = useState(false);
  const [cashStep, setCashStep] = useState(false);
  const [cashReceived, setCashReceived] = useState("");

  const hasActiveReceiptDiscount = Number(receiptDiscountValue) > 0;
  const showDiscountBlock = basketLinesCount > 0 && (discountOpen || hasActiveReceiptDiscount);
  const cancellationPending = order?.aqsi_payment_status === "cancelling";

  const isDisabled = confirming || orderLoading || basketLinesCount === 0 || sendBlockedByClient || sendBlockedByMarking || clientSaving || orderLocked || paymentBusy;

  return (
    <div className="border-t border-[var(--line-soft)] p-5">
      <div className="rounded-[24px] border border-[rgba(94,244,216,0.12)] bg-[linear-gradient(135deg,rgba(94,244,216,0.08),rgba(22,27,39,0.98))] p-5">

        {basketLinesCount > 0 && !showDiscountBlock && (
          <button
            type="button"
            onClick={() => setDiscountOpen(true)}
            disabled={orderLocked}
            className="mb-4 flex w-full items-center justify-between text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)] disabled:opacity-50"
          >
            <span>Скидка на чек</span>
            <span className="text-[var(--line-soft)]">+</span>
          </button>
        )}

        {showDiscountBlock && (
          <div className="mb-4 rounded-[18px] bg-[var(--bg-panel)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-xs text-[var(--text-muted)]">Скидка на чек</p>
                <button
                  type="button"
                  onClick={() => scheduleReceiptDiscount("percent", receiptDiscountMode === "percent" ? receiptDiscountValue : "")}
                  disabled={orderLocked}
                  className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                    receiptDiscountMode === "percent"
                      ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                      : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => scheduleReceiptDiscount("money", receiptDiscountMode === "money" ? receiptDiscountValue : "")}
                  disabled={orderLocked}
                  className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                    receiptDiscountMode === "money"
                      ? "bg-[var(--accent)] text-[var(--text-inverse)]"
                      : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                  }`}
                >
                  ₽
                </button>
              </div>
              {!hasActiveReceiptDiscount && (
                <button
                  type="button"
                  onClick={() => { scheduleReceiptDiscount(receiptDiscountMode, ""); setDiscountOpen(false); }}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >
                  Свернуть
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
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
              {receiptDiscountSaving && (
                <span className="shrink-0 text-xs text-[var(--accent)]">Сохраняем...</span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">Итог</p>
            {hasAnyDiscount && (
              <p className="mt-1.5 text-sm text-[var(--text-muted)] line-through">
                {formatMoney(basketGrossTotal)}
              </p>
            )}
            <p className="mt-1.5 text-3xl font-semibold text-[var(--text-main)]">
              {formatMoney(order?.total_amount ?? 0)}
            </p>
            {hasAnyDiscount && (
              <p className="mt-1 text-xs text-[var(--accent)]">
                Скидка: −{formatMoney(basketLineDiscountTotal + orderLevelDiscount)}
              </p>
            )}
          </div>
          <p className="text-right text-xs text-[var(--text-muted)]">{basketItemsCount} шт.</p>
        </div>

        {/* Главная кнопка: оплата картой через v4 acquiring */}
        {paymentBusy ? (
          <div className="mt-4 flex items-center justify-center gap-3 rounded-[18px] bg-[var(--bg-card-soft)] px-4 py-3.5">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <span className="text-sm text-[var(--text-muted)]">
              {cancellationPending
                ? "Ждём подтверждения отмены на терминале..."
                : "Ожидаем оплату от клиента..."}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleInitiatePayment()}
            disabled={isDisabled}
            style={isDisabled ? undefined : { background: "var(--accent-grad)" }}
            className={`mt-4 inline-flex w-full items-center justify-center rounded-[18px] px-4 py-3.5 text-sm font-semibold transition-all ${
              isDisabled
                ? "cursor-not-allowed bg-[var(--bg-card-soft)] text-[var(--text-muted)]"
                : "text-[var(--text-inverse)] hover:brightness-110"
            }`}
          >
            {conflictingOperationId ? "Повторить оплату картой" : "Оплата картой"}
          </button>
        )}

        {(slipPending || cancellationPending) && !receiptError && (
          <p className="mt-2 rounded-[18px] border border-[var(--line-soft)] px-4 py-2.5 text-center text-xs text-[var(--text-muted)]">
            Для отмены чека нажмите кнопку отмены на кассе.
          </p>
        )}


        {/* Конфликт OperationInProgress - касса еще занята */}
        {conflictingOperationId && (
          <div className="mt-2 rounded-[18px] border border-[var(--warning)] bg-[rgba(255,160,0,0.08)] px-4 py-3">
            <p className="text-center text-xs text-[var(--text-muted)]">
              Касса еще занята предыдущей операцией. Подождите несколько секунд и повторите оплату.
            </p>
          </div>
        )}

        {/* Восстановление после ошибки фискализации */}
        {receiptError && (
          <button
            type="button"
            onClick={() => void handleSyncV4()}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-[var(--warning)] px-4 py-2.5 text-xs text-[var(--warning)] transition-all hover:bg-[rgba(255,160,0,0.08)]"
          >
            Восстановить фискализацию
          </button>
        )}

        {/* Наличные: двухшаговый флоу с расчётом сдачи */}
        {!paymentBusy && !receiptError && !cashStep && (
          <button
            type="button"
            onClick={() => {
              setCashReceived(String(Math.ceil(Number(order?.total_amount ?? 0))));
              setCashStep(true);
            }}
            disabled={isDisabled}
            className={`mt-2 inline-flex w-full items-center justify-center rounded-[18px] border border-[var(--line-soft)] px-4 py-2.5 text-xs transition-all ${
              isDisabled
                ? "cursor-not-allowed text-[var(--text-muted)] opacity-40"
                : "text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            }`}
          >
            Оплата наличными
          </button>
        )}

        {cashStep && !paymentBusy && (
          <div className="mt-2 rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-panel)] p-4">
            <p className="mb-3 text-xs font-medium text-[var(--text-muted)]">Оплата наличными</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="mb-1 text-[10px] text-[var(--text-muted)]">Получено, ₽</p>
                <input
                  type="number"
                  min="0"
                  step="1"
                  autoFocus
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const received = Number(cashReceived);
                      const total = Number(order?.total_amount ?? 0);
                      if (received >= total) {
                        setCashStep(false);
                        setCashReceived("");
                        void handleConfirmCash();
                      }
                    }
                    if (e.key === "Escape") {
                      setCashStep(false);
                      setCashReceived("");
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                />
              </div>
              <div className="min-w-[90px] text-right">
                <p className="mb-1 text-[10px] text-[var(--text-muted)]">Сдача</p>
                {(() => {
                  const received = Number(cashReceived) || 0;
                  const total = Number(order?.total_amount ?? 0);
                  const change = received - total;
                  return (
                    <p className={`text-lg font-semibold ${change >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                      {change >= 0 ? formatMoney(change) : "−"}
                    </p>
                  );
                })()}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => { setCashStep(false); setCashReceived(""); }}
                className="rounded-[14px] border border-[var(--line-soft)] px-4 py-2 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setCashStep(false);
                  setCashReceived("");
                  void handleConfirmCash();
                }}
                disabled={confirming || Number(cashReceived) < Number(order?.total_amount ?? 0)}
                className="flex-1 rounded-[14px] bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--text-inverse)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {confirming ? "Отправляем..." : "Подтвердить"}
              </button>
            </div>
          </div>
        )}

        {sendBlockedByClient && (
          <p className="mt-2 text-sm text-[var(--warning)]">Выберите клиента для услуги</p>
        )}
        {sendBlockedByMarking && (
          <p className="mt-2 text-sm text-[var(--warning)]">
            Для маркированных товаров нужно отсканировать код маркировки
          </p>
        )}
      </div>
    </div>
  );
}
