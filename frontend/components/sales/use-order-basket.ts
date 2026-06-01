"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  groupOrderItems,
  isSellableInCash,
  resolveOrderItemKind,
  type BannerState,
  type BasketLine,
} from "@/components/sales/sales-shared";
import { normalizeMarkingInput } from "@/components/sales/sales-marking-utils";
import {
  addOrderItem,
  fetchOrder,
  removeOrderItem,
  updateOrderItem,
  type OrderDetail,
} from "@/lib/api/orders";
import type { Product } from "@/lib/api/products";

type UseOrderBasketOptions = {
  order: OrderDetail | null;
  orderAwaitingPayment: boolean;
  setBanner: Dispatch<SetStateAction<BannerState>>;
  setOrder: Dispatch<SetStateAction<OrderDetail | null>>;
};

export function useOrderBasket({
  order,
  orderAwaitingPayment,
  setBanner,
  setOrder,
}: UseOrderBasketOptions) {
  const [lineBusyKey, setLineBusyKey] = useState<string | null>(null);
  const [markingSavingKey, setMarkingSavingKey] = useState<string | null>(null);
  const [markingDrafts, setMarkingDrafts] = useState<Record<string, string>>({});
  const [pendingMarkingLineKey, setPendingMarkingLineKey] = useState<string | null>(null);

  // Ref so async handlers always read the latest basket without stale closure
  const basketLinesRef = useRef<BasketLine[]>([]);
  // Sequence counter to discard stale refreshOrder responses (race condition guard)
  const refreshSeqRef = useRef(0);

  async function refreshOrder(orderId: string) {
    const seq = ++refreshSeqRef.current;
    const freshOrder = await fetchOrder(orderId);
    if (seq === refreshSeqRef.current) {
      setOrder(freshOrder);
    }
  }

  function setMarkingDraftValue(lineKey: string, value: string) {
    setMarkingDrafts((current) => ({
      ...current,
      [lineKey]: normalizeMarkingInput(value),
    }));
  }

  function clearPendingMarkingLineKey() {
    setPendingMarkingLineKey(null);
  }

  /**
   * Returns the new line key for marked items, null for non-marked success, false on failure.
   */
  async function addCatalogProduct(
    product: Product,
    ensureOrder: () => Promise<OrderDetail>,
    options?: { markingCode?: string | null }
  ): Promise<string | null | false> {
    if (orderAwaitingPayment) {
      setBanner({
        tone: "info",
        text: "Этот чек уже отправлен на кассу. Сначала проверьте оплату или откройте новый чек.",
      });
      return null;
    }

    if (!isSellableInCash(product)) {
      setBanner({ tone: "error", text: `Позиция "${product.name}" недоступна: остаток 0` });
      return null;
    }

    if (!product.sale_price) {
      setBanner({
        tone: "error",
        text: `У позиции "${product.name}" не указана цена продажи`,
      });
      return null;
    }

    setLineBusyKey(product.id);
    setBanner(null);

    try {
      const activeOrder = order ?? (await ensureOrder());

      const created = await addOrderItem(activeOrder.id, {
        kind: resolveOrderItemKind(product),
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        sale_price: Number.parseFloat(product.sale_price),
        cost_price: product.cost_price ? Number.parseFloat(product.cost_price) : null,
        quantity: 1,
      });

      const initialMarkingCode = options?.markingCode?.trim()
        ? normalizeMarkingInput(options.markingCode.trim())
        : undefined;

      const newLineKey = created.item.marking_required ? `marked:${created.item.id}` : null;

      if (initialMarkingCode && newLineKey) {
        // Save marking code to backend immediately — no need to wait for confirm
        await updateOrderItem(activeOrder.id, created.item.id, {
          marking_code: initialMarkingCode,
        });
        setMarkingDrafts((current) => ({ ...current, [newLineKey]: initialMarkingCode }));
      }

      await refreshOrder(activeOrder.id);
      return newLineKey;
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось добавить позицию",
      });
      return false;
    } finally {
      setLineBusyKey(null);
    }
  }

  async function decrementLine(line: BasketLine) {
    if (!order || line.itemIds.length === 0 || orderAwaitingPayment) return;

    setLineBusyKey(line.key);
    setBanner(null);

    try {
      if (line.markingRequired) {
        await removeOrderItem(order.id, line.itemIds[0]);
      } else if (line.itemIds.length === 1 && line.quantity > 1) {
        await updateOrderItem(order.id, line.itemIds[0], {
          quantity: line.quantity - 1,
          discount_percent: line.discountPercent,
          discount_money: line.discountMoney,
        });
      } else {
        await removeOrderItem(order.id, line.itemIds[line.itemIds.length - 1]);
      }
      await refreshOrder(order.id);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось изменить количество",
      });
    } finally {
      setLineBusyKey(null);
    }
  }

  async function incrementLine(line: BasketLine) {
    if (!order || orderAwaitingPayment) return;

    setLineBusyKey(line.key);
    setBanner(null);

    try {
      if (line.markingRequired) {
        await addOrderItem(order.id, {
          kind: line.kind,
          product_id: line.productId,
          name: line.name,
          sku: line.sku,
          sale_price: Number.parseFloat(line.salePrice),
          cost_price: line.costPrice ? Number.parseFloat(line.costPrice) : null,
          quantity: 1,
          discount_percent: line.discountPercent,
          discount_money: line.discountMoney,
        });
      } else if (line.itemIds.length === 1) {
        await updateOrderItem(order.id, line.itemIds[0], {
          quantity: line.quantity + 1,
          discount_percent: line.discountPercent,
          discount_money: line.discountMoney,
        });
      } else {
        await addOrderItem(order.id, {
          kind: line.kind,
          product_id: line.productId,
          name: line.name,
          sku: line.sku,
          sale_price: Number.parseFloat(line.salePrice),
          cost_price: line.costPrice ? Number.parseFloat(line.costPrice) : null,
          quantity: 1,
          discount_percent: line.discountPercent,
          discount_money: line.discountMoney,
        });
      }
      await refreshOrder(order.id);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось изменить количество",
      });
    } finally {
      setLineBusyKey(null);
    }
  }

  async function removeLine(line: BasketLine) {
    if (!order || orderAwaitingPayment) return;

    setLineBusyKey(line.key);
    setBanner(null);

    try {
      for (const itemId of line.itemIds) {
        await removeOrderItem(order.id, itemId);
      }
      await refreshOrder(order.id);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось удалить позицию",
      });
    } finally {
      setLineBusyKey(null);
    }
  }

  const basketLines = groupOrderItems(order?.items ?? []);

  // Keep ref in sync so async handlers don't use stale basket data
  useEffect(() => {
    basketLinesRef.current = basketLines;
  });

  // Sync marking drafts when basket lines change
  useEffect(() => {
    setMarkingDrafts((current) => {
      const next: Record<string, string> = {};
      for (const line of basketLines) {
        if (line.markingRequired) {
          next[line.key] = current[line.key] ?? line.markingCode ?? "";
        }
      }
      return next;
    });
  }, [basketLines]);

  function resetBasket() {
    setMarkingDrafts({});
    setPendingMarkingLineKey(null);
  }

  return {
    lineBusyKey,
    markingSavingKey,
    setMarkingSavingKey,
    markingDrafts,
    pendingMarkingLineKey,
    setPendingMarkingLineKey,
    basketLines,
    basketLinesRef,
    refreshOrder,
    setMarkingDraftValue,
    clearPendingMarkingLineKey,
    addCatalogProduct,
    decrementLine,
    incrementLine,
    removeLine,
    resetBasket,
  };
}
