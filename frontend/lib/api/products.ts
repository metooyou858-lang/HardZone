import { apiFetch } from "./client";
import { TrainingType } from "./training-types";

export type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  datamatrix_code: string | null;
  is_marked: boolean;
  is_archived: boolean;
  product_type_id: string | null;
  product_type_name: string | null;
  has_barcode: boolean;
  has_sku: boolean;
  has_cost_price: boolean;
  has_sale_price: boolean;
  has_stock: boolean;
  has_min_stock: boolean;
  has_marking: boolean;
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
  product_type_id?: number | null;
  sku?: string | null;
  barcode?: string | null;
  datamatrix_code?: string | null;
  is_marked?: boolean;
  marking_type?: number | null;
  is_archived?: boolean;
  cost_price?: number | null;
  sale_price?: number | null;
  category_id?: number | null;
  min_stock?: number;
};

export type ProductSubscriptionType = "single" | "visits" | "period" | "unlimited";
export type ProductSubscriptionActivationType = "purchase" | "first_visit";

export type ProductSubscriptionParams = {
  id: string;
  product_id: string;
  subscription_type: ProductSubscriptionType;
  visits_total: number | null;
  validity_days: number | null;
  activation_type: ProductSubscriptionActivationType;
  freeze_days_allowed: number;
  freeze_min_days: number;
  freeze_max_count: number | null;
  is_family: boolean;
  created_at: string;
  updated_at: string;
};

type SubscriptionParamsEnvelope = {
  success: boolean;
  data: {
    params: ProductSubscriptionParams | null;
    training_types: TrainingType[];
  };
  error?: string;
};

export type FetchProductsOptions = {
  includeArchived?: boolean;
  limit?: number;
  forSale?: boolean;
  type?: "service";
  excludeServices?: boolean;
  categoryId?: string | number;
};

export async function fetchProducts(
  includeArchivedOrOptions: boolean | FetchProductsOptions = false,
  limit?: number,
  forSale = false
): Promise<Product[]> {
  const options: FetchProductsOptions =
    typeof includeArchivedOrOptions === "object"
      ? includeArchivedOrOptions
      : {
          includeArchived: includeArchivedOrOptions,
          limit,
          forSale,
        };

  const params = new URLSearchParams();

  if (options.includeArchived) {
    params.set("archived", "true");
  }

  if (options.forSale) {
    params.set("forSale", "true");
  }

  if (options.excludeServices) {
    params.set("excludeServices", "true");
  }

  if (options.type) {
    params.set("type", options.type);
  }

  if (options.categoryId) {
    params.set("category_id", String(options.categoryId));
  }

  if (options.limit && options.limit > 0) {
    params.set("limit", String(options.limit));
  }

  const suffix = params.toString();
  return apiFetch<Product[]>(`/products${suffix ? `?${suffix}` : ""}`);
}

export async function searchProducts(query: string): Promise<Product[]> {
  return apiFetch<Product[]>(`/products/search?q=${encodeURIComponent(query)}`);
}

export async function findByBarcode(barcode: string): Promise<Product> {
  return apiFetch<Product>(`/products/barcode/${encodeURIComponent(barcode)}`);
}

export async function createProduct(data: {
  name: string;
  product_type_id?: number | null;
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

export async function fetchProductSubscriptionParams(id: string): Promise<{
  params: ProductSubscriptionParams | null;
  training_types: TrainingType[];
}> {
  const response = await apiFetch<SubscriptionParamsEnvelope>(`/products/${id}/subscription-params`);
  return response.data;
}

export async function saveProductSubscriptionParams(
  id: string,
  data: {
    subscription_type: ProductSubscriptionType;
    visits_total?: number | null;
    validity_days?: number | null;
    activation_type?: ProductSubscriptionActivationType;
    freeze_days_allowed?: number;
    freeze_min_days?: number;
    freeze_max_count?: number | null;
    is_family?: boolean;
    training_type_ids?: number[];
  }
): Promise<ProductSubscriptionParams> {
  const response = await apiFetch<{
    success: boolean;
    data: ProductSubscriptionParams;
    error?: string;
  }>(`/products/${id}/subscription-params`, {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
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

export async function archiveProduct(
  id: string,
  is_archived: boolean
): Promise<{ id: string; name: string; is_archived: boolean }> {
  return apiFetch(`/products/${id}/archive`, {
    method: "PATCH",
    body: JSON.stringify({ is_archived }),
  });
}
