"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  getClientSubscriptionLabel,
  isSellableInCash,
  resolveDiscountMoney,
  type BannerState,
} from "@/components/sales/sales-shared";
import { extractBarcodeFromGs1, normalizeMarkingInput } from "@/components/sales/sales-marking-utils";
import { useOrderBasket } from "@/components/sales/use-order-basket";
import { useOrderClient } from "@/components/sales/use-order-client";
import { useOrderDiscounts } from "@/components/sales/use-order-discounts";
import { useOrderScanner } from "@/components/sales/use-order-scanner";
import {
  createOrder,
  initiatePayment,
  syncSlip,
  syncAqsiV4,
  recoverTerminalBlocker,
  sendOrderToAqsi,
  updateOrderItem,
  type OrderDetail,
} from "@/lib/api/orders";
import { findByBarcode } from "@/lib/api/products";

type UseSalesOrderOptions = {
  cashViewActive: boolean;
  canCreateSales: boolean;
  canPaySales: boolean;
  canRecoverSalesAqsi: boolean;
  setBanner: Dispatch<SetStateAction<BannerState>>;
  onHistoryChanged?: () => void;
  onBarcodeScanComplete?: () => void;
};

export function useSalesOrder({
  cashViewActive,
  canCreateSales,
  canPaySales,
  canRecoverSalesAqsi,
  setBanner,
  onHistoryChanged,
  onBarcodeScanComplete,
}: UseSalesOrderOptions) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [slipPending, setSlipPending] = useState(false);
  const [conflictingOperationId, setConflictingOperationId] = useState<string | null>(null);

  const orderPromiseRef = useRef<Promise<OrderDetail> | null>(null);
  const confirmingRef = useRef(false);
  const slipPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slipSyncInFlightRef = useRef(false);

  // ── Sub-hooks ────────────────────────────────────────────────────────────────

  const clientApi = useOrderClient({
    order,
    orderAwaitingPayment: Boolean(order?.status === "open" && (order?.aqsi_receipt_id || order?.aqsi_sent_at || order?.aqsi_payment_operation_id || order?.aqsi_slip_id || order?.aqsi_receipt_operation_id)),
    setBanner,
    onOrderUpdate: (updater) => setOrder(updater),
  });

  const basketApi = useOrderBasket({
    order,
    orderAwaitingPayment: Boolean(order?.status === "open" && (order?.aqsi_receipt_id || order?.aqsi_sent_at || order?.aqsi_payment_operation_id || order?.aqsi_slip_id || order?.aqsi_receipt_operation_id)),
    canCreateSales,
    setBanner,
    setOrder,
  });

  const discountApi = useOrderDiscounts({
    order,
    orderAwaitingPayment: Boolean(order?.status === "open" && (order?.aqsi_receipt_id || order?.aqsi_sent_at || order?.aqsi_payment_operation_id || order?.aqsi_slip_id || order?.aqsi_receipt_operation_id)),
    canCreateSales,
    orderLoading,
    setBanner,
    refreshOrder: basketApi.refreshOrder,
  });

  const scannerApi = useOrderScanner({
    enabled: cashViewActive && canCreateSales && !clientApi.clientPickerOpen,
    onScan: (barcode) => void handleBarcodeScan(barcode),
  });

  // ── Derived state ─────────────────────────────────────────────────────────────

  const orderAwaitingPayment = Boolean(
    order?.status === "open" && (
      order?.aqsi_receipt_id ||
      order?.aqsi_sent_at ||
      order?.aqsi_payment_operation_id ||
      order?.aqsi_slip_id ||
      order?.aqsi_receipt_operation_id
    )
  );
  const receiptError = Boolean(
    order?.status === "open" &&
    order?.aqsi_receipt_status === "error" &&
    order?.aqsi_slip_id
  );
  const paymentBusy = slipPending || orderAwaitingPayment;
  const orderLocked = confirming || slipPending || orderAwaitingPayment;
  const clientSelectionLocked = orderLocked || clientApi.clientSaving;
  const orderClientId = clientApi.selectedClient?.id ?? order?.client_id ?? null;
  const serviceRequiresClient = basketApi.basketLines.some(
    (line) => line.kind === "service" || line.kind === "subscription"
  );
  const sendBlockedByClient = serviceRequiresClient && !orderClientId;
  const sendBlockedByMarking = basketApi.basketLines.some((line) => {
    if (!line.markingRequired) return false;
    return (basketApi.markingDrafts[line.key] ?? line.markingCode ?? "").trim().length === 0;
  });

  const basketGrossTotal = basketApi.basketLines.reduce((sum, line) => sum + line.grossTotal, 0);
  const basketLineDiscountTotal = basketApi.basketLines.reduce(
    (sum, line) => sum + line.discountTotal,
    0
  );
  const basketSubtotal = Math.max(0, basketGrossTotal - basketLineDiscountTotal);
  const orderLevelDiscount = resolveDiscountMoney(
    basketSubtotal,
    order?.discount_percent,
    order?.discount_money
  );
  const hasAnyDiscount = basketLineDiscountTotal > 0 || orderLevelDiscount > 0;

  // ── Order lifecycle ───────────────────────────────────────────────────────────

  async function ensureOrder() {
    if (order) return order;
    if (orderPromiseRef.current) return orderPromiseRef.current;
    if (!canCreateSales) {
      throw new Error("Недостаточно прав для создания чека");
    }

    const pending = (async () => {
      setOrderLoading(true);
      try {
        const freshOrder = await createOrder(undefined, clientApi.selectedClient?.id ?? null);
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

    orderPromiseRef.current = pending;
    return pending;
  }

  function handleStartNewOrder() {
    setOrder(null);
    setConfirming(false);
    setConflictingOperationId(null);
    setBanner(null);
    orderPromiseRef.current = null;
    clientApi.reset();
    basketApi.resetBasket();
    discountApi.resetDiscounts();
  }

  // ── Barcode scan handler ──────────────────────────────────────────────────────

  async function handleBarcodeScan(barcode: string) {
    if (!canCreateSales || confirming || orderAwaitingPayment) return;

    setBanner({ tone: "info", text: `Сканер: ${barcode}` });

    try {
      let product;
      try {
        product = await findByBarcode(barcode);
      } catch {
        throw new Error("Штрихкод не найден в базе");
      }

      if (!isSellableInCash(product)) {
        setBanner({ tone: "error", text: `Позиция "${product.name}" недоступна: остаток 0` });
        return;
      }

      // For non-marked products: repeated scan increments quantity instead of adding a new line
      if (!product.is_marked && !extractBarcodeFromGs1(barcode)) {
        const existingLine = basketApi.basketLinesRef.current.find(
          (line) => line.productId === product.id
        );
        if (existingLine) {
          await basketApi.incrementLine(existingLine);
          onBarcodeScanComplete?.();
          setBanner({
            tone: "success",
            text: `${product.name} — ×${existingLine.quantity + 1}`,
          });
          return;
        }
      }

      // If the scanned value looks like GS1 DataMatrix, capture it as marking code
      const capturedMarkingCode = extractBarcodeFromGs1(barcode)
        ? normalizeMarkingInput(barcode)
        : null;

      const normalizedBarcode = product.barcode?.trim() ?? "";
      const isMarkingScan =
        Boolean(product.is_marked) && barcode.length > 0 && barcode !== normalizedBarcode;
      const finalMarkingCode = capturedMarkingCode ?? (isMarkingScan ? barcode : null);

      const addResult = await basketApi.addCatalogProduct(product, ensureOrder, {
        markingCode: finalMarkingCode,
      });

      if (addResult === false) return;

      onBarcodeScanComplete?.();

      if (product.is_marked && !finalMarkingCode && typeof addResult === "string") {
        basketApi.setPendingMarkingLineKey(addResult);
        setBanner({ tone: "info", text: `${product.name} — отсканируйте код маркировки` });
      } else {
        setBanner({
          tone: "success",
          text: finalMarkingCode
            ? `Добавлено: ${product.name} — код маркировки считан`
            : `Добавлено: ${product.name}`,
        });
      }
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : `Штрихкод ${barcode} не найден`,
      });
    }
  }

  // ── Наличные: отправить в AQSI v2 ────────────────────────────────────────────

  async function handleConfirmCash() {
    if (confirmingRef.current) return;
    if (!canPaySales) {
      setBanner({ tone: "error", text: "Недостаточно прав для оплаты" });
      return;
    }
    if (!order || order.items.length === 0) return;

    if (serviceRequiresClient && !clientApi.selectedClient?.id && !order.client_id) {
      setBanner({ tone: "error", text: "Выберите клиента для услуги" });
      return;
    }

    const missingMarkingLine = basketApi.basketLines.find((line) => {
      if (!line.markingRequired) return false;
      return (basketApi.markingDrafts[line.key] ?? line.markingCode ?? "").trim().length === 0;
    });
    if (missingMarkingLine) {
      setBanner({
        tone: "error",
        text: `Для товара "${missingMarkingLine.name}" нужно отсканировать код маркировки`,
      });
      return;
    }

    confirmingRef.current = true;
    setConfirming(true);
    setBanner(null);

    try {
      // Flush pending receipt discount before sending
      const flushPromise = discountApi.flushReceiptDiscount();
      if (flushPromise) await flushPromise;

      // Save all unsaved marking codes
      for (const line of basketApi.basketLines) {
        if (!line.markingRequired || line.itemIds.length !== 1) continue;

        const nextCode = (basketApi.markingDrafts[line.key] ?? line.markingCode ?? "").trim();
        const savedCode = (line.markingCode ?? "").trim();
        if (nextCode === savedCode) continue;

        basketApi.setMarkingSavingKey(line.key);
        await updateOrderItem(order.id, line.itemIds[0], { marking_code: nextCode || null });
      }

      await basketApi.refreshOrder(order.id);
      await sendOrderToAqsi(order.id, clientApi.selectedClient?.id ?? order.client_id ?? null);

      onHistoryChanged?.();
      handleStartNewOrder();
      setBanner({ tone: "success", text: "Чек отправлен на кассу ✓" });
    } catch (error) {
      // Reload order so UI immediately reflects aqsi_sent_at if backend set it during a network failure
      if (order) {
        await basketApi.refreshOrder(order.id).catch(() => {});
      }
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "Не удалось отправить чек",
      });
    } finally {
      basketApi.setMarkingSavingKey(null);
      confirmingRef.current = false;
      setConfirming(false);
    }
  }

  // ── Acquiring flow (slip → receipt): карта ────────────────────────────────────

  function stopSlipPolling() {
    if (slipPollIntervalRef.current) {
      clearInterval(slipPollIntervalRef.current);
      slipPollIntervalRef.current = null;
    }
  }

  function startSlipPolling(orderId: string, intervalMs = 10000) {
    stopSlipPolling();
    slipPollIntervalRef.current = setInterval(() => {
      void handleSlipSync(orderId);
    }, intervalMs);
  }

  const handleSlipSync = useCallback(async (orderId: string) => {
    if (slipSyncInFlightRef.current) return;
    slipSyncInFlightRef.current = true;
    try {
      const result = await syncSlip(orderId);

      if (result.status === "pending") return;

      // Операция была сброшена сторонним процессом (watchdog или ручной reset) —
      // polling нужно остановить, заказ обновить чтобы отразить новое состояние.
      if (result.status === "no_payment_operation") {
        stopSlipPolling();
        setSlipPending(false);
        if (order) await basketApi.refreshOrder(order.id).catch(() => {});
        return;
      }

      stopSlipPolling();
      setSlipPending(false);

      if (result.status === "confirmed") {
        onHistoryChanged?.();
        handleStartNewOrder();
        const msg = result.has_marking_errors
          ? "Оплачено ✓ (предупреждение: ошибка маркировки в ГИС МТ)"
          : "Оплачено и фискализировано ✓";
        setBanner({ tone: result.has_marking_errors ? "error" : "success", text: msg });
      } else if (result.status === "receipt_error") {
        // Деньги списаны, чек не напечатан — оставляем заказ открытым, показываем кнопку восстановления
        setBanner({ tone: "error", text: result.message ?? "Ошибка фискализации чека" });
        if (order) await basketApi.refreshOrder(order.id).catch(() => {});
      } else if (result.status === "cancelled") {
        setBanner({ tone: "info", text: "Оплата отменена" });
        if (order) await basketApi.refreshOrder(order.id).catch(() => {});
      } else {
        setBanner({ tone: "error", text: result.message ?? "Оплата не прошла" });
        if (order) await basketApi.refreshOrder(order.id).catch(() => {});
      }
    } catch {
      // network error during poll — keep polling
    } finally {
      slipSyncInFlightRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  useEffect(() => {
    return () => {
      stopSlipPolling();
    };
  }, []);

  // Auto-resume polling after page reload if payment was in progress
  useEffect(() => {
    if (!order?.id || !order.aqsi_payment_operation_id || order.status !== "open") return;
    if (!canPaySales) return;
    if (slipPollIntervalRef.current) return;

    setSlipPending(true);
    const orderId = order.id;
    if (order.aqsi_payment_status === "cancelling") {
      setBanner({ tone: "info", text: "Отмена отправлена на терминал. Подтвердите отмену на кассе." });
    } else {
      setBanner({ tone: "info", text: "Ожидаем оплату от клиента..." });
    }
    startSlipPolling(orderId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.aqsi_payment_operation_id, order?.aqsi_payment_status, canPaySales]);

  // Auto-poll when conflicting operation detected — clears automatically once AQSI resolves it
  useEffect(() => {
    if (!conflictingOperationId) return;
    if (!canRecoverSalesAqsi) return;
    const opId = conflictingOperationId;
    const checkId = setInterval(async () => {
      try {
        const result = await recoverTerminalBlocker(opId);
        if (result.resolved) {
          setConflictingOperationId(null);
          setBanner({ tone: "info", text: "Касса свободна. Можно повторить оплату." });
        }
      } catch (_) {}
    }, 30000);
    return () => clearInterval(checkId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictingOperationId, canRecoverSalesAqsi]);

  async function handleInitiatePayment() {
    if (confirmingRef.current || slipPending || orderAwaitingPayment) return;
    if (!canPaySales) {
      setBanner({ tone: "error", text: "Недостаточно прав для оплаты" });
      return;
    }
    if (!order || order.items.length === 0) return;

    if (serviceRequiresClient && !clientApi.selectedClient?.id && !order.client_id) {
      setBanner({ tone: "error", text: "Выберите клиента для услуги" });
      return;
    }

    const missingMarkingLine = basketApi.basketLines.find((line) => {
      if (!line.markingRequired) return false;
      return (basketApi.markingDrafts[line.key] ?? line.markingCode ?? "").trim().length === 0;
    });
    if (missingMarkingLine) {
      setBanner({ tone: "error", text: `Для товара "${missingMarkingLine.name}" нужно отсканировать код маркировки` });
      return;
    }

    confirmingRef.current = true;
    setBanner(null);

    try {
      const flushPromise = discountApi.flushReceiptDiscount();
      if (flushPromise) await flushPromise;

      for (const line of basketApi.basketLines) {
        if (!line.markingRequired || line.itemIds.length !== 1) continue;
        const nextCode = (basketApi.markingDrafts[line.key] ?? line.markingCode ?? "").trim();
        const savedCode = (line.markingCode ?? "").trim();
        if (nextCode === savedCode) continue;
        basketApi.setMarkingSavingKey(line.key);
        await updateOrderItem(order.id, line.itemIds[0], { marking_code: nextCode || null });
      }

      await basketApi.refreshOrder(order.id);
      const result = await initiatePayment(order.id);

      if (result.status === "operation_in_progress") {
        setConflictingOperationId(result.conflicting_operation_id);
        setBanner({ tone: "error", text: "На кассе выполняется другая операция. Отмените её и повторите оплату." });
        return;
      }

      setSlipPending(true);
      setBanner({ tone: "info", text: "Ожидаем оплату от клиента..." });

      startSlipPolling(order.id);
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : "Не удалось инициировать оплату" });
    } finally {
      basketApi.setMarkingSavingKey(null);
      confirmingRef.current = false;
    }
  }

  // ── Восстановление фискализации после ошибки чека ────────────────────────────

  async function handleSyncV4() {
    if (!order) return;
    if (!canRecoverSalesAqsi) {
      setBanner({ tone: "error", text: "Недостаточно прав для восстановления AQSI" });
      return;
    }
    setBanner({ tone: "info", text: "Проверяем статус фискализации..." });
    try {
      const result = await syncAqsiV4(order.id);
      if (result.status === "confirmed") {
        onHistoryChanged?.();
        handleStartNewOrder();
        setBanner({ tone: "success", text: result.has_marking_errors ? "Восстановлено ✓ (предупреждение: ошибка маркировки)" : "Восстановлено и фискализировано ✓" });
      } else if (result.status === "receipt_pending" || result.status === "payment_pending") {
        setBanner({ tone: "info", text: "Операция в процессе, попробуйте через несколько секунд" });
        await basketApi.refreshOrder(order.id).catch(() => {});
      } else if (result.status === "receipt_error") {
        setBanner({ tone: "error", text: result.message ?? "Ошибка фискализации" });
        await basketApi.refreshOrder(order.id).catch(() => {});
      } else {
        setBanner({ tone: "error", text: result.message ?? `Статус: ${result.status}` });
        await basketApi.refreshOrder(order.id).catch(() => {});
      }
    } catch (error) {
      setBanner({ tone: "error", text: error instanceof Error ? error.message : "Ошибка синхронизации" });
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    // Order
    order,
    setOrder,
    orderLoading,
    orderAwaitingPayment,
    orderLocked,
    confirming,
    receiptError,
    // Client
    selectedClient: clientApi.selectedClient,
    setSelectedClient: clientApi.setSelectedClient,
    clientPickerOpen: clientApi.clientPickerOpen,
    setClientPickerOpen: clientApi.setClientPickerOpen,
    clientQuery: clientApi.clientQuery,
    setClientQuery: clientApi.setClientQuery,
    clientResults: clientApi.clientResults,
    clientLoading: clientApi.clientLoading,
    clientSaving: clientApi.clientSaving,
    clientError: clientApi.clientError,
    setClientError: clientApi.setClientError,
    clientSelectionLocked,
    applyClientSelection: clientApi.applyClientSelection,
    handleClientSearchKeyDown: clientApi.handleClientSearchKeyDown,
    // Basket
    basketLines: basketApi.basketLines,
    lineBusyKey: basketApi.lineBusyKey,
    markingSavingKey: basketApi.markingSavingKey,
    markingDrafts: basketApi.markingDrafts,
    pendingMarkingLineKey: basketApi.pendingMarkingLineKey,
    setMarkingDraftValue: basketApi.setMarkingDraftValue,
    clearPendingMarkingLineKey: basketApi.clearPendingMarkingLineKey,
    addCatalogProduct: (product: Parameters<typeof basketApi.addCatalogProduct>[0], options?: Parameters<typeof basketApi.addCatalogProduct>[2]) =>
      basketApi.addCatalogProduct(product, ensureOrder, options),
    decrementLine: basketApi.decrementLine,
    incrementLine: basketApi.incrementLine,
    removeLine: basketApi.removeLine,
    // Discounts
    receiptDiscountMode: discountApi.receiptDiscountMode,
    setReceiptDiscountMode: discountApi.setReceiptDiscountMode,
    receiptDiscountValue: discountApi.receiptDiscountValue,
    receiptDiscountSaving: discountApi.receiptDiscountSaving,
    editingLineDiscountKey: discountApi.editingLineDiscountKey,
    setEditingLineDiscountKey: discountApi.setEditingLineDiscountKey,
    lineDiscountMode: discountApi.lineDiscountMode,
    setLineDiscountMode: discountApi.setLineDiscountMode,
    lineDiscountValue: discountApi.lineDiscountValue,
    setLineDiscountValue: discountApi.setLineDiscountValue,
    lineDiscountSavingKey: discountApi.lineDiscountSavingKey,
    scheduleReceiptDiscount: discountApi.scheduleReceiptDiscount,
    openLineDiscountEditor: discountApi.openLineDiscountEditor,
    saveLineDiscount: discountApi.saveLineDiscount,
    // Scanner
    setMarkingFieldActive: scannerApi.setMarkingFieldActive,
    // Derived totals
    basketGrossTotal,
    basketLineDiscountTotal,
    orderLevelDiscount,
    hasAnyDiscount,
    orderClientId,
    serviceRequiresClient,
    sendBlockedByClient,
    sendBlockedByMarking,
    // Actions
    handleConfirmCash,
    handleInitiatePayment,
    handleSyncV4,
    handleStartNewOrder,
    conflictingOperationId,
    getClientSubscriptionLabel,
    slipPending,
    paymentBusy,
  };
}
