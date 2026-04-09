"use client";

import { useCallback, useEffect, useState } from "react";

import {
  ProductType,
  createProductType,
  deleteProductType,
  fetchProductTypes,
  updateProductType,
} from "@/lib/api/product-types";

export function useProductTypes() {
  const [types, setTypes] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setTypes(await fetchProductTypes());
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(data: Parameters<typeof createProductType>[0]) {
    const type = await createProductType(data);
    setTypes((previous) => [...previous, type]);
    return type;
  }

  async function update(id: string, data: Parameters<typeof updateProductType>[1]) {
    const type = await updateProductType(id, data);
    setTypes((previous) => previous.map((current) => (current.id === id ? type : current)));
    return type;
  }

  async function remove(id: string) {
    await deleteProductType(id);
    setTypes((previous) => previous.filter((current) => current.id !== id));
  }

  return { types, loading, error, reload: load, create, update, remove };
}
