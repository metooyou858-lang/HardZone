"use client";

import { useState } from "react";

import { Category } from "@/lib/api/categories";
import { useEditProduct } from "@/hooks/useEditProduct";
import { Product } from "@/lib/api/products";

import { inputCls, labelCls } from "./shared";

export function InlineEditForm({
  product,
  categories,
  categoriesLoading,
  onSuccess,
  onClose,
}: {
  product: Product;
  categories: Category[];
  categoriesLoading: boolean;
  onSuccess: (updated: Product) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku ?? "");
  const [barcode, setBarcode] = useState(product.barcode ?? "");
  const [costPrice, setCostPrice] = useState(product.cost_price ?? "");
  const [salePrice, setSalePrice] = useState(product.sale_price ?? "");
  const [isMarked, setIsMarked] = useState(product.is_marked);
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");
  const [minStock, setMinStock] = useState(String(product.min_stock ?? 0));

  const edit = useEditProduct((updated) => {
    onSuccess(updated);
    onClose();
  });

  async function handleSubmit() {
    if (!name.trim()) {
      return;
    }

    await edit.submit(product.id, {
      name: name.trim(),
      sku: sku.trim() || null,
      barcode: barcode.trim() || null,
      cost_price: costPrice !== "" ? Number.parseFloat(String(costPrice)) : null,
      sale_price: salePrice !== "" ? Number.parseFloat(String(salePrice)) : null,
      is_marked: isMarked,
      category_id: categoryId ? Number.parseInt(categoryId, 10) : null,
      min_stock: Number.parseInt(minStock, 10) || 0,
    });
  }

  const currentMargin =
    costPrice !== "" && salePrice !== ""
      ? Number.parseFloat(String(salePrice)) - Number.parseFloat(String(costPrice))
      : null;

  return (
    <div className="space-y-4 border-t border-slate-200 bg-slate-50 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Редактирование · {product.name}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className={labelCls}>Название *</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={`mt-1 ${inputCls}`}
            autoFocus
          />
        </div>

        <div>
          <label className={labelCls}>Цена закупки ₽</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={costPrice}
            onChange={(event) => setCostPrice(event.target.value)}
            placeholder="не указана"
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div>
          <label className={labelCls}>Цена продажи ₽</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={salePrice}
            onChange={(event) => setSalePrice(event.target.value)}
            placeholder="не указана"
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div>
          <label className={labelCls}>Штрихкод</label>
          <input
            type="text"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder="не указан"
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div>
          <label className={labelCls}>SKU / Артикул</label>
          <input
            type="text"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            placeholder="не указан"
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div>
          <label className={labelCls}>Категория</label>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={categoriesLoading}
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

        <div>
          <label className={labelCls}>Минимальный остаток</label>
          <input
            type="number"
            min="0"
            value={minStock}
            onChange={(event) => setMinStock(event.target.value)}
            className={`mt-1 ${inputCls}`}
          />
        </div>

        <div className="flex items-center gap-3 md:col-span-2">
          <input
            type="checkbox"
            id={`marked-${product.id}`}
            checked={isMarked}
            onChange={(event) => setIsMarked(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-orange-500"
          />
          <label htmlFor={`marked-${product.id}`} className="text-sm text-slate-600">
            Маркированный товар (Честный знак)
          </label>
        </div>
      </div>

      {currentMargin !== null && !Number.isNaN(currentMargin) && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm">
          <span className="text-slate-500">Маржа: </span>
          <span
            className={`font-semibold ${
              currentMargin >= 0 ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {currentMargin.toLocaleString("ru")} ₽
          </span>
        </div>
      )}

      {edit.error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {edit.error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={edit.submitting || !name.trim()}
          className="rounded-xl bg-slate-800 px-5 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {edit.submitting ? "Сохраняем..." : "Сохранить"}
        </button>
        <button
          onClick={onClose}
          className="rounded-xl border border-slate-200 px-5 py-2 text-sm text-slate-500 hover:bg-slate-100"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
