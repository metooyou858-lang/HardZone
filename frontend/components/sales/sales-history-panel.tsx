"use client";

import type { Order, OrderDetail, OrderItem } from "@/lib/api/orders";
import {
  ChevronIcon,
  formatMoney,
  formatSalesDate,
  getHistoryActionButtonClass,
  getItemNetTotal,
  getPaymentLabel,
  getRefundableQuantity,
  getStatusBadgeClass,
  getStatusLabel,
  historyFilters,
  HistoryIcon,
  isOrderWithReceiptError,
  resolveDiscountMoney,
  type HistoryFilter,
} from "@/components/sales/sales-shared";

type SalesHistoryPanelProps = {
  historyFilter: HistoryFilter;
  setHistoryFilter: (value: HistoryFilter) => void;
  historyError: string | null;
  historyLoading: boolean;
  orders: Order[];
  expandedOrderId: string | null;
  orderDetails: Record<string, OrderDetail>;
  detailLoadingId: string | null;
  cancellingId: string | null;
  refundingId: string | null;
  syncingOrderId: string | null;
  handleToggleOrder: (orderId: string) => void | Promise<void>;
  handleSyncPayment: (orderId: string) => void | Promise<void>;
  handleCancelOrder: (orderId: string) => void | Promise<void>;
  handleRefundOrder: (orderId: string, item?: OrderItem) => void | Promise<void>;
};

export function SalesHistoryPanel({
  historyFilter,
  setHistoryFilter,
  historyError,
  historyLoading,
  orders,
  expandedOrderId,
  orderDetails,
  detailLoadingId,
  cancellingId,
  refundingId,
  syncingOrderId,
  handleToggleOrder,
  handleSyncPayment,
  handleCancelOrder,
  handleRefundOrder,
}: SalesHistoryPanelProps) {
  return (
    <section className="rounded-[28px] bg-[var(--bg-card)] p-5 shadow-[0_4px_32px_rgba(0,0,0,0.22)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">
          История продаж
        </p>

        <div className="inline-flex flex-wrap gap-1 rounded-full border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-1">
          {historyFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setHistoryFilter(filter.value)}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                historyFilter === filter.value
                  ? "bg-[var(--accent)] font-medium text-[var(--text-inverse)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {historyError && (
        <div className="mt-4 rounded-2xl border border-[rgba(255,116,57,0.3)] bg-[rgba(255,116,57,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {historyError}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-[24px] bg-[var(--bg-card-soft)]">
        <div className="hidden grid-cols-[1.4fr_90px_130px_120px_160px_130px] gap-4 border-b border-[var(--line-soft)] px-5 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 lg:grid">
          <span>Дата и время</span>
          <span>Позиций</span>
          <span>Сумма</span>
          <span>Оплата</span>
          <span>Статус</span>
          <span className="text-right">Действия</span>
        </div>

        {historyLoading ? (
          <div className="py-16 text-center text-sm text-[var(--text-muted)]">Загружаем историю...</div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--text-muted)]">Заказов пока нет</div>
        ) : (
          <div className="divide-y divide-[var(--line-soft)]">
            {orders.map((historyOrder, index) => {
              const isExpanded = expandedOrderId === historyOrder.id;
              const detail = orderDetails[historyOrder.id];
              const detailLoading = detailLoadingId === historyOrder.id;
              const cancelling = cancellingId === historyOrder.id;
              const refunding = refundingId === historyOrder.id;
              const syncingHistoryOrder = syncingOrderId === historyOrder.id;
              const canCheckPayment =
                historyOrder.status === "open" && historyOrder.items_count > 0 && !!historyOrder.aqsi_receipt_id;
              // cancel only if not yet sent to AQSI (backend requires aqsi_sent_at IS NULL)
              const canCancel = historyOrder.status === "open" && !historyOrder.aqsi_sent_at;
              const canRefund =
                historyOrder.status === "confirmed" || historyOrder.status === "partially_refunded";

              return (
                <div key={historyOrder.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => void handleToggleOrder(historyOrder.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void handleToggleOrder(historyOrder.id);
                      }
                    }}
                    className={`cursor-pointer px-5 py-2.5 transition-colors ${
                      index % 2 === 0
                        ? "bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)]"
                        : "hover:bg-[rgba(255,255,255,0.04)]"
                    }`}
                  >
                    <div className="grid gap-3 lg:grid-cols-[1.4fr_90px_130px_120px_160px_130px] lg:items-center">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-main)]">
                          {formatSalesDate(historyOrder.created_at)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">#{historyOrder.id.slice(0, 8)}</p>
                      </div>

                      <div className="text-sm text-[var(--text-muted)]">{historyOrder.items_count}</div>
                      <div className="text-sm font-semibold text-[var(--text-main)]">
                        {formatMoney(historyOrder.total_amount)}
                      </div>
                      <div className="text-sm text-[var(--text-muted)]">{getPaymentLabel(historyOrder.payment_type)}</div>

                      <div>
                        {canCheckPayment ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleSyncPayment(historyOrder.id);
                            }}
                            disabled={syncingHistoryOrder}
                            className={getHistoryActionButtonClass("accent")}
                          >
                            {syncingHistoryOrder ? "Проверяем..." : "Проверить оплату"}
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isOrderWithReceiptError(historyOrder) ? (
                              <span className="inline-flex rounded-full border border-[rgba(255,116,57,0.4)] bg-[rgba(255,116,57,0.1)] px-3 py-1 text-xs text-[var(--danger)]">
                                Ошибка чека
                              </span>
                            ) : (
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${getStatusBadgeClass(historyOrder.status)}`}>
                                {getStatusLabel(historyOrder.status)}
                              </span>
                            )}
                            {historyOrder.aqsi_receipt_status === "marking_error" && (
                              <span className="inline-flex rounded-full border border-[rgba(255,116,57,0.4)] bg-[rgba(255,116,57,0.1)] px-2 py-1 text-[10px] text-[var(--danger)]">
                                ГИС МТ
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        {canCancel && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleCancelOrder(historyOrder.id);
                            }}
                            disabled={cancelling}
                            className={getHistoryActionButtonClass("danger")}
                          >
                            {cancelling ? "Отменяем..." : "Отменить"}
                          </button>
                        )}

                        {canRefund && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRefundOrder(historyOrder.id);
                            }}
                            disabled={refunding}
                            className="rounded-full border border-[var(--line-soft)] px-3 py-1 text-xs text-[var(--text-muted)] transition-colors hover:border-[rgba(210,153,34,0.4)] hover:text-[var(--warning)] disabled:opacity-50"
                          >
                            {refunding ? "Возвращаем..." : "Вернуть всё"}
                          </button>
                        )}

                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-soft)] text-[var(--text-muted)]">
                          <ChevronIcon open={isExpanded} />
                        </span>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[var(--line-soft)] bg-[var(--bg-panel)] px-5 py-4">
                      {detailLoading ? (
                        <div className="py-6 text-sm text-[var(--text-muted)]">Загружаем состав заказа...</div>
                      ) : detail ? (
                        <div className="space-y-2">
                          {detail.items.map((item) => {
                            const summary = getItemNetTotal(item);
                            const refundedQuantity = Number(item.refunded_quantity || 0);
                            const refundableQuantity = getRefundableQuantity(item);
                            const itemFullyRefunded = refundableQuantity === 0;

                            return (
                              <div
                                key={item.id}
                                className={`grid gap-x-4 gap-y-1 rounded-2xl border px-4 py-2.5 lg:grid-cols-[1.4fr_90px_130px_120px_160px_130px] lg:items-center ${
                                  itemFullyRefunded
                                    ? "border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.08)]"
                                    : "border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)]"
                                }`}
                              >
                                {/* Col 1: название */}
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-[var(--text-main)]">{item.name}</p>
                                  {item.sku && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.sku}</p>}
                                  {refundedQuantity > 0 && (
                                    <p className="mt-1 text-xs text-[var(--warning)]">
                                      Возвращено {refundedQuantity} из {item.quantity}
                                    </p>
                                  )}
                                </div>

                                {/* Col 2: количество */}
                                <div className="text-sm text-[var(--text-main)]">{item.quantity} шт.</div>

                                {/* Col 3: цена за ед. */}
                                <div className="text-sm text-[var(--text-main)]">{formatMoney(item.sale_price)}</div>

                                {/* Col 4: доступно к возврату */}
                                <div className="text-xs text-[var(--text-muted)]">
                                  {itemFullyRefunded ? "Возврат завершён" : `К возврату: ${refundableQuantity}`}
                                </div>

                                {/* Col 5: итог строки */}
                                <div className="text-right text-sm font-medium text-[var(--text-main)]">
                                  {summary.discountTotal > 0 && (
                                    <p className="text-xs text-[var(--text-muted)] line-through">
                                      {formatMoney(summary.grossTotal)}
                                    </p>
                                  )}
                                  <p>{formatMoney(summary.total)}</p>
                                </div>

                                {/* Col 6: кнопка возврата */}
                                <div className="flex justify-end">
                                  {!itemFullyRefunded && canRefund && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleRefundOrder(historyOrder.id, item);
                                      }}
                                      disabled={refunding}
                                      className={getHistoryActionButtonClass("warning")}
                                    >
                                      {refunding ? "..." : "Возврат"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {(() => {
                            const itemsGross = detail.items.reduce((sum, it) => sum + Number(getItemNetTotal(it).total), 0);
                            const orderDiscount = resolveDiscountMoney(itemsGross, detail.discount_percent, detail.discount_money);
                            if (orderDiscount <= 0) return null;
                            return (
                              <div className="mt-2 border-t border-[var(--line-soft)] pt-2 space-y-1 text-sm text-right">
                                <div className="flex justify-between text-[var(--text-muted)]">
                                  <span>Скидка на чек</span>
                                  <span>−{formatMoney(orderDiscount)}</span>
                                </div>
                                <div className="flex justify-between font-semibold text-[var(--text-main)]">
                                  <span>Итого</span>
                                  <span>{formatMoney(Number(detail.total_amount))}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="py-6 text-sm text-[var(--text-muted)]">Не удалось загрузить состав заказа</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </section>
  );
}
