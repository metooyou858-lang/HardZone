"use client";

import { useState } from "react";

import { useWriteoff } from "@/hooks/useWriteoff";
import { Product } from "@/lib/api/products";

import { inputCls, labelCls, REASONS } from "./shared";

export function InlineWriteoffForm({
  product,
  onClose,
  onDone,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const [quantity, setQuantity] = useState("1");
  const [reasonType, setReasonType] = useState("damage");
  const [comment, setComment] = useState("");
  const writeoff = useWriteoff(() => {
    onDone();
    onClose();
  });

  async function handleSubmit() {
    const parsedQuantity = Number.parseInt(quantity, 10);

    if (!parsedQuantity || parsedQuantity <= 0 || parsedQuantity > product.stock) {
      return;
    }

    await writeoff.submit({
      product_id: product.id,
      quantity: parsedQuantity,
      reason_type: reasonType,
      reason: comment || null,
    });
  }

  return (
    <div className="space-y-4 border-t border-red-100 bg-red-50 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-red-500">
        Списание · {product.name}
      </p>
      <div>
        <label className={labelCls}>Причина</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {REASONS.map((reason) => (
            <button
              key={reason.value}
              onClick={() => setReasonType(reason.value)}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
                reasonType === reason.value
                  ? "bg-red-500 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {reason.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className={labelCls}>Количество</label>
          <input
            type="number"
            min="1"
            max={product.stock}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className={`mt-1 ${inputCls}`}
            autoFocus
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
      {writeoff.error && <p className="text-sm text-red-500">{writeoff.error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={writeoff.submitting}
          className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {writeoff.submitting ? "Сохраняем..." : `Списать ${quantity} шт.`}
        </button>
        <button
          onClick={onClose}
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
