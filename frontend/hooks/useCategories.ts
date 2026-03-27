"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Category,
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from "@/lib/api/categories";

function sortByName(categories: Category[]) {
  return [...categories].sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setCategories(sortByName(await fetchCategories()));
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка загрузки категорий");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(name: string) {
    const category = await createCategory(name);
    setCategories((previous) => sortByName([...previous, category]));
    return category;
  }

  async function update(id: string, name: string) {
    const category = await updateCategory(id, name);

    setCategories((previous) =>
      sortByName(
        previous.map((item) =>
          item.id === id ? { ...item, ...category, product_count: item.product_count } : item
        )
      )
    );

    return category;
  }

  async function remove(id: string) {
    await deleteCategory(id);
    setCategories((previous) => previous.filter((item) => item.id !== id));
  }

  return {
    categories,
    loading,
    error,
    reload: load,
    create,
    update,
    remove,
  };
}
