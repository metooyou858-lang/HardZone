"use client";

import type { RefObject, KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  type BasketLine,
  type DiscountMode,
  CloseIcon,
  formatMoney,
  MinusIcon,
  PlusIcon,
} from "@/components/sales/sales-shared";

type CheckoutBasketLineProps = {
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
  const busy = lineBusyKey === line.key;
  const savingDiscount = lineDiscountSavingKey === line.key;
  const isEditingDiscount = editingLineDiscountKey === line.key;
  const isMarkingSaving = markingSavingKey === line.key;
  const hasLineDiscount = line.discountTotal > 0;
  const hasMarkingValue = markingValue.trim().length > 0;

  return (
    <div className="rounded-[24px] bg-[var(--bg-card-soft)] px-4 py-4">
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
              <span className="rounded-full border border-[rgba(94,244,216,0.18)] px-2 py-0.5 text-[10px] text-[var(--accent)]">
                Скидка {line.discountMoney > 0 ? formatMoney(line.discountMoney) : `${line.discountPercent}%`}
              </span>
            )}
          </div>
        </div>

        {canCreateSales ? (
          <button
            type="button"
            onClick={() => void removeLine(line)}
            disabled={busy || orderLocked}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(248,81,73,0.22)] text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.1)] disabled:opacity-50"
            aria-label={`Удалить ${line.name}`}
          >
            <CloseIcon />
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {canCreateSales ? (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-[var(--bg-panel)] p-1.5">
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
        ) : (
          <div className="rounded-2xl bg-[var(--bg-panel)] px-4 py-2 text-sm font-semibold text-[var(--text-main)]">
            {line.quantity} шт.
          </div>
        )}

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

      {canCreateSales ? (
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
      ) : null}

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
        <div className="mt-3 rounded-2xl border border-[rgba(94,244,216,0.12)] bg-[rgba(94,244,216,0.05)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Код маркировки
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {hasMarkingValue
                  ? "Код считан и будет приложен к этой позиции при отправке на кассу"
                  : "Отсканируйте DataMatrix перед отправкой чека на кассу"}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                hasMarkingValue
                  ? "border border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]"
                  : "border border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] text-[var(--warning)]"
              }`}
            >
              {hasMarkingValue ? "Считан" : "Нужен"}
            </span>
          </div>
          <div className="mt-3">
            <input
              ref={markingInputRef}
              type="text"
              value={markingValue}
              onChange={(event) => setMarkingDraftValue(line.key, event.target.value)}
              onKeyDown={onMarkingKeyDown}
              onFocus={() => onMarkingFieldFocusChange(true)}
              onBlur={() => onMarkingFieldFocusChange(false)}
              placeholder="Сканируйте или вставьте код маркировки"
              disabled={!canCreateSales || orderLocked || isMarkingSaving}
              className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
            />
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            {isMarkingSaving
              ? "Сохраняем код..."
              : hasMarkingValue
                ? "Код сохранится в строку чека автоматически в момент отправки на кассу."
                : "Код сохраняется в чек автоматически в момент отправки на кассу."}
          </p>
        </div>
      )}

      {busy && <p className="mt-3 text-xs text-[var(--accent)]">Обновляем позицию...</p>}
    </div>
  );
}
