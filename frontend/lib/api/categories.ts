import { apiFetch } from "./client";

type RawCategory = {
  id: string;
  name: string;
  product_count?: number | string;
  created_at?: string;
};

export type Category = {
  id: string;
  name: string;
  product_count: number;
  created_at?: string;
};

function normalizeCategory(category: RawCategory): Category {
  return {
    id: category.id,
    name: category.name,
    product_count: Number(category.product_count ?? 0),
    created_at: category.created_at,
  };
}

export async function fetchCategories(): Promise<Category[]> {
  const categories = await apiFetch<RawCategory[]>("/categories");
  return categories.map(normalizeCategory);
}

export async function createCategory(name: string): Promise<Category> {
  const category = await apiFetch<RawCategory>("/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  return normalizeCategory(category);
}

export async function updateCategory(id: string, name: string): Promise<Category> {
  const category = await apiFetch<RawCategory>(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

  return normalizeCategory(category);
}

export async function deleteCategory(id: string): Promise<void> {
  await apiFetch<void>(`/categories/${id}`, { method: "DELETE" });
}
