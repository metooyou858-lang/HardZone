"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { type BannerState, formatMoney, shouldDisplayInHistory, type HistoryFilter } from "@/components/sales/sales-shared";
import type { ClientListItem } from "@/lib/api/clients";
import {
  cancelOrder,
  fetchOrder,
  fetchOrders,
  refundOrder,
  syncOrderWithAqsi,
  type Order,
  type OrderDetail,
} from "@/lib/api/orders";

type UseSalesHistoryOptions = {
  enabled: boolean;
  externalReloadToken?: number;
  currentOrder: OrderDetail | null;
  setCurrentOrder: Dispatch<SetStateAction<OrderDetail | null>>;
  setSelectedClient: Dispatch<SetStateAction<ClientListItem | null>>;
  setBanner: Dispatch<SetStateAction<BannerState>>;
  onCatalogChanged?: () => void;
};

export function useSalesHistory({
  enabled,
  externalReloadToken = 0,
  currentOrder,
  setCurrentOrder,
  setSelectedClient,
  setBanner,
  onCatalogChanged,
}: UseSalesHistoryOptions) {
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  function reloadHistory() {
    setReloadToken((value) => value + 1);
  }

  async function loadOrderDetail(orderId: string) {
    setDetailLoadingId(orderId);

    try {
      const detail = await fetchOrder(orderId);
      setOrderDetails((prev) => ({ ...prev, [orderId]: detail }));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Не удалось загрузить состав заказа");
    } finally {
      setDetailLoadingId(null);
    }
  }

  async function handleToggleOrder(orderId: string) {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }

    setExpandedOrderId(orderId);
    setHistoryError(null);

    if (!orderDetails[orderId]) {
      await loadOrderDetail(orderId);
    }
  }

  async function handleSyncPayment(orderId: string) {
    const isCurrentOrder = currentOrder?.id === orderId;

    if (!orderId) {
      return;
    }

    setSyncingOrderId(orderId);
    setHistoryError(null);

    if (isCurrentOrder) {
      setBanner(null);
    }

    try {
      const result = await syncOrderWithAqsi(orderId);
      const freshOrder = await fetchOrder(orderId);

      setOrders((prev) => prev.map((item) => (item.id === orderId ? { ...item, ...freshOrder } : item)));
      setOrderDetails((prev) => {
        if (!prev[orderId]) {
          return prev;
        }

        return {
          ...prev,
          [orderId]: {
            ...prev[orderId],
            ...freshOrder,
          },
        };
      });

      if (isCurrentOrder) {
        if (result.paid) {
          setCurrentOrder(null);
          setSelectedClient(null);
        } else {
          setCurrentOrder(freshOrder);
        }
      }

      reloadHistory();
      onCatalogChanged?.();

      if (result.paid) {
        setBanner({
          tone: "success",
          text:
            result.payment_type === "cash"
              ? "Оплата подтверждена кассой: наличные ✓"
              : result.payment_type === "card"
                ? "Оплата подтверждена кассой: карта ✓"
                : "Оплата подтверждена кассой ✓",
        });
        return;
      }

      setHistoryError(
        result.aqsi_status
          ? `Касса пока не подтвердила оплату: ${result.aqsi_status}`
          : "Касса пока не подтвердила оплату"
      );
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Не удалось проверить оплату на кассе");
    } finally {
      setSyncingOrderId(null);
    }
  }

  async function handleCancelOrder(orderId: string) {
    setCancellingId(orderId);
    setHistoryError(null);

    try {
      const updatedOrder = await cancelOrder(orderId);
      setOrders((prev) => {
        const nextOrders = prev.map((item) => (item.id === orderId ? { ...item, ...updatedOrder } : item));
        return nextOrders.filter((item) => shouldDisplayInHistory(item, historyFilter));
      });
      setOrderDetails((prev) => {
        if (!prev[orderId]) {
          return prev;
        }

        return {
          ...prev,
          [orderId]: {
            ...prev[orderId],
            ...updatedOrder,
          },
        };
      });

      if (currentOrder?.id === orderId) {
        setCurrentOrder(null);
        setSelectedClient(null);
      }
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Не удалось отменить заказ");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleRefundOrder(orderId: string, amount: string) {
    const formattedAmount = formatMoney(amount);

    if (!window.confirm(`Оформить возврат на сумму ${formattedAmount}?`)) {
      return;
    }

    setRefundingId(orderId);
    setHistoryError(null);

    try {
      const updatedOrder = await refundOrder(orderId);
      setOrders((prev) => prev.map((item) => (item.id === orderId ? { ...item, ...updatedOrder } : item)));
      setOrderDetails((prev) => {
        if (!prev[orderId]) {
          return prev;
        }

        return {
          ...prev,
          [orderId]: {
            ...prev[orderId],
            ...updatedOrder,
          },
        };
      });

      if (currentOrder?.id === orderId) {
        setCurrentOrder((prev) => (prev ? { ...prev, ...updatedOrder } : prev));
      }
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Не удалось оформить возврат");
    } finally {
      setRefundingId(null);
    }
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);

      try {
        const nextOrders = await fetchOrders(historyFilter === "all" ? undefined : historyFilter, 50);
        if (!cancelled) {
          setOrders(nextOrders.filter((item) => shouldDisplayInHistory(item, historyFilter)));
        }
      } catch (error) {
        if (!cancelled) {
          setHistoryError(error instanceof Error ? error.message : "Не удалось загрузить историю продаж");
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory();
    const intervalId = window.setInterval(() => {
      void loadHistory();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, externalReloadToken, historyFilter, reloadToken]);

  return {
    historyFilter,
    setHistoryFilter,
    historyError,
    historyLoading,
    orders,
    expandedOrderId,
    orderDetails,
    detailLoadingId,
    cancellingId,
    refundingId,
    syncingOrderId,
    handleToggleOrder,
    handleSyncPayment,
    handleCancelOrder,
    handleRefundOrder,
    reloadHistory,
  };
}
