import { defaultHeaders } from "./client";

const API = process.env.NEXT_PUBLIC_API_URL;
const TOKEN = process.env.NEXT_PUBLIC_API_TOKEN;

export type ImportItem = {
  row: number;
  name: string;
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

  const response = await fetch(`${API}/import/parse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? data.hint ?? "Ошибка парсинга");
  }

  return data;
}

export async function confirmImport(
  items: ImportItem[],
  mode: "receipt" | "stock"
): Promise<{ imported: number }> {
  const response = await fetch(`${API}/import/confirm`, {
    method: "POST",
    headers: defaultHeaders,
    body: JSON.stringify({ items, mode }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Ошибка импорта");
  }

  return data;
}
