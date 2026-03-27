import { apiFetch } from "./client";

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  datamatrix_code: string | null;
  is_marked: boolean;
  cost_price: string | null;
  sale_price: string | null;
  margin: string | null;
  position_value: string | null;
  stock: number;
  min_stock: number;
  category_id: string | null;
  category_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductUpdatePayload = {
  name?: string;
  sku?: string | null;
  barcode?: string | null;
  datamatrix_code?: string | null;
  is_marked?: boolean;
  cost_price?: number | null;
  sale_price?: number | null;
  category_id?: number | null;
  min_stock?: number;
};

export async function fetchProducts(): Promise<Product[]> {
  return apiFetch<Product[]>("/products");
}

export async function searchProducts(query: string): Promise<Product[]> {
  return apiFetch<Product[]>(`/products/search?q=${encodeURIComponent(query)}`);
}

export async function findByBarcode(barcode: string): Promise<Product> {
  return apiFetch<Product>(`/products/barcode/${encodeURIComponent(barcode)}`);
}

export async function createProduct(data: {
  name: string;
  sku?: string;
  barcode?: string;
  datamatrix_code?: string;
  cost_price?: number;
  sale_price?: number;
  is_marked?: boolean;
  category_id?: number | null;
  min_stock?: number;
}): Promise<Product> {
  return apiFetch<Product>("/products", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProduct(id: string, data: ProductUpdatePayload): Promise<Product> {
  return apiFetch<Product>(`/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function fetchProductReceipts(id: string): Promise<
  {
    id: string;
    quantity: number;
    cost_price_at_receipt: string | null;
    method: string;
    comment: string | null;
    created_at: string;
  }[]
> {
  return apiFetch(`/receipts?product_id=${encodeURIComponent(id)}`);
}
