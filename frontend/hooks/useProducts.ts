"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchProducts, findByBarcode, Product, searchProducts } from "@/lib/api/products";

function isBarcodeQuery(value: string) {
  return /^\d{6,}$/.test(value.trim());
}

function matchesScope(product: Product, options?: { excludeServices?: boolean }) {
  if (options?.excludeServices) {
    return product.has_stock;
  }

  return true;
}

export function useProducts(options?: { excludeServices?: boolean }) {
  const excludeServices = options?.excludeServices ?? false;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchProducts({
        includeArchived: showArchived,
        excludeServices,
      });
      setProducts(data.filter((product) => matchesScope(product, { excludeServices })));
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [excludeServices, showArchived]);

  const search = useCallback(
    async (rawQuery: string) => {
      const trimmedQuery = rawQuery.trim();

      if (!trimmedQuery) {
        await load();
        return;
      }

      if (showArchived) {
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
            setProducts(matchesScope(product, { excludeServices }) ? [product] : []);
            return;
          } catch {
            const data = await searchProducts(trimmedQuery);
            setProducts(data.filter((product) => matchesScope(product, { excludeServices })));
            return;
          }
        }

        const data = await searchProducts(trimmedQuery);
        setProducts(data.filter((product) => matchesScope(product, { excludeServices })));
      } catch (error: unknown) {
        setError(error instanceof Error ? error.message : "Ошибка поиска");
      } finally {
        setLoading(false);
      }
    },
    [excludeServices, load, showArchived]
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
    : showArchived || showAll
      ? products
      : products.filter((product) => !product.has_stock || product.stock > 0);

  return {
    products: visibleProducts,
    totalProducts: products.length,
    hiddenZeroCount: query.trim() ? 0 : products.filter((product) => product.has_stock && product.stock <= 0).length,
    loading,
    error,
    query,
    setQuery,
    showAll,
    setShowAll,
    showArchived,
    setShowArchived,
    reload: load,
  };
}
