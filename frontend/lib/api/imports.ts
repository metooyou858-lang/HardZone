import { apiFetch } from "./client";

export type ImportItem = {
  row: number;
  name: string;
  category: string | null;
  barcode: string | null;
  sku: string | null;
  quantity: number | null;
  cost_price: number | null;
  sale_price: number | null;
  matched: boolean;
  skip: boolean;
  existing_product: {
    id: string;
    name: string;
    stock: number;
  } | null;
};

export type ParseResult = {
  total: number;
  matched: number;
  new: number;
  columns_detected: string[];
  items: ImportItem[];
};

export async function parseImportFile(file: File): Promise<ParseResult> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch("/import/parse", {
    method: "POST",
    body: formData,
  });
}

export async function confirmImport(
  items: ImportItem[],
  mode: "receipt" | "stock"
): Promise<{ imported: number }> {
  return apiFetch("/import/confirm", {
    method: "POST",
    body: JSON.stringify({ items, mode }),
  });
}
