import { apiFetch } from "./client";

export type Writeoff = {
  id: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  quantity: number;
  reason_type: string;
  reason: string | null;
  created_at: string;
};

export async function fetchWriteoffs(): Promise<Writeoff[]> {
  return apiFetch<Writeoff[]>("/writeoffs");
}

export async function createWriteoff(data: {
  product_id: string;
  quantity: number;
  reason_type: string;
  reason?: string | null;
}): Promise<{ writeoff: Writeoff; product: { id: string; name: string; sku: string; stock: number } }> {
  return apiFetch("/writeoffs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
