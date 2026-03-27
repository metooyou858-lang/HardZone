import { apiFetch } from "./client";

export type Receipt = {
  id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity: number;
  method: string;
  cost_price_at_receipt: string | null;
  comment: string | null;
  created_at: string;
};

export async function fetchReceipts(): Promise<Receipt[]> {
  return apiFetch<Receipt[]>("/receipts");
}

export async function createReceipt(data: {
  product_id: string;
  quantity: number;
  method: string;
  cost_price_at_receipt?: number | null;
  comment?: string | null;
}): Promise<{ receipt: Receipt; product: { id: string; name: string; sku: string; stock: number } }> {
  return apiFetch("/receipts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
