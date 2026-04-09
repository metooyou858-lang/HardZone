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
    <div className="space-y-4 border-t border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--danger)]">
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
                  ? "bg-[rgba(248,81,73,0.16)] text-[var(--danger)]"
                  : "border border-[var(--line-soft)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-white/5"
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
      {writeoff.error && <p className="text-sm text-[var(--danger)]">{writeoff.error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => {
            void handleSubmit();
          }}
          disabled={writeoff.submitting}
          className="rounded-xl bg-[var(--danger)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:opacity-50"
        >
          {writeoff.submitting ? "Сохраняем..." : `Списать ${quantity} шт.`}
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
