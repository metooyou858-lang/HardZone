"use client";

import { useCallback, useState } from "react";

import {
  Inventory,
  fetchInventories,
  fetchInventory,
  createInventory,
  updateInventoryItem,
  confirmInventory,
  deleteInventory,
} from "@/lib/api/inventories";

export function useInventory() {
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [current, setCurrent] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setInventories(await fetchInventories());
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка загрузки инвентаризаций");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOne = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const inventory = await fetchInventory(id);
      setCurrent(inventory);
      return inventory;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка загрузки инвентаризации");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  async function create(comment?: string) {
    setSubmitting(true);
    setError(null);

    try {
      const inventory = await createInventory(comment);
      const full = await fetchInventory(inventory.id);
      setCurrent(full);
      await loadList();
      return full;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка создания инвентаризации");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function updateItem(inventoryId: string, itemId: string, actualQty: number) {
    try {
      const updated = await updateInventoryItem(inventoryId, itemId, actualQty);

      setCurrent((previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          items: previous.items?.map((item) => (item.id === itemId ? updated : item)),
        };
      });
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка сохранения количества");
    }
  }

  async function confirm(id: string) {
    setSubmitting(true);
    setError(null);

    try {
      const result = await confirmInventory(id);
      const full = await fetchInventory(id);
      setCurrent(full);
      await loadList();
      return result;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка подтверждения инвентаризации");
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    setSubmitting(true);
    setError(null);

    try {
      await deleteInventory(id);
      setCurrent(null);
      await loadList();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Ошибка удаления инвентаризации");
    } finally {
      setSubmitting(false);
    }
  }

  function clearCurrent() {
    setCurrent(null);
  }

  return {
    inventories,
    current,
    loading,
    submitting,
    error,
    loadList,
    loadOne,
    create,
    updateItem,
    confirm,
    remove,
    clearCurrent,
  };
}
