import { apiFetch } from "./client";

export type ProductType = {
  id: string;
  name: string;
  is_system: boolean;
  sort_order: number;
  has_barcode: boolean;
  has_sku: boolean;
  has_cost_price: boolean;
  has_sale_price: boolean;
  has_stock: boolean;
  has_min_stock: boolean;
  has_marking: boolean;
  product_count: number;
};

export async function fetchProductTypes(): Promise<ProductType[]> {
  return apiFetch<ProductType[]>("/product-types");
}

export async function createProductType(data: {
  name: string;
  has_barcode?: boolean;
  has_sku?: boolean;
  has_cost_price?: boolean;
  has_sale_price?: boolean;
  has_stock?: boolean;
  has_min_stock?: boolean;
  has_marking?: boolean;
}): Promise<ProductType> {
  return apiFetch<ProductType>("/product-types", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProductType(
  id: string,
  data: Partial<Omit<ProductType, "id" | "is_system" | "sort_order" | "product_count" | "created_at">>
): Promise<ProductType> {
  return apiFetch<ProductType>(`/product-types/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteProductType(id: string): Promise<void> {
  return apiFetch(`/product-types/${id}`, { method: "DELETE" });
}
