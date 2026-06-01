"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  formatMoney,
  getRefundableQuantity,
  shouldDisplayInHistory,
  type BannerState,
  type HistoryFilter,
} from "@/components/sales/sales-shared";
import type { ClientListItem } from "@/lib/api/clients";
import {
  cancelOrder,
  fetchOrder,
  fetchOrders,
  refundOrder,
  syncOrderWithAqsi,
  type Order,
  type OrderDetail,
  type OrderStatus,
  type OrderItem,
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

function getPartialRefundAmount(item: OrderItem, quantity: number) {
  const grossTotal = Number(item.sale_price || 0) * quantity;
  const fullGross = Number(item.sale_price || 0) * Number(item.quantity || 0);
  const fullDiscount =
    Number(item.discount_money || 0) > 0
      ? Number(item.discount_money || 0)
      : fullGross * (Number(item.discount_percent || 0) / 100);
  const proportionalDiscount =
    Number(item.quantity || 0) > 0 ? (fullDiscount / Number(item.quantity || 0)) * quantity : 0;

  return Math.max(0, grossTotal - proportionalDiscount);
}

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
      setOrderDetails((prev) => ({
        ...prev,
        [orderId]: freshOrder,
      }));

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
              ? "Оплата подтверждена кассой: наличные"
              : result.payment_type === "card"
                ? "Оплата подтверждена кассой: карта"
                : "Оплата подтверждена кассой",
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

  async function handleRefundOrder(orderId: string, item?: OrderItem) {
    const isItemRefund = Boolean(item);
    let refundItems: Array<{ item_id: string; quantity: number }> | undefined;
    let confirmMessage = "";

    if (item) {
      const refundableQuantity = getRefundableQuantity(item);

      if (refundableQuantity <= 0) {
        setHistoryError(`Позиция "${item.name}" уже возвращена полностью`);
        return;
      }

      let quantity = refundableQuantity;

      if (refundableQuantity > 1) {
        const input = window.prompt(
          `Сколько единиц вернуть по позиции «${item.name}»? Доступно: ${refundableQuantity}`,
          String(refundableQuantity)
        );

        if (input === null) {
          return;
        }

        const parsedQuantity = Number.parseInt(input, 10);
        if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0 || parsedQuantity > refundableQuantity) {
          setHistoryError(`Укажите корректное количество от 1 до ${refundableQuantity}`);
          return;
        }

        quantity = parsedQuantity;
      }

      const refundAmount = formatMoney(getPartialRefundAmount(item, quantity));
      confirmMessage = `Оформить возврат ${quantity} шт. по позиции «${item.name}» на сумму ${refundAmount}?`;
      refundItems = [{ item_id: item.id, quantity }];
    } else {
      confirmMessage = "Оформить возврат по всем оставшимся позициям заказа?";
    }

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setRefundingId(orderId);
    setHistoryError(null);

    try {
      const result = await refundOrder(orderId, refundItems);
      const freshOrder = await fetchOrder(orderId);

      setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...freshOrder } : order)));
      setOrderDetails((prev) => ({
        ...prev,
        [orderId]: freshOrder,
      }));

      if (currentOrder?.id === orderId) {
        setCurrentOrder(freshOrder);
      }

      setBanner({
        tone: "success",
        text: isItemRefund
          ? `Частичный возврат оформлен${result.refund_amount ? ` на ${formatMoney(result.refund_amount)}` : ""}`
          : `Возврат оформлен${result.refund_amount ? ` на ${formatMoney(result.refund_amount)}` : ""}`,
      });

      reloadHistory();
      onCatalogChanged?.();
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Не удалось оформить возврат");
    } finally {
      setRefundingId(null);
    }
  }

  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Reset on explicit reload (filter change, manual refresh) so loader shows again
    hasLoadedOnceRef.current = false;

    let cancelled = false;

    async function loadHistory({ silent = false }: { silent?: boolean } = {}) {
      if (!silent) {
        setHistoryLoading(true);
      }
      setHistoryError(null);

      try {
        const statusParam = (historyFilter === "all" || historyFilter === "error") ? undefined : historyFilter as OrderStatus;
        const nextOrders = await fetchOrders(statusParam, 50, true);
        if (!cancelled) {
          setOrders(nextOrders.filter((item) => shouldDisplayInHistory(item, historyFilter)));
          hasLoadedOnceRef.current = true;
        }
      } catch (error) {
        if (!cancelled) {
          setHistoryError(error instanceof Error ? error.message : "Не удалось загрузить историю продаж");
        }
      } finally {
        if (!cancelled && !silent) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory();
    const intervalId = window.setInterval(() => {
      void loadHistory({ silent: hasLoadedOnceRef.current });
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
