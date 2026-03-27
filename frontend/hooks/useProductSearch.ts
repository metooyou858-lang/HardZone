"use client";

import { useEffect, useRef, useState } from "react";

import { findByBarcode, Product, searchProducts } from "@/lib/api/products";

function isBarcodeQuery(value: string) {
  return /^\d{6,}$/.test(value.trim());
}

export function useProductSearch() {
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function find(rawQuery: string) {
    const trimmedQuery = rawQuery.trim();

    if (!trimmedQuery) {
      setProduct(null);
      setNotFound(false);
      setError(null);
      return;
    }

    setSearching(true);
    setError(null);
    setProduct(null);
    setNotFound(false);

    try {
      if (isBarcodeQuery(trimmedQuery)) {
        try {
          const result = await findByBarcode(trimmedQuery);
          setProduct(result);
          return;
        } catch {
          setNotFound(true);
          return;
        }
      }

      if (trimmedQuery.length >= 2) {
        const list = await searchProducts(trimmedQuery);

        if (list.length === 1) {
          setProduct(list[0]);
        } else if (list.length === 0) {
          setNotFound(true);
        } else {
          setError(`Найдено ${list.length} товаров — уточните запрос`);
        }
      }
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка поиска");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (timer.current) {
      clearTimeout(timer.current);
    }

    timer.current = setTimeout(() => {
      void find(query);
    }, 400);

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [query]);

  function reset() {
    setQuery("");
    setProduct(null);
    setNotFound(false);
    setError(null);
  }

  return { query, setQuery, product, searching, notFound, error, reset };
}
