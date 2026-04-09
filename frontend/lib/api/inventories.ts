import { apiFetch } from "./client";

export type InventoryStatus = "draft" | "confirmed";

type RawInventoryItem = {
  id: string;
  inventory_id?: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  barcode: string | null;
  category_name: string | null;
  expected_qty: number | string;
  actual_qty: number | string | null;
  difference: number | string | null;
};

type RawInventory = {
  id: string;
  status: InventoryStatus;
  comment: string | null;
  created_at: string;
  confirmed_at: string | null;
  total_items: number | string;
  filled_items: number | string;
  items_with_diff: number | string;
  items?: RawInventoryItem[];
};

export type InventoryItem = {
  id: string;
  inventory_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  barcode: string | null;
  category_name: string | null;
  expected_qty: number;
  actual_qty: number | null;
  difference: number | null;
};

export type Inventory = {
  id: string;
  status: InventoryStatus;
  comment: string | null;
  created_at: string;
  confirmed_at: string | null;
  total_items: number;
  filled_items: number;
  items_with_diff: number;
};

export type InventoryDetail = Inventory & {
  items: InventoryItem[];
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return Number(value);
}

function normalizeInventoryItem(item: RawInventoryItem, inventoryId: string): InventoryItem {
  return {
    id: item.id,
    inventory_id: item.inventory_id ?? inventoryId,
    product_id: item.product_id,
    product_name: item.product_name,
    product_sku: item.product_sku,
    barcode: item.barcode,
    category_name: item.category_name,
    expected_qty: Number(item.expected_qty),
    actual_qty: toNumber(item.actual_qty),
    difference: toNumber(item.difference),
  };
}

function normalizeInventory(inventory: RawInventory): Inventory {
  return {
    id: inventory.id,
    status: inventory.status,
    comment: inventory.comment,
    created_at: inventory.created_at,
    confirmed_at: inventory.confirmed_at,
    total_items: Number(inventory.total_items),
    filled_items: Number(inventory.filled_items),
    items_with_diff: Number(inventory.items_with_diff),
  };
}

export async function fetchInventories(): Promise<Inventory[]> {
  const inventories = await apiFetch<RawInventory[]>("/inventories");
  return inventories.map(normalizeInventory);
}

export async function fetchInventory(id: string): Promise<InventoryDetail> {
  const inventory = await apiFetch<RawInventory>(`/inventories/${id}`);
  const normalized = normalizeInventory(inventory);
  return {
    ...normalized,
    items: (inventory.items ?? []).map((item) => normalizeInventoryItem(item, inventory.id)),
  };
}

export async function createInventory(comment?: string, only_in_stock = true): Promise<Inventory> {
  return normalizeInventory(
    await apiFetch<RawInventory>("/inventories", {
      method: "POST",
      body: JSON.stringify({ comment: comment || null, only_in_stock }),
    })
  );
}

export async function updateInventoryItem(
  inventoryId: string,
  itemId: string,
  actual_qty: number
): Promise<InventoryItem> {
  const item = await apiFetch<RawInventoryItem>(`/inventories/${inventoryId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify({ actual_qty }),
  });

  return normalizeInventoryItem(item, inventoryId);
}

export async function confirmInventory(
  id: string
): Promise<{ inventory: Inventory; updated_products: number }> {
  const result = await apiFetch<{
    inventory: RawInventory;
    updated_products: number | string;
  }>(`/inventories/${id}/confirm`, { method: "POST" });

  return {
    inventory: normalizeInventory(result.inventory),
    updated_products: Number(result.updated_products),
  };
}

export async function deleteInventory(id: string): Promise<void> {
  await apiFetch<void>(`/inventories/${id}`, { method: "DELETE" });
}
