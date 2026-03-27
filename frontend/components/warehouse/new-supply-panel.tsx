"use client";

import { useEffect, useState } from "react";

import { useProductSearch } from "@/hooks/useProductSearch";
import { useReceipt } from "@/hooks/useReceipt";

import { inputCls, isBarcodeQuery, labelCls, makeAutoSku } from "./shared";

export function NewSupplyPanel({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const search = useProductSearch();
  const [quantity, setQuantity] = useState("1");
  const [costPrice, setCostPrice] = useState("");
  const [comment, setComment] = useState("");
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newIsMarked, setNewIsMarked] = useState(false);
  const receipt = useReceipt(() => {
    onDone();
    onClose();
  });

  const mode = search.product ? "receipt" : search.notFound ? "new" : "search";

  useEffect(() => {
    if (search.product) {
      setCostPrice(search.product.cost_price ?? "");
    }
  }, [search.product]);

  useEffect(() => {
    if (search.notFound) {
      const trimmedQuery = search.query.trim();
      setNewName(isBarcodeQuery(trimmedQuery) ? "" : trimmedQuery);
      setNewSku(isBarcodeQuery(trimmedQuery) ? trimmedQuery : "");
    }
  }, [search.notFound, search.query]);

  async function handleSubmit() {
    const parsedQuantity = Number.parseInt(quantity, 10);

    if (!parsedQuantity || parsedQuantity <= 0) {
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
    }

    if (mode === "new" && newName.trim()) {
      const trimmedQuery = search.query.trim();

      await receipt.createAndReceive(
        {
          name: newName.trim(),
          sku: newSku.trim() || makeAutoSku(trimmedQuery),
          barcode: isBarcodeQuery(trimmedQuery) ? trimmedQuery : undefined,
          cost_price: costPrice ? Number.parseFloat(costPrice) : undefined,
          sale_price: newSalePrice ? Number.parseFloat(newSalePrice) : undefined,
          is_marked: newIsMarked,
        },
        {
          quantity: parsedQuantity,
          method: "manual",
          cost_price_at_receipt: costPrice ? Number.parseFloat(costPrice) : null,
          comment: comment || null,
        }
      );
    }
  }

  return (
    <div className="max-w-3xl space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-900">Новая поставка</p>
          <p className="mt-1 text-sm text-slate-500">
            Поиск по штрихкоду или названию для товаров вне текущего списка.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:bg-slate-50"
        >
          Закрыть
        </button>
      </div>

      <div>
        <label className={labelCls}>Товар</label>
        <input
          type="text"
          value={search.query}
          onChange={(event) => {
            search.setQuery(event.target.value);
            if (!event.target.value.trim()) {
              setNewName("");
              setNewSku("");
              setNewSalePrice("");
              setNewIsMarked(false);
            }
          }}
          placeholder="Штрихкод или название..."
          className={`mt-1 ${inputCls}`}
          autoFocus
        />
        {search.searching && <p className="mt-1 text-xs text-slate-400">Поиск...</p>}
        {search.error && <p className="mt-1 text-xs text-red-500">{search.error}</p>}
      </div>

      {mode === "receipt" && search.product && (
        <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
          <p className="font-medium text-slate-900">{search.product.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            {search.product.sku} · остаток: {search.product.stock} шт.
          </p>
        </div>
      )}

      {mode === "new" && (
        <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4">
          <p className="text-sm font-medium text-blue-700">
            Товар не найден — создайте новую карточку
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelCls}>Название *</label>
              <input
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className={`mt-1 ${inputCls}`}
              />
            </div>
            <div>
              <label className={labelCls}>SKU</label>
              <input
                type="text"
                value={newSku}
                onChange={(event) => setNewSku(event.target.value)}
                placeholder={isBarcodeQuery(search.query) ? "По умолчанию будет код" : ""}
                className={`mt-1 ${inputCls}`}
              />
            </div>
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
            <div className="md:col-span-2 flex items-center gap-3">
              <input
                id="new-supply-marked"
                type="checkbox"
                checked={newIsMarked}
                onChange={(event) => setNewIsMarked(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="new-supply-marked" className="text-sm text-slate-600">
                Маркированный товар
              </label>
            </div>
          </div>
        </div>
      )}

      {(mode === "receipt" || mode === "new") && (
        <div className="grid gap-3 md:grid-cols-3">
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
          <div>
            <label className={labelCls}>Цена закупки ₽</label>
            <input
              type="number"
              min="0"
              value={costPrice}
              onChange={(event) => setCostPrice(event.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </div>
          <div>
            <label className={labelCls}>Комментарий</label>
            <input
              type="text"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className={`mt-1 ${inputCls}`}
            />
          </div>
        </div>
      )}

      {receipt.error && <p className="text-sm text-red-500">{receipt.error}</p>}

      {(mode === "receipt" || mode === "new") && (
        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={receipt.submitting}
          className="w-full rounded-xl bg-orange-500 py-3 font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {receipt.submitting
            ? "Сохраняем..."
            : mode === "new"
              ? `Создать и принять ${quantity} шт.`
              : `Принять ${quantity} шт.`}
        </button>
      )}
    </div>
  );
}
