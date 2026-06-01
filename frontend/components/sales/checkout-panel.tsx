"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { ClientListItem } from "@/lib/api/clients";
import type { OrderDetail } from "@/lib/api/orders";
import { type BasketLine, type DiscountMode, ReceiptIcon } from "@/components/sales/sales-shared";
import { scannerLayoutMap } from "@/components/sales/sales-marking-utils";
import { CheckoutClientCard } from "@/components/sales/checkout-client-card";
import { CheckoutBasketLine } from "@/components/sales/checkout-basket-line";
import { CheckoutTotals } from "@/components/sales/checkout-totals";

type CheckoutPanelProps = {
  orderLoading: boolean;
  order: OrderDetail | null;
  basketLines: BasketLine[];
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
  handleClientSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  applyClientSelection: (client: ClientListItem | null) => void | Promise<void>;
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
  setEditingLineDiscountKey: (value: string | null) => void;
  receiptDiscountMode: DiscountMode;
  receiptDiscountValue: string;
  scheduleReceiptDiscount: (mode: DiscountMode, value: string) => void;
  receiptDiscountSaving: boolean;
  hasAnyDiscount: boolean;
  basketGrossTotal: number;
  basketLineDiscountTotal: number;
  orderLevelDiscount: number;
  markingDrafts: Record<string, string>;
  confirming: boolean;
  sendBlockedByClient: boolean;
  sendBlockedByMarking: boolean;
  setMarkingDraftValue: (lineKey: string, value: string) => void;
  handleConfirmCash: () => void | Promise<void>;
  handleInitiatePayment: () => void | Promise<void>;
  handleSyncV4: () => void | Promise<void>;
  receiptError: boolean;
  conflictingOperationId: string | null;
  slipPending: boolean;
  paymentBusy: boolean;
  pendingMarkingLineKey: string | null;
  onMarkingScanned: () => void;
  onMarkingFieldFocusChange: (active: boolean) => void;
};

export function CheckoutPanel({
  orderLoading,
  order,
  basketLines,
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
  setEditingLineDiscountKey,
  receiptDiscountMode,
  receiptDiscountValue,
  scheduleReceiptDiscount,
  receiptDiscountSaving,
  hasAnyDiscount,
  basketGrossTotal,
  basketLineDiscountTotal,
  orderLevelDiscount,
  markingDrafts,
  confirming,
  sendBlockedByClient,
  sendBlockedByMarking,
  setMarkingDraftValue,
  handleConfirmCash,
  handleInitiatePayment,
  handleSyncV4,
  receiptError,
  conflictingOperationId,
  slipPending,
  paymentBusy,
  pendingMarkingLineKey,
  onMarkingScanned,
  onMarkingFieldFocusChange,
}: CheckoutPanelProps) {
  const markingInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const markingScannerBufferRef = useRef("");
  const markingScannerLastTsRef = useRef(0);
  const markingRussianModeRef = useRef(false);

  // Auto-focus the marking input when scanner adds a marked product
  useEffect(() => {
    if (!pendingMarkingLineKey) return;
    const el = markingInputRefs.current.get(pendingMarkingLineKey);
    if (el) setTimeout(() => el.focus(), 60);
  }, [pendingMarkingLineKey]);

  function handleMarkingKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const now = Date.now();

    if (event.key === "Enter") {
      const buffer = markingScannerBufferRef.current.trim();
      const isScannerInput = buffer.length >= 6 && now - markingScannerLastTsRef.current <= 100;
      markingScannerBufferRef.current = "";
      markingScannerLastTsRef.current = 0;
      markingRussianModeRef.current = false;
      if (isScannerInput) {
        event.preventDefault();
        onMarkingScanned();
      }
      return;
    }

    if (event.key.length === 1) {
      if (now - markingScannerLastTsRef.current > 100) {
        markingScannerBufferRef.current = "";
        markingRussianModeRef.current = false;
      }

      const mapped = scannerLayoutMap[event.key];

      if (mapped !== undefined) {
        markingRussianModeRef.current = true;
        event.preventDefault();
        document.execCommand("insertText", false, mapped);
        markingScannerBufferRef.current += mapped;
      } else if (markingRussianModeRef.current && event.key === ".") {
        event.preventDefault();
        document.execCommand("insertText", false, "/");
        markingScannerBufferRef.current += "/";
      } else if (markingRussianModeRef.current && event.key === ",") {
        event.preventDefault();
        document.execCommand("insertText", false, "?");
        markingScannerBufferRef.current += "?";
      } else {
        markingScannerBufferRef.current += event.key;
      }

      markingScannerLastTsRef.current = now;
    }
  }

  return (
    <aside className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-[28px] bg-[var(--bg-card)] shadow-[0_4px_32px_rgba(0,0,0,0.22)]">
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

      <div className="flex min-h-0 flex-1 flex-col p-5">
        <CheckoutClientCard
          selectedClient={selectedClient}
          clientSelectionLocked={clientSelectionLocked}
          clientSaving={clientSaving}
          serviceRequiresClient={serviceRequiresClient}
          orderClientId={orderClientId}
          clientPickerOpen={clientPickerOpen}
          setClientPickerOpen={setClientPickerOpen}
          clientQuery={clientQuery}
          setClientQuery={setClientQuery}
          clientResults={clientResults}
          clientLoading={clientLoading}
          clientError={clientError}
          setClientError={setClientError}
          handleClientSearchKeyDown={handleClientSearchKeyDown}
          applyClientSelection={applyClientSelection}
        />

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {orderLoading ? (
            <div className="py-16 text-center text-sm text-[var(--text-muted)]">
              Подготавливаем чек...
            </div>
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
              {basketLines.map((line) => (
              <CheckoutBasketLine
                key={line.key}
                line={line}
                orderLocked={orderLocked}
                lineBusyKey={lineBusyKey}
                editingLineDiscountKey={editingLineDiscountKey}
                lineDiscountMode={lineDiscountMode}
                setLineDiscountMode={setLineDiscountMode}
                lineDiscountValue={lineDiscountValue}
                setLineDiscountValue={setLineDiscountValue}
                lineDiscountSavingKey={lineDiscountSavingKey}
                markingSavingKey={markingSavingKey}
                markingValue={markingDrafts[line.key] ?? line.markingCode ?? ""}
                pendingMarkingLineKey={pendingMarkingLineKey}
                markingInputRef={(el) => {
                  if (el) markingInputRefs.current.set(line.key, el);
                  else markingInputRefs.current.delete(line.key);
                }}
                openLineDiscountEditor={openLineDiscountEditor}
                saveLineDiscount={saveLineDiscount}
                setEditingLineDiscountKey={setEditingLineDiscountKey}
                removeLine={removeLine}
                decrementLine={decrementLine}
                incrementLine={incrementLine}
                setMarkingDraftValue={setMarkingDraftValue}
                onMarkingKeyDown={handleMarkingKeyDown}
                onMarkingFieldFocusChange={onMarkingFieldFocusChange}
              />
              ))}
            </div>
          )}
        </div>
      </div>

      <CheckoutTotals
        order={order}
        orderLocked={orderLocked}
        confirming={confirming}
        orderLoading={orderLoading}
        basketLinesCount={basketLines.length}
        basketItemsCount={basketLines.reduce((sum, line) => sum + line.quantity, 0)}
        hasAnyDiscount={hasAnyDiscount}
        basketGrossTotal={basketGrossTotal}
        basketLineDiscountTotal={basketLineDiscountTotal}
        orderLevelDiscount={orderLevelDiscount}
        receiptDiscountMode={receiptDiscountMode}
        receiptDiscountValue={receiptDiscountValue}
        receiptDiscountSaving={receiptDiscountSaving}
        sendBlockedByClient={sendBlockedByClient}
        sendBlockedByMarking={sendBlockedByMarking}
        clientSaving={clientSaving}
        scheduleReceiptDiscount={scheduleReceiptDiscount}
        handleConfirmCash={handleConfirmCash}
        handleInitiatePayment={handleInitiatePayment}
        handleSyncV4={handleSyncV4}
        receiptError={receiptError}
        conflictingOperationId={conflictingOperationId}
        slipPending={slipPending}
        paymentBusy={paymentBusy}
      />
    </aside>
  );
}
