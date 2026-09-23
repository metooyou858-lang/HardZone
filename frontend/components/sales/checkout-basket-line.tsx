"use client";

import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ServiceRecipientPicker } from "@/components/sales/service-recipient-picker";

import {
  type BasketLine,
  type DiscountMode,
  CloseIcon,
  formatMoney,
  MinusIcon,
  PlusIcon,
} from "@/components/sales/sales-shared";

type CheckoutBasketLineProps = {
  inheritedRecipientName?: string | null;
  changeRecipient: (itemId: string, clientId: string | null) => Promise<void>;
  line: BasketLine;
  orderLocked: boolean;
  canCreateSales: boolean;
  lineBusyKey: string | null;
  editingLineDiscountKey: string | null;
  lineDiscountMode: DiscountMode;
  setLineDiscountMode: (value: DiscountMode) => void;
  lineDiscountValue: string;
  setLineDiscountValue: (value: string) => void;
  lineDiscountSavingKey: string | null;
  markingSavingKey: string | null;
  markingValue: string;
  pendingMarkingLineKey: string | null;
  markingInputRef: (el: HTMLInputElement | null) => void;
  openLineDiscountEditor: (line: BasketLine) => void;
  saveLineDiscount: (line: BasketLine) => void | Promise<void>;
  setEditingLineDiscountKey: (value: string | null) => void;
  removeLine: (line: BasketLine) => void | Promise<void>;
  decrementLine: (line: BasketLine) => void | Promise<void>;
  incrementLine: (line: BasketLine) => void | Promise<void>;
  setMarkingDraftValue: (lineKey: string, value: string) => void;
  onMarkingKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onMarkingFieldFocusChange: (active: boolean) => void;
};

export function CheckoutBasketLine({
  inheritedRecipientName,
  changeRecipient,
  line,
  orderLocked,
  canCreateSales,
  lineBusyKey,
  editingLineDiscountKey,
  lineDiscountMode,
  setLineDiscountMode,
  lineDiscountValue,
  setLineDiscountValue,
  lineDiscountSavingKey,
  markingSavingKey,
  markingValue,
  markingInputRef,
  openLineDiscountEditor,
  saveLineDiscount,
  setEditingLineDiscountKey,
  removeLine,
  decrementLine,
  incrementLine,
  setMarkingDraftValue,
  onMarkingKeyDown,
  onMarkingFieldFocusChange,
}: CheckoutBasketLineProps) {
  const [editingMarking, setEditingMarking] = useState(false);
  const busy = lineBusyKey === line.key;
  const savingDiscount = lineDiscountSavingKey === line.key;
  const isEditingDiscount = editingLineDiscountKey === line.key;
  const isMarkingSaving = markingSavingKey === line.key;
  const hasLineDiscount = line.discountTotal > 0;
  const hasMarkingValue = markingValue.trim().length > 0;

  return (
    <div className="border-b border-[var(--line-soft)] py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-[var(--text-main)]">{line.name}</p>

        </div>

        <div className="shrink-0 text-right text-sm font-semibold text-[var(--text-main)]">
          {hasLineDiscount && <p className="text-xs font-normal text-[var(--text-muted)] line-through">{formatMoney(line.grossTotal)}</p>}
          <p className="whitespace-nowrap">{formatMoney(line.total)}</p>
        </div>
        {canCreateSales ? (
          <button
            type="button"
            onClick={() => void removeLine(line)}
            disabled={busy || orderLocked}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.1)] disabled:opacity-50"
            aria-label={`Удалить ${line.name}`}
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {canCreateSales ? (
          <div className="inline-flex shrink-0 items-center rounded-xl bg-[var(--bg-panel)]">
          <button
            type="button"
            onClick={() => void decrementLine(line)}
            disabled={busy || orderLocked}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-main)] transition-colors hover:bg-white/5 disabled:opacity-50"
            aria-label={`Уменьшить количество ${line.name}`}
          >
            <MinusIcon />
          </button>
          <span className="min-w-6 text-center text-sm font-semibold text-[var(--text-main)]">
            {line.quantity}
          </span>
          <button
            type="button"
            onClick={() => void incrementLine(line)}
            disabled={busy || orderLocked}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--text-main)] transition-colors hover:bg-white/5 disabled:opacity-50"
            aria-label={`Увеличить количество ${line.name}`}
          >
            <PlusIcon />
          </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-[var(--bg-panel)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]">
            {line.quantity} шт.
          </div>
        )}

        <span className="text-xs text-[var(--text-muted)]">{formatMoney(line.salePrice)} / шт.</span>
        {canCreateSales && <button type="button" onClick={() => openLineDiscountEditor(line)}
          disabled={busy || orderLocked || savingDiscount}
          className="ml-auto min-h-11 text-xs text-[var(--accent)] disabled:opacity-50">
          {hasLineDiscount ? `Скидка −${formatMoney(line.discountTotal)}` : "Скидка"}
        </button>}
      </div>
      {(line.kind === 'service' || line.kind === 'subscription') && <ServiceRecipientPicker
        name={line.recipientName} inheritedName={inheritedRecipientName}
        disabled={orderLocked || busy || !canCreateSales}
        onChange={(clientId) => changeRecipient(line.itemIds[0], clientId)} />}

      {canCreateSales && isEditingDiscount && (
        <div className="mt-3 rounded-2xl bg-[var(--bg-panel)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLineDiscountMode("percent")}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                lineDiscountMode === "percent"
                  ? "bg-[var(--accent)] text-[var(--text-inverse)]"
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
                  ? "bg-[var(--accent)] text-[var(--text-inverse)]"
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
              className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--text-inverse)] disabled:opacity-50"
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
        <div className="mt-1">
          {!editingMarking && hasMarkingValue ? (
            <div className="flex min-h-11 items-center justify-between gap-2 text-xs">
              <span className="text-[var(--accent)]">{isMarkingSaving ? "Сохраняем код…" : line.markingCode === markingValue ? "Код сохранён" : "Код введён"}</span>
              <button type="button" onClick={() => setEditingMarking(true)} disabled={orderLocked || !canCreateSales}
                className="min-h-11 text-[var(--text-muted)] disabled:opacity-50">Изменить код</button>
            </div>
          ) : (
            <input
              ref={markingInputRef}
              autoFocus={editingMarking}
              aria-label={`Код маркировки: ${line.name}`}
              type="text"
              value={markingValue}
              onChange={(event) => { setEditingMarking(true); setMarkingDraftValue(line.key, event.target.value); }}
              onKeyDown={(event) => { onMarkingKeyDown(event); if (event.key === "Enter" && hasMarkingValue) { setEditingMarking(false); onMarkingFieldFocusChange(false); event.currentTarget.blur(); } }}
              onFocus={() => { setEditingMarking(true); onMarkingFieldFocusChange(true); }}
              onBlur={() => { setEditingMarking(false); onMarkingFieldFocusChange(false); }}
              placeholder="Сканировать код маркировки"
              disabled={!canCreateSales || orderLocked || isMarkingSaving}
              className="min-h-11 w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-panel)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
            />
          )}
        </div>
      )}

      {busy && <p className="mt-3 text-xs text-[var(--accent)]">Обновляем позицию...</p>}
    </div>
  );
}
