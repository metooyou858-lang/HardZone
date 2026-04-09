"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";

import { useInventory } from "@/hooks/useInventory";
import { InventoryItem } from "@/lib/api/inventories";

const inputCls =
  "w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const labelCls = "text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]";

function DiffBadge({ diff }: { diff: number | null }) {
  if (diff === null) {
    return <span className="text-[var(--text-muted)]">-</span>;
  }

  if (diff === 0) {
    return <span className="font-medium text-[var(--success)]">✓</span>;
  }

  return (
    <span className={`font-semibold ${diff > 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
      {diff > 0 ? `+${diff}` : diff}
    </span>
  );
}

function ItemRow({
  item,
  onUpdate,
}: {
  item: InventoryItem;
  onUpdate: (item: InventoryItem, qty: number) => void;
}) {
  const [value, setValue] = useState(item.actual_qty !== null ? String(item.actual_qty) : "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(item.actual_qty !== null ? String(item.actual_qty) : "");
  }, [item.actual_qty]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;
    setValue(nextValue);

    if (timer.current) {
      clearTimeout(timer.current);
    }

    const parsed = Number.parseInt(nextValue, 10);

    if (!Number.isNaN(parsed) && parsed >= 0) {
      timer.current = setTimeout(() => {
        onUpdate(item, parsed);
      }, 600);
    }
  }

  const hasDiff = item.actual_qty !== null && item.difference !== 0;

  return (
    <div
      className={`flex items-center gap-4 border-b border-[var(--line-soft)] px-5 py-3 transition-colors last:border-0 ${
        hasDiff ? "bg-[rgba(210,153,34,0.08)]" : "hover:bg-white/3"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-main)]">{item.product_name}</p>
        <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
          {item.category_name && <span>{item.category_name}</span>}
          {item.product_sku && <span className="font-mono">{item.product_sku}</span>}
          {item.barcode && <span className="font-mono">{item.barcode}</span>}
        </div>
      </div>

      <div className="w-20 shrink-0 text-right">
        <p className={labelCls}>Ожидается</p>
        <p className="mt-1 text-sm font-medium text-[var(--text-main)]">{item.expected_qty} шт.</p>
      </div>

      <div className="w-24 shrink-0">
        <p className={`${labelCls} text-right`}>Факт</p>
        <input
          type="number"
          min="0"
          value={value}
          onChange={handleChange}
          placeholder="-"
          className="mt-1 w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-1.5 text-center text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        />
      </div>

      <div className="w-16 shrink-0 text-right">
        <p className={labelCls}>Δ</p>
        <p className="mt-1 text-sm">
          <DiffBadge diff={item.difference} />
        </p>
      </div>
    </div>
  );
}

export function InventoryTab() {
  const inventory = useInventory();
  const [comment, setComment] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(true);
  const [showStart, setShowStart] = useState(false);
  const [filter, setFilter] = useState<"all" | "diff" | "empty">("all");

  const filteredItems =
    inventory.active?.items.filter((item) => {
      if (filter === "diff") {
        return item.actual_qty !== null && item.difference !== 0;
      }

      if (filter === "empty") {
        return item.actual_qty === null;
      }

      return true;
    }) ?? [];

  const progress =
    inventory.totalCount > 0
      ? Math.round((inventory.filledCount / inventory.totalCount) * 100)
      : 0;

  if (inventory.loading) {
    return <div className="py-12 text-center text-sm text-[var(--text-muted)]">Загрузка...</div>;
  }

  return (
    <div className="space-y-5">
      {inventory.error && (
        <div className="rounded-xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {inventory.error}
        </div>
      )}

      {!inventory.active && (
        <div className="space-y-5">
          {!showStart ? (
            <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-8 text-center">
              <p className="text-lg font-semibold text-[var(--text-main)]">Инвентаризация</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-muted)]">
                Система фиксирует текущие остатки, вы вводите фактические, а расхождения
                корректируются после подтверждения.
              </p>
              <button
                onClick={() => setShowStart(true)}
                className="mt-6 rounded-xl bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[#062b26] transition-colors hover:brightness-110"
              >
                Начать инвентаризацию
              </button>
            </div>
          ) : (
            <div className="max-w-lg space-y-4 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
              <p className="font-medium text-[var(--text-main)]">Новая инвентаризация</p>
              <div>
                <label className={labelCls}>Комментарий</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Плановая, квартальная..."
                  className={`mt-1 ${inputCls}`}
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="only-in-stock"
                  checked={onlyInStock}
                  onChange={(event) => setOnlyInStock(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-600"
                />
                <label htmlFor="only-in-stock" className="text-sm text-slate-300">
                  Только товары в наличии (stock &gt; 0)
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await inventory.start(comment, onlyInStock);
                    setShowStart(false);
                    setComment("");
                    setOnlyInStock(true);
                  }}
                  disabled={inventory.saving}
                  className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[#062b26] transition-colors hover:brightness-110 disabled:opacity-50"
                >
                  {inventory.saving ? "Создаём..." : "Создать"}
                </button>
                <button
                  onClick={() => {
                    setShowStart(false);
                    setOnlyInStock(true);
                  }}
                  className="rounded-xl border border-[var(--line-soft)] px-5 py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--text-main)]"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {inventory.inventories.filter((item) => item.status === "confirmed").length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
              <div className="border-b border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  История инвентаризаций
                </p>
              </div>
              {inventory.inventories
                .filter((item) => item.status === "confirmed")
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 border-b border-[var(--line-soft)] px-5 py-4 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--text-main)]">
                        {new Date(item.created_at).toLocaleDateString("ru", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      {item.comment && (
                        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.comment}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-[rgba(63,185,80,0.12)] px-2.5 py-1 text-xs font-medium text-[var(--success)]">
                        Завершена
                      </span>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {item.total_items} позиций · {item.items_with_diff} расхождений
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {inventory.active && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[rgba(210,153,34,0.28)] bg-[rgba(210,153,34,0.08)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[rgba(210,153,34,0.2)] px-2.5 py-1 text-xs font-medium text-[var(--warning)]">
                    В процессе
                  </span>
                  {inventory.active.comment && (
                    <span className="text-sm text-[var(--text-main)]">{inventory.active.comment}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Заполнено {inventory.filledCount} из {inventory.totalCount} позиций
                  {inventory.diffCount > 0 && (
                    <span className="ml-2 font-medium text-[var(--warning)]">
                      · {inventory.diffCount} расхождений
                    </span>
                  )}
                </p>
                <div className="mt-3 h-2 w-64 overflow-hidden rounded-full bg-[rgba(210,153,34,0.18)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => {
                    if (window.confirm("Удалить черновик инвентаризации?")) {
                      void inventory.remove();
                    }
                  }}
                  disabled={inventory.saving}
                  className="rounded-xl border border-[rgba(248,81,73,0.35)] px-4 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.08)] disabled:opacity-50"
                >
                  Удалить
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `Подтвердить инвентаризацию? Остатки будут обновлены по ${inventory.filledCount} позициям.`
                      )
                    ) {
                      void inventory.confirm();
                    }
                  }}
                  disabled={inventory.confirming || inventory.filledCount !== inventory.totalCount}
                  className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062b26] transition-colors hover:brightness-110 disabled:opacity-50"
                >
                  {inventory.confirming
                    ? "Применяем..."
                    : `Подтвердить · ${inventory.filledCount} позиций`}
                </button>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {([
              ["all", "Все", inventory.totalCount],
              ["empty", "Не заполнены", inventory.totalCount - inventory.filledCount],
              ["diff", "Расхождения", inventory.diffCount],
            ] as const).map(([value, label, count]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  filter === value
                    ? "bg-[var(--accent-soft)] text-[var(--text-main)]"
                    : "border border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-white/5"
                }`}
              >
                {label}
                <span
                  className={`ml-1.5 text-xs ${
                    filter === value ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
                  }`}
                >
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)]">
            <div className="hidden grid-cols-[1fr_120px_120px_80px] gap-4 border-b border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-3 sm:grid">
              <span className={labelCls}>Товар</span>
              <span className={`${labelCls} text-right`}>Ожидается</span>
              <span className={`${labelCls} text-right`}>Факт</span>
              <span className={`${labelCls} text-right`}>Δ</span>
            </div>

            {filteredItems.length === 0 && (
              <div className="py-10 text-center text-sm text-[var(--text-muted)]">
                {filter === "diff"
                  ? "Расхождений нет"
                  : filter === "empty"
                    ? "Все позиции заполнены"
                    : "Позиций нет"}
              </div>
            )}

            {filteredItems.map((item) => (
              <ItemRow key={item.id} item={item} onUpdate={inventory.updateItem} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
