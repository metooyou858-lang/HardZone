"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { useInventory } from "@/hooks/useInventory";
import { InventoryItem } from "@/lib/api/inventories";

const inputCls =
  "w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function DiffBadge({ diff }: { diff: number | null }) {
  if (diff === null) {
    return <span className="text-xs text-slate-300">—</span>;
  }

  if (diff === 0) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        ок
      </span>
    );
  }

  if (diff > 0) {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
        +{diff}
      </span>
    );
  }

  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      {diff}
    </span>
  );
}

function ItemRow({
  item,
  inventoryId,
  onUpdate,
  disabled,
}: {
  item: InventoryItem;
  inventoryId: string;
  onUpdate: (inventoryId: string, itemId: string, qty: number) => void;
  disabled: boolean;
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
        onUpdate(inventoryId, item.id, parsed);
      }, 500);
    }
  }

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_96px_96px_72px] items-center gap-4 border-b border-slate-50 px-5 py-3 transition-colors hover:bg-slate-50/60 ${
        item.actual_qty !== null && item.difference !== 0 ? "bg-red-50/30" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{item.product_name}</p>
        <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-400">
          {item.category_name && <span>{item.category_name}</span>}
          {item.product_sku && <span className="font-mono">{item.product_sku}</span>}
          {item.barcode && <span className="font-mono">{item.barcode}</span>}
        </div>
      </div>

      <div className="text-right">
        <p className="text-xs text-slate-400">По системе</p>
        <p className="font-medium text-slate-700">{item.expected_qty} шт.</p>
      </div>

      <div className="text-right">
        <p className="mb-1 text-xs text-slate-400">Фактически</p>
        {disabled ? (
          <p className="font-medium text-slate-700">
            {item.actual_qty !== null ? `${item.actual_qty} шт.` : "—"}
          </p>
        ) : (
          <input
            type="number"
            min="0"
            value={value}
            onChange={handleChange}
            placeholder="—"
            className={inputCls}
          />
        )}
      </div>

      <div className="text-center">
        <p className="mb-1 text-xs text-slate-400">Разница</p>
        <DiffBadge diff={item.difference} />
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const inventory = useInventory();
  const [comment, setComment] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);

  useEffect(() => {
    void inventory.loadList();
  }, [inventory.loadList]);

  async function handleCreate() {
    const created = await inventory.create(comment || undefined);
    if (created) {
      setComment("");
      setShowCreateForm(false);
    }
  }

  async function handleConfirm() {
    if (!inventory.current) {
      return;
    }

    const confirmed = await inventory.confirm(inventory.current.id);
    if (confirmed) {
      setConfirmDialog(false);
    }
  }

  const items = inventory.current?.items ?? [];
  const currentInventory = inventory.current;
  const filledItems = items.filter((item) => item.actual_qty !== null).length;
  const diffItems = items.filter((item) => item.difference !== null && item.difference !== 0).length;
  const visibleItems = onlyDiff
    ? items.filter((item) => item.difference !== null && item.difference !== 0)
    : items;
  const isDraft = currentInventory?.status === "draft";
  const canConfirm = isDraft && items.length > 0 && filledItems === items.length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-slate-400">warehouse</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Инвентаризация</h1>
        </div>
        <Link
          href="/warehouse"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← Склад
        </Link>
      </div>

      {inventory.error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {inventory.error}
        </div>
      )}

      {!inventory.current && (
        <div className="space-y-4">
          <div className="max-w-xl space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <p className="font-medium text-slate-900">Новая инвентаризация</p>
            <p className="text-sm leading-6 text-slate-500">
              Система зафиксирует текущие остатки по всем товарам. После этого вы вводите
              фактическое количество, смотрите расхождения и только потом подтверждаете
              корректировку остатков.
            </p>

            {showCreateForm ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Комментарий (необязательно)..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  autoFocus
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      void handleCreate();
                    }}
                    disabled={inventory.submitting}
                    className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {inventory.submitting ? "Создаём..." : "Начать инвентаризацию"}
                  </button>
                  <button
                    onClick={() => setShowCreateForm(false)}
                    className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateForm(true)}
                className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-600"
              >
                Начать инвентаризацию
              </button>
            )}
          </div>

          {inventory.inventories.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  История инвентаризаций
                </p>
              </div>

              {inventory.inventories.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => {
                    void inventory.loadOne(item.id);
                  }}
                  className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50 ${
                    index < inventory.inventories.length - 1 ? "border-b border-slate-50" : ""
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.status === "confirmed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {item.status === "confirmed" ? "Завершена" : "Черновик"}
                      </span>
                      {item.comment && <span className="text-sm text-slate-600">{item.comment}</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(item.created_at).toLocaleString("ru", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" · "}
                      {item.total_items} позиций
                      {item.items_with_diff > 0 && (
                        <span className="text-red-500"> · {item.items_with_diff} расхождений</span>
                      )}
                    </p>
                  </div>
                  <span className="text-slate-300">→</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {currentInventory && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      isDraft ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {isDraft ? "В процессе" : "Завершена"}
                  </span>
                  {currentInventory.comment && (
                    <span className="text-sm text-slate-600">{currentInventory.comment}</span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-6 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Заполнено</p>
                    <p className="font-semibold text-slate-900">
                      {filledItems} / {items.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Расхождений</p>
                    <p
                      className={`font-semibold ${
                        diffItems > 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {diffItems}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Дата</p>
                    <p className="text-xs font-semibold text-slate-900">
                      {new Date(currentInventory.created_at).toLocaleString("ru", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                {isDraft && (
                  <>
                    <button
                      onClick={() => setConfirmDialog(true)}
                      disabled={!canConfirm || inventory.submitting}
                      className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                    >
                      Подтвердить
                    </button>
                        <button
                          onClick={() => {
                            void inventory.remove(currentInventory.id);
                          }}
                      disabled={inventory.submitting}
                      className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50"
                    >
                      Удалить
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    inventory.clearCurrent();
                    void inventory.loadList();
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-500 hover:bg-slate-50"
                >
                  К списку
                </button>
              </div>
            </div>

            {isDraft && !canConfirm && (
              <p className="mt-4 text-sm text-slate-500">
                Подтверждение станет доступно, когда вы заполните фактическое количество для всех
                позиций.
              </p>
            )}
          </div>

          {confirmDialog && (
            <div className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50 p-5">
              <p className="font-medium text-amber-800">Подтвердить инвентаризацию?</p>
              <p className="text-sm leading-6 text-amber-700">
                Остатки по <strong>{filledItems}</strong> товарам будут обновлены.
                {diffItems > 0 && (
                  <>
                    {" "}У <strong>{diffItems}</strong> товаров зафиксированы расхождения.
                  </>
                )}{" "}
                Это действие нельзя отменить.
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    void handleConfirm();
                  }}
                  disabled={inventory.submitting}
                  className="rounded-xl bg-emerald-500 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  {inventory.submitting ? "Применяем..." : "Да, применить"}
                </button>
                <button
                  onClick={() => setConfirmDialog(false)}
                  className="rounded-xl border border-slate-200 px-5 py-2 text-sm text-slate-500 hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {isDraft && diffItems > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setOnlyDiff(false)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  !onlyDiff
                    ? "bg-slate-800 text-white"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                Все ({items.length})
              </button>
              <button
                onClick={() => setOnlyDiff(true)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  onlyDiff
                    ? "bg-red-500 text-white"
                    : "border border-red-200 text-red-500 hover:bg-red-50"
                }`}
              >
                Только расхождения ({diffItems})
              </button>
            </div>
          )}

          {inventory.loading ? (
            <div className="py-10 text-center text-sm text-slate-400">Загрузка...</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_96px_96px_72px] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-3">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Товар</div>
                <div className="text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  По системе
                </div>
                <div className="text-right text-xs font-medium uppercase tracking-wider text-slate-400">
                  Фактически
                </div>
                <div className="text-center text-xs font-medium uppercase tracking-wider text-slate-400">
                  Разница
                </div>
              </div>

              {visibleItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  inventoryId={currentInventory.id}
                  onUpdate={inventory.updateItem}
                  disabled={!isDraft}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
