"use client";

import { useEffect, useRef, useState } from "react";

import { ClientPickerModal } from "@/components/sales/client-picker-modal";
import { CatalogPanel } from "@/components/sales/catalog-panel";
import { CheckoutPanel } from "@/components/sales/checkout-panel";
import { SalesHistoryPanel } from "@/components/sales/sales-history-panel";
import {
  asAmount,
  type BasketLine,
  buildCatalogGroups,
  type BannerState,
  detectDiscountMode,
  formatDiscountValue,
  formatMoney,
  getBannerClass,
  getClientName,
  getClientSubscriptionLabel,
  groupOrderItems,
  isSellableInCash,
  parseDiscountInput,
  resolveDiscountMoney,
  resolveOrderItemKind,
  searchInputCls,
  SERVICES_GROUP_ID,
  shouldDisplayInHistory,
  type CatalogGroup,
  type DiscountMode,
  type HistoryFilter,
  type SalesTab,
} from "@/components/sales/sales-shared";
import { fetchCategories } from "@/lib/api/categories";
import { type ClientListItem, fetchClients, findClientByBarcode } from "@/lib/api/clients";
import {
  addOrderItem,
  cancelOrder,
  createOrder,
  fetchOrder,
  fetchOrders,
  type Order,
  type OrderDetail,
  removeOrderItem,
  refundOrder,
  sendOrderToAqsi,
  syncOrderWithAqsi,
  updateOrder,
  updateOrderItem,
} from "@/lib/api/orders";
import { fetchProducts, findByBarcode, type Product, searchProducts } from "@/lib/api/products";
export default function SalesPage() {
  const [tab, setTab] = useState<SalesTab>("cash");
  const [query, setQuery] = useState("");
  const [catalogGroups, setCatalogGroups] = useState<CatalogGroup[]>([]);
  const [catalogGroupsLoading, setCatalogGroupsLoading] = useState(true);
  const [selectedCatalogGroup, setSelectedCatalogGroup] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [lineBusyKey, setLineBusyKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);
  const [catalogReloadToken, setCatalogReloadToken] = useState(0);
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientListItem[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientSaving, setClientSaving] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [receiptDiscountMode, setReceiptDiscountMode] = useState<DiscountMode>("percent");
  const [receiptDiscountValue, setReceiptDiscountValue] = useState("");
  const [receiptDiscountSaving, setReceiptDiscountSaving] = useState(false);
  const [editingLineDiscountKey, setEditingLineDiscountKey] = useState<string | null>(null);
  const [lineDiscountMode, setLineDiscountMode] = useState<DiscountMode>("percent");
  const [lineDiscountValue, setLineDiscountValue] = useState("");
  const [lineDiscountSavingKey, setLineDiscountSavingKey] = useState<string | null>(null);

  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [historyReloadToken, setHistoryReloadToken] = useState(0);

  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receiptDiscountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scannerBufferRef = useRef("");
  const scannerLastTsRef = useRef(0);
  const clientScannerBufferRef = useRef("");
  const clientScannerLastTsRef = useRef(0);
  const orderPromiseRef = useRef<Promise<OrderDetail> | null>(null);
  const orderAwaitingPayment = Boolean(order && order.status === "open" && order.aqsi_receipt_id);
  const orderLocked = confirming || orderAwaitingPayment;
  const clientSelectionLocked = orderLocked || clientSaving;

  async function ensureOrder() {
    if (order) {
      return order;
    }

    if (orderPromiseRef.current) {
      return orderPromiseRef.current;
    }

    const pendingOrder = (async () => {
      setOrderLoading(true);

      try {
        const freshOrder = await createOrder(undefined, selectedClient?.id ?? null);
        const nextOrder = { ...freshOrder, items: [] };
        setOrder(nextOrder);
        return nextOrder;
      } catch (error) {
        setBanner({
          tone: "error",
          text: error instanceof Error ? error.message : "Не удалось создать чек",
        });
        throw error;
      } finally {
        orderPromiseRef.current = null;
        setOrderLoading(false);
      }
    })();

    orderPromiseRef.current = pendingOrder;
    return pendingOrder;
  }

  async function refreshOrder(orderId: string) {
    const freshOrder = await fetchOrder(orderId);
    setOrder(freshOrder);
  }

  async function applyClientSelection(nextClient: ClientListItem | null) {
    setClientError(null);

    if (!order || orderAwaitingPayment) {
      setSelectedClient(nextClient);
      setClientPickerOpen(false);
      setClientQuery("");
      return;
    }

    setClientSaving(true);

    try {
      const updatedOrder = await updateOrder(order.id, {
        client_id: nextClient?.id ?? null,
      });
      setOrder((prev) => (prev ? { ...prev, ...updatedOrder } : prev));
      setSelectedClient(nextClient);
      setClientPickerOpen(false);
      setClientQuery("");
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Не удалось сохранить клиента в чеке");
    } finally {
      setClientSaving(false);
    }
  }

  async function handleClientBarcodeScan(barcode: string) {
    setClientError(null);
    setClientLoading(true);

    try {
      const client = await findClientByBarcode(barcode);
      await applyClientSelection(client);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : `Клиент по штрихкоду ${barcode} не найден`);
    } finally {
      setClientLoading(false);
    }
  }

  function handleClientSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
      return;
    }

    const now = Date.now();

    if (event.key === "Enter") {
      const barcode = clientScannerBufferRef.current.trim();
      const isScannerInput = barcode.length >= 6 && now - clientScannerLastTsRef.current <= 100;
      clientScannerBufferRef.current = "";
      clientScannerLastTsRef.current = 0;

      if (isScannerInput) {
        event.preventDefault();
        void handleClientBarcodeScan(barcode);
      }
      return;
    }

    if (event.key.length === 1) {
      if (now - clientScannerLastTsRef.current > 100) {
        clientScannerBufferRef.current = "";
      }

      clientScannerBufferRef.current += event.key;
      clientScannerLastTsRef.current = now;
    }
  }

  async function persistReceiptDiscount(
    orderId: string,
    mode: DiscountMode,
    value: string
  ) {
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

    if (receiptDiscountTimerRef.current) {
      clearTimeout(receiptDiscountTimerRef.current);
    }

    if (!order || orderLoading || orderAwaitingPayment) {
      return;
    }

    receiptDiscountTimerRef.current = setTimeout(() => {
      void persistReceiptDiscount(order.id, nextMode, nextValue);
    }, 350);
  }

  function openLineDiscountEditor(line: BasketLine) {
    setEditingLineDiscountKey((current) => (current === line.key ? null : line.key));
    setLineDiscountMode(detectDiscountMode(line.discountPercent, line.discountMoney));
    setLineDiscountValue(formatDiscountValue(detectDiscountMode(line.discountPercent, line.discountMoney), line.discountPercent, line.discountMoney));
  }

  async function saveLineDiscount(line: BasketLine) {
    if (!order || orderAwaitingPayment) {
      return;
    }

    const payload =
      lineDiscountMode === "percent"
        ? { discount_percent: parseDiscountInput(lineDiscountValue), discount_money: 0 }
        : { discount_percent: 0, discount_money: parseDiscountInput(lineDiscountValue) };

    setLineDiscountSavingKey(line.key);
    setBanner(null);

    try {
      if (line.itemIds.length === 1) {
        await updateOrderItem(order.id, line.itemIds[0], {
          quantity: line.quantity,
          ...payload,
        });
      } else {
        for (const itemId of line.itemIds) {
          await removeOrderItem(order.id, itemId);
        }

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

  async function addCatalogProduct(product: Product) {
    if (orderAwaitingPayment) {
      setBanner({
        tone: "info",
        text: "Этот чек уже отправлен на кассу. Сначала проверьте оплату или откройте новый чек.",
      });
      return;
    }

    if (!isSellableInCash(product)) {
      setBanner({
        tone: "error",
        text: `Позиция "${product.name}" недоступна: остаток 0`,
      });
      return;
    }

    if (!product.sale_price) {
      setBanner({
        tone: "error",
        text: `У позиции "${product.name}" не указана цена продажи`,
      });
      return;
    }

    setLineBusyKey(product.id);
    setBanner(null);

    try {
      const activeOrder = order ?? (await ensureOrder());

      await addOrderItem(activeOrder.id, {
        kind: resolveOrderItemKind(product),
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        sale_price: Number.parseFloat(product.sale_price),
        cost_price: product.cost_price ? Number.parseFloat(product.cost_price) : null,
        quantity: 1,
      });

      await refreshOrder(activeOrder.id);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось добавить позицию",
      });
    } finally {
      setLineBusyKey(null);
    }
  }

  async function decrementLine(line: BasketLine) {
    if (!order || line.itemIds.length === 0 || orderAwaitingPayment) {
      return;
    }

    setLineBusyKey(line.key);
    setBanner(null);

    try {
      if (line.itemIds.length === 1 && line.quantity > 1) {
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
    if (!order || orderAwaitingPayment) {
      return;
    }

    setLineBusyKey(line.key);
    setBanner(null);

    try {
      if (line.itemIds.length === 1) {
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
    if (!order || orderAwaitingPayment) {
      return;
    }

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

  async function handleBarcodeScan(barcode: string) {
    if (confirming || orderAwaitingPayment) {
      return;
    }

    setBanner({ tone: "info", text: `Сканер: ${barcode}` });

    try {
      const product = await findByBarcode(barcode);
      if (!isSellableInCash(product)) {
        setBanner({
          tone: "error",
          text: `Позиция "${product.name}" недоступна: остаток 0`,
        });
        return;
      }

      await addCatalogProduct(product);
      setBanner({ tone: "success", text: `Добавлено: ${product.name}` });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : `Штрихкод ${barcode} не найден`,
      });
    }
  }

  async function handleConfirm() {
    if (!order || order.items.length === 0) {
      return;
    }
    if (
      order.items.some((item) => item.kind === "service" || item.kind === "subscription") &&
      !selectedClient?.id &&
      !order.client_id
    ) {
      setBanner({ tone: "error", text: "Выберите клиента для услуги" });
      return;
    }

    setConfirming(true);
    setBanner(null);

    try {
      if (receiptDiscountTimerRef.current) {
        clearTimeout(receiptDiscountTimerRef.current);
        receiptDiscountTimerRef.current = null;
        await persistReceiptDiscount(order.id, receiptDiscountMode, receiptDiscountValue);
      }

      await sendOrderToAqsi(order.id, selectedClient?.id ?? order.client_id ?? null);
      await refreshOrder(order.id);
      setBanner({ tone: "success", text: "Отправлено ✓" });
      setHistoryReloadToken((value) => value + 1);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось отправить чек",
      });
    } finally {
      setConfirming(false);
    }
  }

  async function handleSyncPayment(orderId: string) {
    const isCurrentOrder = order?.id === orderId;

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
          setOrder(null);
          setSelectedClient(null);
        } else {
          setOrder(freshOrder);
        }
      }

      setHistoryReloadToken((value) => value + 1);
      setCatalogReloadToken((value) => value + 1);

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

  function handleStartNewOrder() {
    setOrder(null);
    setSelectedClient(null);
    setClientPickerOpen(false);
    setClientQuery("");
    setClientResults([]);
    setClientError(null);
    setBanner(null);
    setReceiptDiscountMode("percent");
    setReceiptDiscountValue("");
    setEditingLineDiscountKey(null);
    setLineDiscountValue("");
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

      if (order?.id === orderId) {
        setOrder(null);
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

    if (!confirm(`Оформить возврат на сумму ${formattedAmount}?`)) {
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

      if (order?.id === orderId) {
        setOrder((prev) => (prev ? { ...prev, ...updatedOrder } : prev));
      }
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Не удалось оформить возврат");
    } finally {
      setRefundingId(null);
    }
  }

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      if (receiptDiscountTimerRef.current) {
        clearTimeout(receiptDiscountTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const money = asAmount(order?.discount_money);
    const percent = asAmount(order?.discount_percent);
    const mode = detectDiscountMode(percent, money);

    setReceiptDiscountMode(mode);
    setReceiptDiscountValue(formatDiscountValue(mode, percent, money));
  }, [order?.id, order?.discount_percent, order?.discount_money]);

  useEffect(() => {
    if (!clientPickerOpen) {
      return;
    }

    let cancelled = false;
    const trimmedQuery = clientQuery.trim();

    const timer = window.setTimeout(async () => {
      setClientLoading(true);
      setClientError(null);

      try {
        const nextClients = await fetchClients({
          search: trimmedQuery || undefined,
          limit: 20,
        });

        if (!cancelled) {
          setClientResults(nextClients);
        }
      } catch (error) {
        if (!cancelled) {
          setClientError(error instanceof Error ? error.message : "Не удалось загрузить клиентов");
        }
      } finally {
        if (!cancelled) {
          setClientLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clientPickerOpen, clientQuery]);

  useEffect(() => {
    if (tab !== "cash") {
      return;
    }

    let cancelled = false;

    async function loadCatalogGroups() {
      setCatalogGroupsLoading(true);

      try {
        const [categories, services] = await Promise.all([
          fetchCategories(),
          fetchProducts({ forSale: true, type: "service" }),
        ]);

        if (!cancelled) {
          setCatalogGroups(buildCatalogGroups(categories, services.filter(isSellableInCash).length));
        }
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            text: error instanceof Error ? error.message : "Не удалось загрузить категории продаж",
          });
        }
      } finally {
        if (!cancelled) {
          setCatalogGroupsLoading(false);
        }
      }
    }

    void loadCatalogGroups();

    return () => {
      cancelled = true;
    };
  }, [catalogReloadToken, tab]);

  useEffect(() => {
    if (tab !== "cash") {
      return;
    }

    let cancelled = false;
    const trimmedQuery = query.trim();

    const timer = setTimeout(async () => {
      setCatalogLoading(true);

      try {
        let nextProducts: Product[] = [];

        if (trimmedQuery.length >= 2) {
          nextProducts = await searchProducts(trimmedQuery);
        } else if (selectedCatalogGroup === SERVICES_GROUP_ID) {
          nextProducts = await fetchProducts({ forSale: true, type: "service" });
        } else if (selectedCatalogGroup) {
          nextProducts = await fetchProducts({ forSale: true, categoryId: selectedCatalogGroup });
        }

        if (!cancelled) {
          setCatalog(nextProducts.filter(isSellableInCash));
        }
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            text: error instanceof Error ? error.message : "Не удалось загрузить каталог",
          });
        }
      } finally {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, catalogReloadToken, selectedCatalogGroup, tab]);

  useEffect(() => {
    if (tab !== "history") {
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
  }, [historyFilter, historyReloadToken, tab]);

  useEffect(() => {
    if (tab !== "cash" || clientPickerOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }

      const now = Date.now();

      if (event.key === "Enter") {
        const barcode = scannerBufferRef.current.trim();
        const isScannerInput = barcode.length >= 6 && now - scannerLastTsRef.current <= 100;
        scannerBufferRef.current = "";
        scannerLastTsRef.current = 0;

        if (isScannerInput) {
          event.preventDefault();
          void handleBarcodeScan(barcode);
        }
        return;
      }

      if (event.key.length === 1) {
        if (now - scannerLastTsRef.current > 100) {
          scannerBufferRef.current = "";
        }

        scannerBufferRef.current += event.key;
        scannerLastTsRef.current = now;
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [clientPickerOpen, confirming, order, tab]);

  const basketLines = groupOrderItems(order?.items ?? []);
  const basketGrossTotal = basketLines.reduce((sum, line) => sum + line.grossTotal, 0);
  const basketLineDiscountTotal = basketLines.reduce((sum, line) => sum + line.discountTotal, 0);
  const basketSubtotal = Math.max(0, basketGrossTotal - basketLineDiscountTotal);
  const orderLevelDiscount = resolveDiscountMoney(
    basketSubtotal,
    order?.discount_percent,
    order?.discount_money
  );
  const hasAnyDiscount = basketLineDiscountTotal > 0 || orderLevelDiscount > 0;
  const orderClientId = selectedClient?.id ?? order?.client_id ?? null;
  const serviceRequiresClient = basketLines.some(
    (line) => line.kind === "service" || line.kind === "subscription"
  );
  const sendBlockedByClient = serviceRequiresClient && !orderClientId;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-[family:var(--font-heading)] text-3xl font-semibold tracking-tight text-[var(--text-main)]">
            Продажи
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] p-1">
            <button
              type="button"
              onClick={() => setTab("cash")}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                tab === "cash"
                  ? "bg-[var(--accent)] text-[#062b26]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              Касса
            </button>
            <button
              type="button"
              onClick={() => setTab("history")}
              className={`rounded-full px-4 py-2 text-sm transition-colors ${
                tab === "history"
                  ? "bg-[var(--accent)] text-[#062b26]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              }`}
            >
              История
            </button>
          </div>

          {tab === "cash" && order && (
            <div className="rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2 text-xs text-[var(--text-muted)]">
              Чек #{order.id.slice(0, 8)}
            </div>
          )}
        </div>
      </div>

      {banner && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${getBannerClass(banner.tone)}`}>{banner.text}</div>
      )}

      {tab === "cash" ? (
        <div className="grid min-h-[calc(100vh-11rem)] gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
          <CatalogPanel
            query={query}
            setQuery={setQuery}
            catalogGroups={catalogGroups}
            selectedCatalogGroup={selectedCatalogGroup}
            setSelectedCatalogGroup={setSelectedCatalogGroup}
            catalogGroupsLoading={catalogGroupsLoading}
            catalogLoading={catalogLoading}
            catalog={catalog}
            lineBusyKey={lineBusyKey}
            orderLoading={orderLoading}
            orderLocked={orderLocked}
            addCatalogProduct={addCatalogProduct}
          />

          <CheckoutPanel
            orderLoading={orderLoading}
            order={order}
            basketLines={basketLines}
            selectedClient={selectedClient}
            clientSelectionLocked={clientSelectionLocked}
            setClientError={setClientError}
            setClientPickerOpen={setClientPickerOpen}
            applyClientSelection={applyClientSelection}
            clientSaving={clientSaving}
            serviceRequiresClient={serviceRequiresClient}
            orderClientId={orderClientId}
            lineBusyKey={lineBusyKey}
            orderLocked={orderLocked}
            editingLineDiscountKey={editingLineDiscountKey}
            lineDiscountMode={lineDiscountMode}
            setLineDiscountMode={setLineDiscountMode}
            lineDiscountValue={lineDiscountValue}
            setLineDiscountValue={setLineDiscountValue}
            lineDiscountSavingKey={lineDiscountSavingKey}
            openLineDiscountEditor={openLineDiscountEditor}
            removeLine={removeLine}
            decrementLine={decrementLine}
            incrementLine={incrementLine}
            saveLineDiscount={saveLineDiscount}
            setEditingLineDiscountKey={setEditingLineDiscountKey}
            receiptDiscountMode={receiptDiscountMode}
            receiptDiscountValue={receiptDiscountValue}
            scheduleReceiptDiscount={scheduleReceiptDiscount}
            receiptDiscountSaving={receiptDiscountSaving}
            hasAnyDiscount={hasAnyDiscount}
            basketGrossTotal={basketGrossTotal}
            basketLineDiscountTotal={basketLineDiscountTotal}
            orderLevelDiscount={orderLevelDiscount}
            confirming={confirming}
            orderAwaitingPayment={orderAwaitingPayment}
            sendBlockedByClient={sendBlockedByClient}
            handleConfirm={handleConfirm}
            handleStartNewOrder={handleStartNewOrder}
          />
        </div>
      ) : (
        <SalesHistoryPanel
          historyFilter={historyFilter}
          setHistoryFilter={setHistoryFilter}
          historyError={historyError}
          historyLoading={historyLoading}
          orders={orders}
          expandedOrderId={expandedOrderId}
          orderDetails={orderDetails}
          detailLoadingId={detailLoadingId}
          cancellingId={cancellingId}
          refundingId={refundingId}
          syncingOrderId={syncingOrderId}
          handleToggleOrder={handleToggleOrder}
          handleSyncPayment={handleSyncPayment}
          handleCancelOrder={handleCancelOrder}
          handleRefundOrder={handleRefundOrder}
        />
      )}
      <ClientPickerModal
        open={clientPickerOpen}
        query={clientQuery}
        error={clientError}
        loading={clientLoading}
        results={clientResults}
        saving={clientSaving}
        searchInputClassName={searchInputCls}
        onClose={() => {
          setClientPickerOpen(false);
          setClientError(null);
        }}
        onQueryChange={(value) => {
          setClientError(null);
          setClientQuery(value);
        }}
        onKeyDown={handleClientSearchKeyDown}
        onSelect={(client) => void applyClientSelection(client)}
        getClientName={getClientName}
        getClientSubscriptionLabel={getClientSubscriptionLabel}
      />
    </div>
  );
}


