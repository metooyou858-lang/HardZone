"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  asAmount,
  detectDiscountMode,
  formatDiscountValue,
  parseDiscountInput,
  type BannerState,
  type BasketLine,
  type DiscountMode,
} from "@/components/sales/sales-shared";
import {
  addOrderItem,
  removeOrderItem,
  updateOrder,
  updateOrderItem,
  type OrderDetail,
} from "@/lib/api/orders";

type UseOrderDiscountsOptions = {
  order: OrderDetail | null;
  orderAwaitingPayment: boolean;
  orderLoading: boolean;
  setBanner: Dispatch<SetStateAction<BannerState>>;
  refreshOrder: (orderId: string) => Promise<void>;
};

export function useOrderDiscounts({
  order,
  orderAwaitingPayment,
  orderLoading,
  setBanner,
  refreshOrder,
}: UseOrderDiscountsOptions) {
  const [receiptDiscountMode, setReceiptDiscountMode] = useState<DiscountMode>("percent");
  const [receiptDiscountValue, setReceiptDiscountValue] = useState("");
  const [receiptDiscountSaving, setReceiptDiscountSaving] = useState(false);
  const [editingLineDiscountKey, setEditingLineDiscountKey] = useState<string | null>(null);
  const [lineDiscountMode, setLineDiscountMode] = useState<DiscountMode>("percent");
  const [lineDiscountValue, setLineDiscountValue] = useState("");
  const [lineDiscountSavingKey, setLineDiscountSavingKey] = useState<string | null>(null);

  const receiptDiscountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync receipt discount fields when order changes (e.g. after load or new order)
  useEffect(() => {
    const money = asAmount(order?.discount_money);
    const percent = asAmount(order?.discount_percent);
    const nextMode = detectDiscountMode(percent, money);
    setReceiptDiscountMode(nextMode);
    setReceiptDiscountValue(formatDiscountValue(nextMode, percent, money));
  }, [order?.id, order?.discount_money, order?.discount_percent]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (receiptDiscountTimerRef.current) clearTimeout(receiptDiscountTimerRef.current);
    };
  }, []);

  async function persistReceiptDiscount(orderId: string, mode: DiscountMode, value: string) {
    setReceiptDiscountSaving(true);
    try {
      await updateOrder(orderId, {
        discount_percent: mode === "percent" ? parseDiscountInput(value) : 0,
        discount_money: mode === "money" ? parseDiscountInput(value) : 0,
      });
      await refreshOrder(orderId);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось обновить скидку на чек",
      });
    } finally {
      setReceiptDiscountSaving(false);
    }
  }

  function scheduleReceiptDiscount(nextMode: DiscountMode, nextValue: string) {
    setReceiptDiscountMode(nextMode);
    setReceiptDiscountValue(nextValue);

    if (receiptDiscountTimerRef.current) clearTimeout(receiptDiscountTimerRef.current);
    if (!order || orderLoading || orderAwaitingPayment) return;

    receiptDiscountTimerRef.current = setTimeout(() => {
      void persistReceiptDiscount(order.id, nextMode, nextValue);
    }, 350);
  }

  function openLineDiscountEditor(line: BasketLine) {
    const nextMode = detectDiscountMode(line.discountPercent, line.discountMoney);
    setEditingLineDiscountKey((current) => (current === line.key ? null : line.key));
    setLineDiscountMode(nextMode);
    setLineDiscountValue(formatDiscountValue(nextMode, line.discountPercent, line.discountMoney));
  }

  async function saveLineDiscount(line: BasketLine) {
    if (!order || orderAwaitingPayment) return;

    const payload =
      lineDiscountMode === "percent"
        ? { discount_percent: parseDiscountInput(lineDiscountValue), discount_money: 0 }
        : { discount_percent: 0, discount_money: parseDiscountInput(lineDiscountValue) };

    setLineDiscountSavingKey(line.key);
    setBanner(null);

    try {
      if (line.itemIds.length === 1) {
        await updateOrderItem(order.id, line.itemIds[0], { quantity: line.quantity, ...payload });
      } else {
        for (const itemId of line.itemIds) await removeOrderItem(order.id, itemId);
        await addOrderItem(order.id, {
          kind: line.kind,
          product_id: line.productId,
          name: line.name,
          sku: line.sku,
          sale_price: Number.parseFloat(line.salePrice),
          cost_price: line.costPrice ? Number.parseFloat(line.costPrice) : null,
          quantity: line.quantity,
          ...payload,
        });
      }
      await refreshOrder(order.id);
      setEditingLineDiscountKey(null);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось сохранить скидку по позиции",
      });
    } finally {
      setLineDiscountSavingKey(null);
    }
  }

  function flushReceiptDiscount(): Promise<void> | null {
    if (!receiptDiscountTimerRef.current || !order) return null;
    clearTimeout(receiptDiscountTimerRef.current);
    receiptDiscountTimerRef.current = null;
    return persistReceiptDiscount(order.id, receiptDiscountMode, receiptDiscountValue);
  }

  function resetDiscounts() {
    setReceiptDiscountMode("percent");
    setReceiptDiscountValue("");
    setEditingLineDiscountKey(null);
    setLineDiscountValue("");
  }

  return {
    receiptDiscountMode,
    setReceiptDiscountMode,
    receiptDiscountValue,
    receiptDiscountSaving,
    editingLineDiscountKey,
    setEditingLineDiscountKey,
    lineDiscountMode,
    setLineDiscountMode,
    lineDiscountValue,
    setLineDiscountValue,
    lineDiscountSavingKey,
    scheduleReceiptDiscount,
    openLineDiscountEditor,
    saveLineDiscount,
    flushReceiptDiscount,
    resetDiscounts,
  };
}
