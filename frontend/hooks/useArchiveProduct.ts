"use client";

import { useState } from "react";

import { archiveProduct } from "@/lib/api/products";

export function useArchiveProduct(onSuccess?: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive(id: string) {
    setLoading(true);
    setError(null);

    try {
      await archiveProduct(id, true);
      onSuccess?.();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function unarchive(id: string) {
    setLoading(true);
    setError(null);

    try {
      await archiveProduct(id, false);
      onSuccess?.();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return { archive, unarchive, loading, error };
}
