"use client";

import { useState } from "react";

import { useReceipt } from "@/hooks/useReceipt";
import { Product } from "@/lib/api/products";

import { inputCls, labelCls } from "./shared";

export function InlineReceiptForm({
  product,
  onClose,
  onDone,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const [costPrice, setCostPrice] = useState(product.cost_price ?? "");
  const [comment, setComment] = useState("");
  const receipt = useReceipt(() => {
    onDone();
    onClose();
  });

  async function handleSubmit() {
    const parsedQuantity = Number.parseInt(quantity, 10);

    if (!parsedQuantity || parsedQuantity <= 0) {
      return;
    }

    await receipt.submit({
      product_id: product.id,
      quantity: parsedQuantity,
      method: "manual",
      cost_price_at_receipt: costPrice ? Number.parseFloat(costPrice) : null,
      comment: comment || null,
    });
  }

  return (
    <div className="space-y-4 border-t border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--accent)]">
        Приёмка · {product.name}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className={labelCls}>Количество</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className={`mt-1 ${inputCls}`}
            autoFocus
          />
        </div>
        <div>
          <label className={labelCls}>Цена закупки ₽</label>
          <input
            type="number"
            min="0"
            value={costPrice}
            onChange={(event) => setCostPrice(event.target.value)}
            placeholder="необязательно"
            className={`mt-1 ${inputCls}`}
          />
        </div>
        <div>
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
      {receipt.error && <p className="text-sm text-[var(--danger)]">{receipt.error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={receipt.submitting}
          className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[#062b26] transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {receipt.submitting ? "Сохраняем..." : `Принять ${quantity} шт.`}
        </button>
        <button
          onClick={onClose}
          className="rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-5 py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-white/5 hover:text-[var(--text-main)]"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
