"use client";

import type { Order, OrderDetail } from "@/lib/api/orders";
import {
  ChevronIcon,
  formatMoney,
  formatSalesDate,
  getHistoryActionButtonClass,
  getItemNetTotal,
  getPaymentLabel,
  getStatusBadgeClass,
  getStatusLabel,
  historyFilters,
  HistoryIcon,
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
  handleRefundOrder: (orderId: string, amount: string) => void | Promise<void>;
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
  return (        <section className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">РСЃС‚РѕСЂРёСЏ РїСЂРѕРґР°Р¶</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">РџРѕСЃР»РµРґРЅРёРµ С‡РµРєРё Рё РёС… С‚РµРєСѓС‰РёР№ СЃС‚Р°С‚СѓСЃ</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {historyFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setHistoryFilter(filter.value)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    historyFilter === filter.value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--line-soft)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {historyError && (
            <div className="mt-4 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
              {historyError}
            </div>
          )}

          <div className="mt-5 overflow-hidden rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)]">
              <div className="hidden grid-cols-[1.4fr_110px_140px_140px_170px_120px] gap-4 border-b border-[var(--line-soft)] px-5 py-4 text-[13px] font-medium uppercase tracking-[0.14em] text-slate-300 lg:grid">
                <span>Р”Р°С‚Р° Рё РІСЂРµРјСЏ</span>
                <span>РџРѕР·РёС†РёРё</span>
                <span>РЎСѓРјРјР°</span>
              <span>РћРїР»Р°С‚Р°</span>
              <span>РЎС‚Р°С‚СѓСЃ</span>
              <span className="text-right">Р”РµР№СЃС‚РІРёСЏ</span>
            </div>

            {historyLoading ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">Р—Р°РіСЂСѓР¶Р°РµРј РёСЃС‚РѕСЂРёСЋ...</div>
            ) : orders.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">Р—Р°РєР°Р·РѕРІ РїРѕРєР° РЅРµС‚</div>
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
                    historyOrder.status === "open" && historyOrder.items_count > 0 && historyOrder.aqsi_receipt_id;

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
                        className={`cursor-pointer px-5 py-4 transition-colors ${
                          index % 2 === 0 ? "bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)]" : "hover:bg-[rgba(255,255,255,0.04)]"
                        }`}
                      >
                        <div className="grid gap-3 lg:grid-cols-[1.4fr_110px_140px_140px_170px_120px] lg:items-center">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-main)]">{formatSalesDate(historyOrder.created_at)}</p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">#{historyOrder.id.slice(0, 8)}</p>
                          </div>
                          <div className="text-sm text-[var(--text-main)]">{historyOrder.items_count}</div>
                          <div className="text-sm font-medium text-[var(--text-main)]">{formatMoney(historyOrder.total_amount)}</div>
                          <div className="text-sm text-[var(--text-main)]">{getPaymentLabel(historyOrder.payment_type)}</div>
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
                                {syncingHistoryOrder ? "РџСЂРѕРІРµСЂСЏРµРј..." : "РџСЂРѕРІРµСЂРёС‚СЊ РѕРїР»Р°С‚Сѓ"}
                              </button>
                            ) : (
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${getStatusBadgeClass(historyOrder.status)}`}>
                                {getStatusLabel(historyOrder.status)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            {canCheckPayment && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleCancelOrder(historyOrder.id);
                                }}
                                disabled={cancelling}
                                className={getHistoryActionButtonClass("danger")}
                              >
                                {cancelling ? "РћС‚РјРµРЅСЏРµРј..." : "РћС‚РјРµРЅРёС‚СЊ"}
                              </button>
                            )}
                            {historyOrder.status === "confirmed" && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRefundOrder(historyOrder.id, historyOrder.total_amount);
                                }}
                                disabled={refunding}
                                className={getHistoryActionButtonClass("warning")}
                              >
                                {refunding ? "Р’РѕР·РІСЂР°С‰Р°РµРј..." : "Р’РѕР·РІСЂР°С‚"}
                              </button>
                            )}
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-soft)] text-[var(--text-muted)]">
                              <ChevronIcon open={isExpanded} />
                            </span>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-[var(--line-soft)] bg-[rgba(13,17,23,0.34)] px-5 py-4">
                          {detailLoading ? (
                            <div className="py-6 text-sm text-[var(--text-muted)]">Р—Р°РіСЂСѓР¶Р°РµРј СЃРѕСЃС‚Р°РІ Р·Р°РєР°Р·Р°...</div>
                          ) : detail ? (
                            <div className="space-y-3">
                              {detail.items.map((item) => (
                                (() => {
                                  const summary = getItemNetTotal(item);

                                  return (
                                    <div
                                      key={item.id}
                                      className="grid gap-3 rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] px-4 py-3 lg:grid-cols-[1fr_100px_140px_140px]"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-[var(--text-main)]">{item.name}</p>
                                        {item.sku && <p className="mt-1 text-xs text-[var(--text-muted)]">{item.sku}</p>}
                                      </div>
                                      <div className="text-sm text-[var(--text-main)]">{item.quantity} С€С‚.</div>
                                      <div className="text-sm text-[var(--text-main)]">{formatMoney(item.sale_price)}</div>
                                      <div className="text-right text-sm font-medium text-[var(--text-main)]">
                                        {summary.discountTotal > 0 && (
                                          <p className="text-xs text-[var(--text-muted)] line-through">
                                            {formatMoney(summary.grossTotal)}
                                          </p>
                                        )}
                                        <p>{formatMoney(summary.total)}</p>
                                      </div>
                                    </div>
                                  );
                                })()
                              ))}
                            </div>
                          ) : (
                            <div className="py-6 text-sm text-[var(--text-muted)]">РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРѕСЃС‚Р°РІ Р·Р°РєР°Р·Р°</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <HistoryIcon />
            </span>
            <span>РљР»РёРє РїРѕ СЃС‚СЂРѕРєРµ РѕС‚РєСЂС‹РІР°РµС‚ СЃРѕСЃС‚Р°РІ Р·Р°РєР°Р·Р°</span>
          </div>
        </section>
  );
}
