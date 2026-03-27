"use client";

import { useState } from "react";

import { createWriteoff, Writeoff } from "@/lib/api/writeoffs";

export function useWriteoff(onSuccess?: (updatedStock: number) => void) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Writeoff | null>(null);

  async function submit(data: {
    product_id: string;
    quantity: number;
    reason_type: string;
    reason?: string | null;
  }) {
    setSubmitting(true);
    setError(null);

    try {
      const response = await createWriteoff(data);
      setResult(response.writeoff);
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

  return { submit, submitting, error, result, reset };
}
