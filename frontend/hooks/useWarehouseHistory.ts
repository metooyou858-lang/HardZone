"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchOrder, fetchOrders } from "@/lib/api/orders";
import { fetchReceipts } from "@/lib/api/receipts";
import { fetchSales } from "@/lib/api/sales";
import { fetchWriteoffs } from "@/lib/api/writeoffs";

export type WarehouseOperation = {
  id: string;
  type: "receipt" | "writeoff" | "sale";
  product_name: string;
  product_sku: string;
  quantity: number;
  amount: string | null;
  detail: string;
  created_at: string;
};

const REASON_LABELS: Record<string, string> = {
  damage: "Порча",
  expired: "Истёк срок",
  own_use: "Собственные нужды",
  other: "Другое",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Безналичные",
};

const METHOD_LABELS: Record<string, string> = {
  barcode: "Штрихкод",
  datamatrix: "Честный знак",
  manual: "Вручную",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "оплачено",
  cancelled: "отменено",
  pending: "ожидает",
};

export function useWarehouseHistory() {
  const [operations, setOperations] = useState<WarehouseOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [receipts, writeoffs, sales, orders] = await Promise.all([
        fetchReceipts(),
        fetchWriteoffs(),
        fetchSales(),
        fetchOrders(undefined, 50),
      ]);

      const confirmedOrders = orders.filter((order) => order.status === "confirmed");
      const confirmedOrderDetails = await Promise.allSettled(
        confirmedOrders.map((order) => fetchOrder(order.id))
      );

      const orderSales: WarehouseOperation[] = confirmedOrderDetails.flatMap((result) => {
        if (result.status !== "fulfilled") {
          return [];
        }

        const detail = result.value;
        const paymentLabel = detail.payment_type
          ? (PAYMENT_LABELS[detail.payment_type] ?? detail.payment_type)
          : "—";

        return detail.items
          .filter((item) => item.kind === "product")
          .map((item) => ({
            id: `o-${detail.id}-${item.id}`,
            type: "sale" as const,
            product_name: item.name ?? "",
            product_sku: item.sku ?? "",
            quantity: item.quantity,
            amount: item.total
              ? `${Number.parseFloat(item.total).toLocaleString("ru")} ₽`
              : null,
            detail: `${paymentLabel} · #${detail.id.slice(0, 8)}`,
            created_at: detail.confirmed_at ?? detail.created_at,
          }));
      });

      const merged: WarehouseOperation[] = [
        ...receipts.map((receipt) => ({
          id: `r-${receipt.id}`,
          type: "receipt" as const,
          product_name: receipt.product_name ?? "",
          product_sku: receipt.product_sku ?? "",
          quantity: receipt.quantity,
          amount: receipt.cost_price_at_receipt
            ? `${Number.parseFloat(receipt.cost_price_at_receipt).toLocaleString("ru")} ₽/шт.`
            : null,
          detail: METHOD_LABELS[receipt.method] ?? receipt.method,
          created_at: receipt.created_at,
        })),
        ...writeoffs.map((writeoff) => ({
          id: `w-${writeoff.id}`,
          type: "writeoff" as const,
          product_name: writeoff.product_name ?? "",
          product_sku: writeoff.product_sku ?? "",
          quantity: writeoff.quantity,
          amount: null,
          detail: REASON_LABELS[writeoff.reason_type] ?? writeoff.reason_type,
          created_at: writeoff.created_at,
        })),
        ...sales
          .filter((sale) => sale.status === "confirmed")
          .map((sale) => ({
            id: `s-${sale.id}`,
            type: "sale" as const,
            product_name: sale.product_name ?? "",
            product_sku: sale.product_sku ?? "",
            quantity: sale.quantity,
            amount: sale.sale_price_at_sale
              ? `${(Number.parseFloat(sale.sale_price_at_sale) * sale.quantity).toLocaleString("ru")} ₽`
              : null,
            detail: `${PAYMENT_LABELS[sale.payment_type] ?? sale.payment_type} · ${STATUS_LABELS[sale.status] ?? sale.status}`,
            created_at: sale.created_at,
          })),
        ...orderSales,
      ].sort((left, right) => (
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      ));

      setOperations(merged);
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Не удалось загрузить историю");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { operations, loading, error, reload: load };
}
