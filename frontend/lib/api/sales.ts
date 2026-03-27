import { apiFetch } from "./client";

export type Sale = {
  id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity: number;
  sale_price_at_sale: string | null;
  payment_type: string;
  status: string;
  aqsi_receipt_id: string | null;
  created_at: string;
};

export async function fetchSales(): Promise<Sale[]> {
  return apiFetch<Sale[]>("/sales");
}
