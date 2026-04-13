"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
} from "react";

import {
  asAmount,
  detectDiscountMode,
  formatDiscountValue,
  getClientSubscriptionLabel,
  groupOrderItems,
  isSellableInCash,
  parseDiscountInput,
  resolveDiscountMoney,
  resolveOrderItemKind,
  type BannerState,
  type BasketLine,
  type DiscountMode,
} from "@/components/sales/sales-shared";
import { type ClientListItem, fetchClients, findClientByBarcode } from "@/lib/api/clients";
import {
  addOrderItem,
  createOrder,
  fetchOrder,
  removeOrderItem,
  sendOrderToAqsi,
  updateOrder,
  updateOrderItem,
  type OrderDetail,
} from "@/lib/api/orders";
import { findByBarcode, type Product } from "@/lib/api/products";

type UseSalesOrderOptions = {
  cashViewActive: boolean;
  setBanner: Dispatch<SetStateAction<BannerState>>;
  onHistoryChanged?: () => void;
};

export function useSalesOrder({
  cashViewActive,
  setBanner,
  onHistoryChanged,
}: UseSalesOrderOptions) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [lineBusyKey, setLineBusyKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
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
  const [markingSavingKey, setMarkingSavingKey] = useState<string | null>(null);
  const [markingDrafts, setMarkingDrafts] = useState<Record<string, string>>({});

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

  function setMarkingDraftValue(lineKey: string, value: string) {
    setMarkingDrafts((current) => ({
      ...current,
      [lineKey]: value,
    }));
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
      setClientError(
        error instanceof Error ? error.message : `Клиент по штрихкоду ${barcode} не найден`
      );
    } finally {
      setClientLoading(false);
    }
  }

  function handleClientSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
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
    const nextMode = detectDiscountMode(line.discountPercent, line.discountMoney);
    setEditingLineDiscountKey((current) => (current === line.key ? null : line.key));
    setLineDiscountMode(nextMode);
    setLineDiscountValue(
      formatDiscountValue(nextMode, line.discountPercent, line.discountMoney)
    );
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

  async function addCatalogProduct(
    product: Product,
    options?: {
      markingCode?: string | null;
    }
  ) {
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

      const created = await addOrderItem(activeOrder.id, {
        kind: resolveOrderItemKind(product),
        product_id: product.id,
        name: product.name,
        sku: product.sku,
        sale_price: Number.parseFloat(product.sale_price),
        cost_price: product.cost_price ? Number.parseFloat(product.cost_price) : null,
        quantity: 1,
      });

      const initialMarkingCode = options?.markingCode?.trim();

      if (initialMarkingCode) {
        setMarkingDrafts((current) => ({
          ...current,
          [`marked:${created.item.id}`]: initialMarkingCode,
        }));
      }

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
    if (!order || orderAwaitingPayment) {
      return;
    }

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
      const scannedValue = barcode.trim();
      const product = await findByBarcode(scannedValue);
      if (!isSellableInCash(product)) {
        setBanner({
          tone: "error",
          text: `Позиция "${product.name}" недоступна: остаток 0`,
        });
        return;
      }

      const normalizedBarcode = product.barcode?.trim() ?? "";
      const shouldCaptureMarking =
        Boolean(product.is_marked || product.has_marking) &&
        scannedValue.length > 0 &&
        scannedValue !== normalizedBarcode;

      await addCatalogProduct(product, {
        markingCode: shouldCaptureMarking ? scannedValue : null,
      });
      setBanner({
        tone: "success",
        text: shouldCaptureMarking
          ? `Добавлено: ${product.name} — код маркировки считан`
          : `Добавлено: ${product.name}`,
      });
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

    const serviceRequiresClient = order.items.some(
      (item) => item.kind === "service" || item.kind === "subscription"
    );

    if (serviceRequiresClient && !selectedClient?.id && !order.client_id) {
      setBanner({ tone: "error", text: "Выберите клиента для услуги" });
      return;
    }

    const missingMarkingLine = basketLines.find((line) => {
      if (!line.markingRequired) {
        return false;
      }

      const draftCode = (markingDrafts[line.key] ?? line.markingCode ?? "").trim();
      return draftCode.length === 0;
    });
    if (missingMarkingLine) {
      setBanner({
        tone: "error",
        text: `Для товара "${missingMarkingLine.name}" нужно отсканировать код маркировки`,
      });
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

      for (const line of basketLines) {
        if (!line.markingRequired || line.itemIds.length !== 1) {
          continue;
        }

        const nextMarkingCode = (markingDrafts[line.key] ?? line.markingCode ?? "").trim();
        const savedMarkingCode = (line.markingCode ?? "").trim();

        if (nextMarkingCode === savedMarkingCode) {
          continue;
        }

        setMarkingSavingKey(line.key);
        await updateOrderItem(order.id, line.itemIds[0], {
          marking_code: nextMarkingCode || null,
        });
      }

      await refreshOrder(order.id);

      await sendOrderToAqsi(order.id, selectedClient?.id ?? order.client_id ?? null);
      await refreshOrder(order.id);
      setBanner({ tone: "success", text: "Отправлено ✓" });
      onHistoryChanged?.();
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось отправить чек",
      });
    } finally {
      setMarkingSavingKey(null);
      setConfirming(false);
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
    setMarkingDrafts({});
    orderPromiseRef.current = null;
  }

  useEffect(() => {
    return () => {
      if (receiptDiscountTimerRef.current) {
        clearTimeout(receiptDiscountTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const money = asAmount(order?.discount_money);
    const percent = asAmount(order?.discount_percent);
    const nextMode = detectDiscountMode(percent, money);

    setReceiptDiscountMode(nextMode);
    setReceiptDiscountValue(formatDiscountValue(nextMode, percent, money));
  }, [order?.id, order?.discount_money, order?.discount_percent]);

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
    if (!cashViewActive || clientPickerOpen) {
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
  }, [cashViewActive, clientPickerOpen, confirming, orderAwaitingPayment]);

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
  const sendBlockedByMarking = basketLines.some((line) => line.markingRequired && !line.markingCode);

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

  return {
    order,
    setOrder,
    orderLoading,
    lineBusyKey,
    confirming,
    selectedClient,
    setSelectedClient,
    clientPickerOpen,
    setClientPickerOpen,
    clientQuery,
    clientResults,
    clientLoading,
    clientSaving,
    clientError,
    setClientError,
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
    markingSavingKey,
    orderAwaitingPayment,
    orderLocked,
    clientSelectionLocked,
    basketLines,
    basketGrossTotal,
    basketLineDiscountTotal,
    orderLevelDiscount,
    hasAnyDiscount,
    markingDrafts,
    orderClientId,
    serviceRequiresClient,
    sendBlockedByClient,
    sendBlockedByMarking,
    setMarkingDraftValue,
    applyClientSelection,
    handleClientSearchKeyDown,
    setClientQuery: (value: string) => {
      setClientError(null);
      setClientQuery(value);
    },
    addCatalogProduct,
    decrementLine,
    incrementLine,
    removeLine,
    openLineDiscountEditor,
    saveLineDiscount,
    scheduleReceiptDiscount,
    handleConfirm,
    handleStartNewOrder,
    getClientSubscriptionLabel,
  };
}
