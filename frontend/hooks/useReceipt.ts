"use client";

import { useState } from "react";

import { createProduct } from "@/lib/api/products";
import { createReceipt, Receipt } from "@/lib/api/receipts";

export function useReceipt(onSuccess?: (updatedStock: number) => void) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Receipt | null>(null);

  async function submit(data: {
    product_id: string;
    quantity: number;
    method: string;
    cost_price_at_receipt?: number | null;
    comment?: string | null;
  }) {
    setSubmitting(true);
    setError(null);

    try {
      const response = await createReceipt(data);
      setResult(response.receipt);
      onSuccess?.(response.product.stock);
      return response;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function createAndReceive(
    productData: {
      name: string;
      sku?: string;
      barcode?: string;
      datamatrix_code?: string;
      cost_price?: number;
      sale_price?: number;
      is_marked?: boolean;
    },
    receiptData: {
      quantity: number;
      method: string;
      cost_price_at_receipt?: number | null;
      comment?: string | null;
    }
  ) {
    setSubmitting(true);
    setError(null);

    try {
      const product = await createProduct(productData);
      const response = await createReceipt({
        ...receiptData,
        product_id: product.id,
      });

      setResult(response.receipt);
      onSuccess?.(response.product.stock);
      return response;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    setError(null);
  }

  return { submit, createAndReceive, submitting, error, result, reset };
}
