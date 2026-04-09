"use client";

import { useRef, useState } from "react";

import { useCategories } from "@/hooks/useCategories";
import { useProductSearch } from "@/hooks/useProductSearch";
import { useProductTypes } from "@/hooks/useProductTypes";
import { useReceipt } from "@/hooks/useReceipt";

const inputCls =
  "w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const labelCls = "text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]";

export function NewSupplyPanel({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const search = useProductSearch();
  const { categories } = useCategories();
  const { types } = useProductTypes();
  const receipt = useReceipt(() => {
    onDone();
  });

  const [newTypeId, setNewTypeId] = useState("");
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newCostPrice, setNewCostPrice] = useState("");
  const [newIsMarked, setNewIsMarked] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState("");

  const [quantity, setQuantity] = useState("1");
  const [costPrice, setCostPrice] = useState("");
  const [comment, setComment] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);

  const selectedType = types.find((type) => type.id === newTypeId);
  const hasStock = selectedType?.has_stock ?? true;
  const hasCostPrice = selectedType?.has_cost_price ?? true;
  const hasSalePrice = selectedType?.has_sale_price ?? true;
  const hasBarcode = selectedType?.has_barcode ?? true;
  const hasMarking = selectedType?.has_marking ?? false;

  const mode = search.product ? "receipt" : search.notFound ? "new" : "search";

  async function handleSubmit() {
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (hasStock && (!parsedQuantity || parsedQuantity <= 0)) {
      return;
    }

    if (mode === "receipt" && search.product) {
      await receipt.submit({
        product_id: search.product.id,
        quantity: parsedQuantity,
        method: "manual",
        cost_price_at_receipt: costPrice ? Number.parseFloat(costPrice) : null,
        comment: comment || null,
      });
      return;
    }

    if (mode === "new" && newName.trim()) {
      await receipt.createAndReceive(
        {
          name: newName.trim(),
          product_type_id: newTypeId ? Number.parseInt(newTypeId, 10) : undefined,
          sku: hasBarcode ? newSku || undefined : undefined,
          barcode: hasBarcode && /^\d{6,}$/.test(search.query) ? search.query : undefined,
          cost_price: hasCostPrice && newCostPrice ? Number.parseFloat(newCostPrice) : undefined,
          sale_price: hasSalePrice && newSalePrice ? Number.parseFloat(newSalePrice) : undefined,
          is_marked: hasMarking ? newIsMarked : false,
          category_id: newCategoryId ? Number.parseInt(newCategoryId, 10) : null,
        },
        hasStock
          ? {
              quantity: parsedQuantity,
              method: "manual",
              cost_price_at_receipt: newCostPrice ? Number.parseFloat(newCostPrice) : null,
              comment: comment || null,
            }
          : {
              quantity: 0,
              method: "manual",
            }
      );
    }
  }

  return (
    <div className="max-w-xl space-y-5 rounded-2xl border border-[var(--line-soft)] bg-[var(--bg-card)] p-6">
      <div className="flex items-center justify-between">
        <p className="font-medium text-[var(--text-main)]">Новая поставка</p>
        <button onClick={onClose} className="text-lg text-[var(--text-muted)] hover:text-[var(--text-main)]">
          ✕
        </button>
      </div>

      <div>
        <label className={labelCls}>Товар</label>
        <input
          type="text"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          placeholder="Штрихкод или название..."
          className={`mt-1 ${inputCls}`}
          autoFocus
        />
        {search.searching && <p className="mt-1 text-xs text-[var(--text-muted)]">Поиск...</p>}
        {search.error && <p className="mt-1 text-xs text-[var(--danger)]">{search.error}</p>}
      </div>

      {mode === "receipt" && search.product && (
        <div className="rounded-xl border border-[rgba(0,191,165,0.28)] bg-[rgba(0,191,165,0.08)] px-4 py-3">
          <p className="font-medium text-[var(--text-main)]">{search.product.name}</p>
          <div className="mt-0.5 flex gap-3 text-xs text-[var(--text-muted)]">
            {search.product.sku && <span className="font-mono">{search.product.sku}</span>}
            {search.product.has_stock && <span>остаток: {search.product.stock} шт.</span>}
            {search.product.category_name && <span>{search.product.category_name}</span>}
          </div>
        </div>
      )}

      {mode === "new" && (
        <div className="space-y-4 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4">
          <p className="text-sm font-medium text-[var(--accent)]">Товар не найден — создайте карточку</p>

          <div>
            <label className={labelCls}>Тип позиции</label>
            <select
              value={newTypeId}
              onChange={(event) => setNewTypeId(event.target.value)}
              className={`mt-1 ${inputCls}`}
            >
              <option value="">Выберите тип...</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelCls}>Название *</label>
              <input
                ref={nameRef}
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className={`mt-1 ${inputCls}`}
              />
            </div>

            {hasCostPrice && (
              <div>
                <label className={labelCls}>Цена закупки ₽</label>
                <input
                  type="number"
                  min="0"
                  value={newCostPrice}
                  onChange={(event) => setNewCostPrice(event.target.value)}
                  className={`mt-1 ${inputCls}`}
                />
              </div>
            )}

            {hasSalePrice && (
              <div>
                <label className={labelCls}>Цена продажи ₽</label>
                <input
                  type="number"
                  min="0"
                  value={newSalePrice}
                  onChange={(event) => setNewSalePrice(event.target.value)}
                  className={`mt-1 ${inputCls}`}
                />
              </div>
            )}

            {hasBarcode && (
              <div>
                <label className={labelCls}>SKU / Артикул</label>
                <input
                  type="text"
                  value={newSku}
                  onChange={(event) => setNewSku(event.target.value)}
                  placeholder="необязательно"
                  className={`mt-1 ${inputCls}`}
                />
              </div>
            )}

            <div>
              <label className={labelCls}>Категория</label>
              <select
                value={newCategoryId}
                onChange={(event) => setNewCategoryId(event.target.value)}
                className={`mt-1 ${inputCls}`}
              >
                <option value="">Без категории</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {hasMarking && (
              <div className="flex items-center gap-3 md:col-span-2">
                <input
                  type="checkbox"
                  id="new-marked"
                  checked={newIsMarked}
                  onChange={(event) => setNewIsMarked(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--line-soft)] bg-[var(--bg-card)]"
                />
                <label htmlFor="new-marked" className="text-sm text-[var(--text-muted)]">
                  Маркированный товар (Честный знак)
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {(mode === "receipt" || (mode === "new" && hasStock)) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Количество</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </div>

          {mode === "receipt" && (
            <div>
              <label className={labelCls}>Цена закупки ₽</label>
              <input
                type="number"
                min="0"
                value={costPrice}
                onChange={(event) => setCostPrice(event.target.value)}
                placeholder={search.product?.cost_price ?? "необязательно"}
                className={`mt-1 ${inputCls}`}
              />
            </div>
          )}

          <div className="md:col-span-2">
            <label className={labelCls}>Комментарий</label>
            <input
              type="text"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="необязательно"
              className={`mt-1 ${inputCls}`}
            />
          </div>
        </div>
      )}

      {receipt.error && (
        <div className="rounded-xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.1)] px-4 py-3 text-sm text-[var(--danger)]">
          {receipt.error}
        </div>
      )}

      {mode === "receipt" && search.product && (
        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={receipt.submitting}
          className="w-full rounded-xl bg-[var(--accent)] py-3 font-medium text-[#062b26] transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {receipt.submitting ? "Сохраняем..." : `Принять ${quantity} шт.`}
        </button>
      )}

      {mode === "new" && (
        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={receipt.submitting || !newName.trim()}
          className="w-full rounded-xl bg-[var(--accent)] py-3 font-medium text-[#062b26] transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {receipt.submitting
            ? "Сохраняем..."
            : !hasStock
              ? "Создать позицию"
              : `Создать и принять ${quantity} шт.`}
        </button>
      )}
    </div>
  );
}
