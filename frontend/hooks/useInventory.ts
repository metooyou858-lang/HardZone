"use client";

import { useCallback, useEffect, useState } from "react";

import {
  Inventory,
  InventoryDetail,
  InventoryItem,
  confirmInventory,
  createInventory,
  deleteInventory,
  fetchInventories,
  fetchInventory,
  updateInventoryItem,
} from "@/lib/api/inventories";

export function useInventory() {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [active, setActive] = useState<InventoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const list = await fetchInventories();
      setInventories(list);

      const draft = list.find((inventory) => inventory.status === "draft");
      if (draft) {
        const detail = await fetchInventory(draft.id);
        setActive(detail);
      } else {
        setActive(null);
      }

      return list;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка загрузки");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start(comment?: string, onlyInStock = true) {
    setSaving(true);
    setError(null);

    try {
      const inventory = await createInventory(comment, onlyInStock);
      const detail = await fetchInventory(inventory.id);
      setActive(detail);
      setInventories((previous) => [inventory, ...previous.filter((item) => item.id !== inventory.id)]);
      return detail;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка создания");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function updateItem(item: InventoryItem, actualQty: number) {
    if (!active) {
      return;
    }

    try {
      const updated = await updateInventoryItem(active.id, item.id, actualQty);

      setActive((previous) => {
        if (!previous) {
          return previous;
        }

        const items = previous.items.map((currentItem) =>
          currentItem.id === item.id ? { ...currentItem, ...updated } : currentItem
        );

        const filledItems = items.filter((currentItem) => currentItem.actual_qty !== null).length;
        const diffItems = items.filter(
          (currentItem) => currentItem.actual_qty !== null && currentItem.difference !== 0
        ).length;

        return {
          ...previous,
          items,
          filled_items: filledItems,
          items_with_diff: diffItems,
        };
      });
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка сохранения");
    }
  }

  async function confirm() {
    if (!active) {
      return null;
    }

    setConfirming(true);
    setError(null);

    try {
      const result = await confirmInventory(active.id);
      await load();
      return result;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка подтверждения");
      return null;
    } finally {
      setConfirming(false);
    }
  }

  async function remove() {
    if (!active) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await deleteInventory(active.id);
      await load();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка удаления");
    } finally {
      setSaving(false);
    }
  }

  const filledCount = active?.items.filter((item) => item.actual_qty !== null).length ?? 0;
  const totalCount = active?.items.length ?? 0;
  const diffCount =
    active?.items.filter((item) => item.actual_qty !== null && item.difference !== 0).length ?? 0;

  return {
    inventories,
    active,
    loading,
    saving,
    confirming,
    error,
    filledCount,
    totalCount,
    diffCount,
    start,
    updateItem,
    confirm,
    remove,
    reload: load,
    setActive,
  };
}
