"use client";

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
  openLineDiscountEditor: (line: BasketLine) => void;
  removeLine: (line: BasketLine) => void | Promise<void>;
  decrementLine: (line: BasketLine) => void | Promise<void>;
  incrementLine: (line: BasketLine) => void | Promise<void>;
  saveLineDiscount: (line: BasketLine) => void | Promise<void>;
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
  openLineDiscountEditor,
  removeLine,
  decrementLine,
  incrementLine,
  saveLineDiscount,
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
  handleConfirm,
  handleStartNewOrder,
}: CheckoutPanelProps) {
  return (          <aside className="flex min-h-0 flex-col rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
            <div className="border-b border-[var(--line-soft)] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">РўРµРєСѓС‰РёР№ С‡РµРє</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {orderLoading
                      ? "РЎРѕР·РґР°С‘Рј РЅРѕРІС‹Р№ С‡РµРє..."
                      : order
                        ? `${basketLines.length} РїРѕР·РёС†РёР№ В· ${order.status === "open" ? "РѕС‚РєСЂС‹С‚" : order.status}`
                        : "Р§РµРє СЃРѕР·РґР°СЃС‚СЃСЏ РїСЂРё РїРµСЂРІРѕР№ РїРѕР·РёС†РёРё"}
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
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">РљР»РёРµРЅС‚</p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      {selectedClient
                        ? "Р§РµРє Р±СѓРґРµС‚ РїСЂРёРІСЏР·Р°РЅ Рє РІС‹Р±СЂР°РЅРЅРѕРјСѓ РєР»РёРµРЅС‚Сѓ"
                        : "Р”Р»СЏ С‚РѕРІР°СЂРѕРІ РєР»РёРµРЅС‚ РЅРµ РѕР±СЏР·Р°С‚РµР»РµРЅ, РґР»СЏ СѓСЃР»СѓРі Рё Р°Р±РѕРЅРµРјРµРЅС‚РѕРІ РѕР±СЏР·Р°С‚РµР»РµРЅ"}
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
                      {selectedClient ? "РЎРјРµРЅРёС‚СЊ РєР»РёРµРЅС‚Р°" : "Р’С‹Р±СЂР°С‚СЊ РєР»РёРµРЅС‚Р°"}
                    </button>
                    {selectedClient && (
                      <button
                        type="button"
                        onClick={() => void applyClientSelection(null)}
                        disabled={clientSelectionLocked}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line-soft)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)] disabled:opacity-50"
                        aria-label="РЈР±СЂР°С‚СЊ РєР»РёРµРЅС‚Р° РёР· С‡РµРєР°"
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
                      <span>{selectedClient.phone || "РўРµР»РµС„РѕРЅ РЅРµ СѓРєР°Р·Р°РЅ"}</span>
                      <span>{getClientSubscriptionLabel(selectedClient)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[20px] border border-dashed border-[var(--line-soft)] bg-[rgba(13,17,23,0.24)] px-4 py-4 text-sm text-[var(--text-muted)]">
                    РљР»РёРµРЅС‚ РЅРµ РІС‹Р±СЂР°РЅ
                  </div>
                )}

                {clientSaving && <p className="mt-3 text-xs text-[var(--accent)]">РЎРѕС…СЂР°РЅСЏРµРј РєР»РёРµРЅС‚Р°...</p>}
                {serviceRequiresClient && !orderClientId && (
                  <p className="mt-3 text-xs text-[var(--warning)]">
                    Р’ С‡РµРєРµ РµСЃС‚СЊ СѓСЃР»СѓРіР°. Р’С‹Р±РµСЂРёС‚Рµ РєР»РёРµРЅС‚Р° РїРµСЂРµРґ РѕС‚РїСЂР°РІРєРѕР№ РЅР° РєР°СЃСЃСѓ.
                  </p>
                )}
              </div>

              {orderLoading ? (
                <div className="py-16 text-center text-sm text-[var(--text-muted)]">РџРѕРґРіРѕС‚Р°РІР»РёРІР°РµРј С‡РµРє...</div>
              ) : basketLines.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-12 text-center">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <ReceiptIcon />
                  </div>
                  <p className="mt-4 text-base font-medium text-[var(--text-main)]">Р§РµРє РїСѓСЃС‚</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Р’С‹Р±РµСЂРёС‚Рµ РїРѕР·РёС†РёСЋ СЃР»РµРІР° РёР»Рё РѕС‚СЃРєР°РЅРёСЂСѓР№С‚Рµ С€С‚СЂРёС…РєРѕРґ
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {basketLines.map((line) => {
                    const busy = lineBusyKey === line.key;
                    const savingDiscount = lineDiscountSavingKey === line.key;
                    const isEditingDiscount = editingLineDiscountKey === line.key;
                    const hasLineDiscount = line.discountTotal > 0;

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
                              <span>{formatMoney(line.salePrice)} Р·Р° С€С‚.</span>
                              {hasLineDiscount && (
                                <span className="rounded-full border border-[rgba(0,191,165,0.22)] px-2 py-0.5 text-[10px] text-[var(--accent)]">
                                  РЎРєРёРґРєР° {line.discountMoney > 0 ? formatMoney(line.discountMoney) : `${line.discountPercent}%`}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void removeLine(line)}
                            disabled={busy || orderLocked}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(248,81,73,0.22)] text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.1)] disabled:opacity-50"
                            aria-label={`РЈРґР°Р»РёС‚СЊ ${line.name}`}
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
                              aria-label={`РЈРјРµРЅСЊС€РёС‚СЊ РєРѕР»РёС‡РµСЃС‚РІРѕ ${line.name}`}
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
                              aria-label={`РЈРІРµР»РёС‡РёС‚СЊ РєРѕР»РёС‡РµСЃС‚РІРѕ ${line.name}`}
                            >
                              <PlusIcon />
                            </button>
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">РС‚РѕРіРѕ</p>
                            {hasLineDiscount && (
                              <p className="mt-1 text-xs text-[var(--text-muted)] line-through">{formatMoney(line.grossTotal)}</p>
                            )}
                            <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{formatMoney(line.total)}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => openLineDiscountEditor(line)}
                            disabled={busy || orderLocked || savingDiscount}
                            className="text-xs text-[var(--accent)] underline underline-offset-4 transition-colors hover:text-[var(--text-main)] disabled:opacity-50"
                          >
                            {hasLineDiscount ? "РР·РјРµРЅРёС‚СЊ СЃРєРёРґРєСѓ" : "РЎРєРёРґРєР°"}
                          </button>
                          {hasLineDiscount && <p className="text-xs text-[var(--accent)]">в€’{formatMoney(line.discountTotal)}</p>}
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
                                в‚Ѕ
                              </button>
                              <input
                                type="number"
                                min="0"
                                step={lineDiscountMode === "percent" ? "0.1" : "0.01"}
                                value={lineDiscountValue}
                                onChange={(event) => setLineDiscountValue(event.target.value)}
                                placeholder={lineDiscountMode === "percent" ? "0%" : "0 в‚Ѕ"}
                                className="min-w-[120px] flex-1 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                              />
                              <button
                                type="button"
                                onClick={() => void saveLineDiscount(line)}
                                disabled={savingDiscount}
                                className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#062b26] disabled:opacity-50"
                              >
                                {savingDiscount ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLineDiscountKey(null);
                                  setLineDiscountValue("");
                                }}
                                className="rounded-xl border border-[var(--line-soft)] px-3 py-2 text-xs text-[var(--text-muted)]"
                              >
                                Р—Р°РєСЂС‹С‚СЊ
                              </button>
                            </div>
                          </div>
                        )}

                        {busy && <p className="mt-3 text-xs text-[var(--accent)]">РћР±РЅРѕРІР»СЏРµРј РїРѕР·РёС†РёСЋ...</p>}
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
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">РЎРєРёРґРєР° РЅР° С‡РµРє</p>
                      <button
                        type="button"
                        onClick={() => scheduleReceiptDiscount("percent", receiptDiscountMode === "percent" ? receiptDiscountValue : "")}
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
                        onClick={() => scheduleReceiptDiscount("money", receiptDiscountMode === "money" ? receiptDiscountValue : "")}
                        disabled={orderLocked}
                        className={`rounded-full px-3 py-1 text-xs transition-colors ${
                          receiptDiscountMode === "money"
                            ? "bg-[var(--accent)] text-[#062b26]"
                            : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                        }`}
                      >
                        в‚Ѕ
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        step={receiptDiscountMode === "percent" ? "0.1" : "0.01"}
                        value={receiptDiscountValue}
                        onChange={(event) => scheduleReceiptDiscount(receiptDiscountMode, event.target.value)}
                        placeholder={receiptDiscountMode === "percent" ? "0%" : "0 в‚Ѕ"}
                        disabled={orderLocked}
                        className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
                      />
                      {receiptDiscountSaving && <span className="text-xs text-[var(--accent)]">РЎРѕС…СЂР°РЅСЏРµРј...</span>}
                    </div>
                  </div>
                )}

                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">РС‚РѕРі</p>
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
                        РЎРєРёРґРєР°: в€’{formatMoney(basketLineDiscountTotal + orderLevelDiscount)}
                      </p>
                    )}
                  </div>
                  <p className="text-right text-xs text-[var(--text-muted)]">
                    {basketLines.reduce((sum, line) => sum + line.quantity, 0)} С€С‚.
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
                    clientSaving
                  }
                  className="mt-5 inline-flex w-full items-center justify-center rounded-[18px] bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirming ? "РћС‚РїСЂР°РІР»СЏРµРј..." : orderAwaitingPayment ? "РћС‚РїСЂР°РІР»РµРЅРѕ РЅР° РєР°СЃСЃСѓ" : "РћС‚РїСЂР°РІРёС‚СЊ РЅР° РєР°СЃСЃСѓ"}
                </button>

                {sendBlockedByClient && (
                  <p className="mt-3 text-sm text-[var(--warning)]">Р’С‹Р±РµСЂРёС‚Рµ РєР»РёРµРЅС‚Р° РґР»СЏ СѓСЃР»СѓРіРё</p>
                )}

                {orderAwaitingPayment && (
                  <>
                    <p className="mt-4 text-sm text-[var(--text-muted)]">
                      Р§РµРє СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅ РЅР° РєР°СЃСЃСѓ. РџСЂРѕРІРµСЂСЏР№С‚Рµ РѕРїР»Р°С‚Сѓ РІРѕ РІРєР»Р°РґРєРµ РСЃС‚РѕСЂРёСЏ РїСЂРѕРґР°Р¶.
                    </p>
                    <button
                      type="button"
                      onClick={handleStartNewOrder}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-[18px] border border-[var(--line-soft)] px-4 py-3 text-sm font-medium text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                    >
                      РќРѕРІС‹Р№ С‡РµРє
                    </button>
                  </>
                )}
              </div>
            </div>
          </aside>
  );
}
