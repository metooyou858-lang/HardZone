"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchProducts, findByBarcode, Product, searchProducts } from "@/lib/api/products";

function isBarcodeQuery(value: string) {
  return /^\d{6,}$/.test(value.trim());
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchProducts();
      setProducts(data);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  const search = useCallback(
    async (rawQuery: string) => {
      const trimmedQuery = rawQuery.trim();

      if (!trimmedQuery) {
        await load();
        return;
      }

      if (!isBarcodeQuery(trimmedQuery) && trimmedQuery.length < 2) {
        await load();
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (isBarcodeQuery(trimmedQuery)) {
          try {
            const product = await findByBarcode(trimmedQuery);
            setProducts([product]);
            return;
          } catch {
            const data = await searchProducts(trimmedQuery);
            setProducts(data);
            return;
          }
        }

        const data = await searchProducts(trimmedQuery);
        setProducts(data);
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Ошибка поиска");
      } finally {
        setLoading(false);
      }
    },
    [load]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
    }

    timer.current = setTimeout(() => {
      void search(query);
    }, 350);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [query, search]);

  const visibleProducts = query.trim()
    ? products
    : showAll
      ? products
      : products.filter((product) => product.stock > 0);

  return {
    products: visibleProducts,
    totalProducts: products.length,
    hiddenZeroCount: query.trim() ? 0 : products.filter((product) => product.stock <= 0).length,
    loading,
    error,
    query,
    setQuery,
    showAll,
    setShowAll,
    reload: load,
  };
}
