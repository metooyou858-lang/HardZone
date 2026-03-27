"use client";

import { useState } from "react";

import { Product, ProductUpdatePayload, updateProduct } from "@/lib/api/products";

export function useEditProduct(onSuccess?: (updated: Product) => void) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(id: string, data: ProductUpdatePayload) {
    setSubmitting(true);
    setError(null);

    try {
      const updated = await updateProduct(id, data);
      onSuccess?.(updated);
      return updated;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка сохранения");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setError(null);
  }

  return { submit, submitting, error, reset };
}
