"use client";

import { useEffect, useRef, useState } from "react";

import {
  addOrderItem,
  cancelOrder,
  createOrder,
  fetchOrder,
  fetchOrders,
  Order,
  OrderDetail,
  OrderItem,
  OrderItemKind,
  OrderStatus,
  removeOrderItem,
  refundOrder,
  sendOrderToAqsi,
  syncOrderWithAqsi,
  updateOrder,
  updateOrderItem,
} from "@/lib/api/orders";
import { Category, fetchCategories } from "@/lib/api/categories";
import { ClientListItem, fetchClients, findClientByBarcode } from "@/lib/api/clients";
import { fetchProducts, findByBarcode, Product, searchProducts } from "@/lib/api/products";
import { ClientPickerModal } from "@/components/sales/client-picker-modal";
import { formatMoney } from "@/components/warehouse/shared";

type BannerTone = "info" | "success" | "error";
type SalesTab = "cash" | "history";
type HistoryFilter = "all" | OrderStatus;
type DiscountMode = "percent" | "money";
type CatalogGroup = {
  id: string;
  label: string;
  count: number;
  kind: "category" | "services";
};

type BannerState = {
  tone: BannerTone;
  text: string;
} | null;

type BasketLine = {
  key: string;
  itemIds: string[];
  productId: string | null;
  kind: OrderItemKind;
  name: string;
  sku: string | null;
  salePrice: string;
  costPrice: string | null;
  quantity: number;
  grossTotal: number;
  discountPercent: number;
  discountMoney: number;
  discountTotal: number;
  total: number;
};

const searchInputCls =
  "w-full rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(0,191,165,0.12)]";
const SERVICES_GROUP_ID = "__services__";

const historyFilters: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "Р’СЃРµ" },
  { value: "open", label: "РћР¶РёРґР°РµС‚" },
  { value: "confirmed", label: "РћРїР»Р°С‡РµРЅ" },
  { value: "refunded", label: "Р’РѕР·РІСЂР°С‚" },
  { value: "cancelled", label: "РћС‚РјРµРЅС‘РЅ" },
];

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M8.75 15a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM17.5 17.5l-4.375-4.375"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M5 4.167H3.75V7.5M15 4.167h1.25V7.5M5 15.833H3.75V12.5M15 15.833h1.25V12.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.083 5.833v8.334M10 5.833v8.334M12.917 5.833v8.334" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4.167 10h11.666" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M10 4.167v11.666M4.167 10h11.666" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="m6.25 6.25 7.5 7.5m0-7.5-7.5 7.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M5.417 3.75h9.166A1.667 1.667 0 0 1 16.25 5.417v9.166l-1.875-1.041L12.5 15l-1.875-1.458L8.75 15l-1.875-1.458L5 14.583V5.417A1.667 1.667 0 0 1 6.667 3.75"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7.5 7.083h6.25M7.5 10h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M10 5v5l3.333 1.667M17.5 10a7.5 7.5 0 1 1-2.197-5.303M17.5 3.333v3.334h-3.333"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="m5.833 7.917 4.167 4.166 4.167-4.166" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function resolveOrderItemKind(product: Product): OrderItemKind {
  if (product.has_stock) {
    return "product";
  }

  const typeName = (product.product_type_name ?? "").toLowerCase();
  if (typeName.includes("Р°Р±РѕРЅ")) {
    return "subscription";
  }

  return "service";
}

function getTypeLabel(product: Product) {
  if (product.product_type_name) {
    return product.product_type_name;
  }

  return product.has_stock ? "РўРѕРІР°СЂ" : "РЈСЃР»СѓРіР°";
}

function getCatalogAccentMeta(product: Product) {
  const kind = resolveOrderItemKind(product);

  if (kind === "subscription") {
    return {
      label: "РђР±РѕРЅРµРјРµРЅС‚",
      chipClass: "border-[rgba(210,153,34,0.22)] bg-[rgba(210,153,34,0.12)] text-[var(--warning)]",
      lineClass: "bg-[rgba(210,153,34,0.9)]",
    };
  }

  if (kind === "service") {
    return {
      label: "РЈСЃР»СѓРіР°",
      chipClass: "border-[rgba(0,191,165,0.22)] bg-[var(--accent-soft)] text-[var(--accent)]",
      lineClass: "bg-[rgba(0,191,165,0.92)]",
    };
  }

  return {
    label: getTypeLabel(product),
    chipClass: "border-[rgba(63,185,80,0.22)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]",
    lineClass: "bg-[rgba(63,185,80,0.9)]",
  };
}

function isSellableInCash(product: Product) {
  return !product.has_stock || product.stock > 0;
}

function buildCatalogGroups(categories: Category[], serviceCount: number): CatalogGroup[] {
  const groups: CatalogGroup[] = categories
    .filter((item) => item.product_count > 0)
    .map((item) => ({
      id: item.id,
      label: item.name,
      count: item.product_count,
      kind: "category" as const,
    }));

  if (serviceCount > 0) {
    groups.push({
      id: SERVICES_GROUP_ID,
      label: "РЈСЃР»СѓРіРё",
      count: serviceCount,
      kind: "services",
    });
  }

  return groups;
}

function getBannerClass(tone: BannerTone) {
  if (tone === "success") {
    return "border-[rgba(63,185,80,0.35)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]";
  }

  if (tone === "error") {
    return "border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]";
  }

  return "border-[rgba(0,191,165,0.28)] bg-[rgba(0,191,165,0.1)] text-[var(--accent)]";
}

function getStatusLabel(status: OrderStatus) {
  if (status === "refunded") {
    return "Р’РѕР·РІСЂР°С‚";
  }

  if (status === "confirmed") {
    return "РћРїР»Р°С‡РµРЅ";
  }

  if (status === "cancelled") {
    return "РћС‚РјРµРЅС‘РЅ";
  }

  return "РћР¶РёРґР°РµС‚ РѕРїР»Р°С‚С‹";
}

function getStatusBadgeClass(status: OrderStatus) {
  if (status === "refunded") {
    return "border-[rgba(210,153,34,0.28)] bg-[rgba(210,153,34,0.12)] text-[var(--warning)]";
  }

  if (status === "confirmed") {
    return "border-[rgba(63,185,80,0.24)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]";
  }

  if (status === "cancelled") {
    return "border-[rgba(248,81,73,0.24)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]";
  }

  return "border-[rgba(210,153,34,0.28)] bg-[rgba(210,153,34,0.12)] text-[var(--warning)]";
}

function getPaymentLabel(paymentType: Order["payment_type"]) {
  if (paymentType === "cash") {
    return "РќР°Р»РёС‡РЅС‹Рµ";
  }

  if (paymentType === "card") {
    return "РљР°СЂС‚Р°";
  }

  return "вЂ”";
}

function getHistoryActionButtonClass(tone: "accent" | "danger" | "warning") {
  if (tone === "danger") {
    return "rounded-full border border-[rgba(248,81,73,0.24)] bg-[rgba(248,81,73,0.12)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.18)] disabled:opacity-50";
  }

  if (tone === "warning") {
    return "rounded-full border border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] px-3 py-1.5 text-xs font-medium text-[var(--warning)] transition-colors hover:bg-[rgba(210,153,34,0.18)] disabled:opacity-50";
  }

  return "rounded-full border border-[rgba(0,191,165,0.24)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:brightness-110 disabled:opacity-50";
}

function getClientName(client: Pick<ClientListItem, "first_name" | "last_name" | "middle_name">) {
  return [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(" ");
}

function getSubscriptionTypeLabel(type: ClientListItem["subscription_type"]) {
  if (type === "single") {
    return "Р Р°Р·РѕРІРѕРµ";
  }

  if (type === "visits") {
    return "РќР° Р·Р°РЅСЏС‚РёСЏ";
  }

  if (type === "period") {
    return "РќР° РїРµСЂРёРѕРґ";
  }

  if (type === "unlimited") {
    return "Р‘РµР·Р»РёРјРёС‚";
  }

  return "Р‘РµР· Р°Р±РѕРЅРµРјРµРЅС‚Р°";
}

function getClientSubscriptionLabel(client: ClientListItem) {
  if (!client.subscription_id || client.subscription_status !== "active" || !client.subscription_type) {
    return "Р‘РµР· Р°РєС‚РёРІРЅРѕРіРѕ Р°Р±РѕРЅРµРјРµРЅС‚Р°";
  }

  if (client.subscription_type === "single" || client.subscription_type === "visits") {
    return `${getSubscriptionTypeLabel(client.subscription_type)} В· РѕСЃС‚Р°Р»РѕСЃСЊ ${client.visits_left ?? 0}`;
  }

  if (client.expires_at) {
    return `${getSubscriptionTypeLabel(client.subscription_type)} В· РґРѕ ${new Date(client.expires_at).toLocaleDateString("ru")}`;
  }

  return getSubscriptionTypeLabel(client.subscription_type);
}

function shouldDisplayInHistory(order: Order, filter: HistoryFilter) {
  if (filter !== "all" && order.status !== filter) {
    return false;
  }

  if (order.status === "open") {
    return Boolean(order.aqsi_receipt_id);
  }

  return true;
}

function formatSalesDate(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asAmount(value: string | number | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveDiscountMoney(
  baseAmount: string | number | null | undefined,
  discountPercent: string | number | null | undefined,
  discountMoney: string | number | null | undefined
) {
  const safeBase = Math.max(0, asAmount(baseAmount));
  const fixedMoney = Math.max(0, asAmount(discountMoney));
  const percent = Math.max(0, asAmount(discountPercent));
  const rawDiscount = fixedMoney > 0 ? fixedMoney : safeBase * (percent / 100);

  return Math.min(safeBase, rawDiscount);
}

function detectDiscountMode(
  discountPercent: string | number | null | undefined,
  discountMoney: string | number | null | undefined
): DiscountMode {
  return asAmount(discountMoney) > 0 ? "money" : "percent";
}

function formatDiscountValue(
  mode: DiscountMode,
  discountPercent: string | number | null | undefined,
  discountMoney: string | number | null | undefined
) {
  const value = mode === "money" ? asAmount(discountMoney) : asAmount(discountPercent);
  return value > 0 ? String(value) : "";
}

function parseDiscountInput(value: string) {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getItemNetTotal(item: OrderItem) {
  const grossTotal = asAmount(item.total);
  const discountTotal = resolveDiscountMoney(grossTotal, item.discount_percent, item.discount_money);

  return {
    grossTotal,
    discountTotal,
    total: Math.max(0, grossTotal - discountTotal),
  };
}

function groupOrderItems(items: OrderItem[]) {
  const grouped = new Map<string, BasketLine>();

  for (const item of items) {
    const discountPercent = asAmount(item.discount_percent);
    const discountMoney = asAmount(item.discount_money);
    const key = item.product_id
      ? `product:${item.product_id}:${item.sale_price}:${discountPercent}:${discountMoney}`
      : `custom:${item.name}:${item.sale_price}:${discountPercent}:${discountMoney}`;
    const existing = grouped.get(key);
    const grossTotal = asAmount(item.total);
    const discountTotal = resolveDiscountMoney(grossTotal, discountPercent, discountMoney);
    const itemTotal = Math.max(0, grossTotal - discountTotal);

    if (existing) {
      existing.itemIds.push(item.id);
      existing.quantity += item.quantity;
      existing.grossTotal += grossTotal;
      existing.discountTotal += discountTotal;
      existing.total += itemTotal;
      continue;
    }

    grouped.set(key, {
      key,
      itemIds: [item.id],
      productId: item.product_id,
      kind: item.kind,
      name: item.name,
      sku: item.sku,
      salePrice: item.sale_price,
      costPrice: item.cost_price,
      quantity: item.quantity,
      grossTotal,
      discountPercent,
      discountMoney,
      discountTotal,
      total: itemTotal,
    });
  }

  return Array.from(grouped.values());
}

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
          text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ С‡РµРє",
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
      setClientError(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РєР»РёРµРЅС‚Р° РІ С‡РµРєРµ");
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
      setClientError(error instanceof Error ? error.message : `РљР»РёРµРЅС‚ РїРѕ С€С‚СЂРёС…РєРѕРґСѓ ${barcode} РЅРµ РЅР°Р№РґРµРЅ`);
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
        text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕР±РЅРѕРІРёС‚СЊ СЃРєРёРґРєСѓ РЅР° С‡РµРє",
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
        text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ СЃРєРёРґРєСѓ РїРѕ РїРѕР·РёС†РёРё",
      });
    } finally {
      setLineDiscountSavingKey(null);
    }
  }

  async function addCatalogProduct(product: Product) {
    if (orderAwaitingPayment) {
      setBanner({
        tone: "info",
        text: "Р­С‚РѕС‚ С‡РµРє СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅ РЅР° РєР°СЃСЃСѓ. РЎРЅР°С‡Р°Р»Р° РїСЂРѕРІРµСЂСЊС‚Рµ РѕРїР»Р°С‚Сѓ РёР»Рё РѕС‚РєСЂРѕР№С‚Рµ РЅРѕРІС‹Р№ С‡РµРє.",
      });
      return;
    }

    if (!isSellableInCash(product)) {
      setBanner({
        tone: "error",
        text: `РџРѕР·РёС†РёСЏ "${product.name}" РЅРµРґРѕСЃС‚СѓРїРЅР°: РѕСЃС‚Р°С‚РѕРє 0`,
      });
      return;
    }

    if (!product.sale_price) {
      setBanner({
        tone: "error",
        text: `РЈ РїРѕР·РёС†РёРё "${product.name}" РЅРµ СѓРєР°Р·Р°РЅР° С†РµРЅР° РїСЂРѕРґР°Р¶Рё`,
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
        text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РїРѕР·РёС†РёСЋ",
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
        text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ РєРѕР»РёС‡РµСЃС‚РІРѕ",
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
        text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РёР·РјРµРЅРёС‚СЊ РєРѕР»РёС‡РµСЃС‚РІРѕ",
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
        text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ РїРѕР·РёС†РёСЋ",
      });
    } finally {
      setLineBusyKey(null);
    }
  }

  async function handleBarcodeScan(barcode: string) {
    if (confirming || orderAwaitingPayment) {
      return;
    }

    setBanner({ tone: "info", text: `РЎРєР°РЅРµСЂ: ${barcode}` });

    try {
      const product = await findByBarcode(barcode);
      if (!isSellableInCash(product)) {
        setBanner({
          tone: "error",
          text: `РџРѕР·РёС†РёСЏ "${product.name}" РЅРµРґРѕСЃС‚СѓРїРЅР°: РѕСЃС‚Р°С‚РѕРє 0`,
        });
        return;
      }

      await addCatalogProduct(product);
      setBanner({ tone: "success", text: `Р”РѕР±Р°РІР»РµРЅРѕ: ${product.name}` });
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : `РЁС‚СЂРёС…РєРѕРґ ${barcode} РЅРµ РЅР°Р№РґРµРЅ`,
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
      setBanner({ tone: "error", text: "Р’С‹Р±РµСЂРёС‚Рµ РєР»РёРµРЅС‚Р° РґР»СЏ СѓСЃР»СѓРіРё" });
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
      setBanner({ tone: "success", text: "РћС‚РїСЂР°РІР»РµРЅРѕ вњ“" });
      setHistoryReloadToken((value) => value + 1);
    } catch (error) {
      setBanner({
        tone: "error",
        text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ С‡РµРє",
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
              ? "РћРїР»Р°С‚Р° РїРѕРґС‚РІРµСЂР¶РґРµРЅР° РєР°СЃСЃРѕР№: РЅР°Р»РёС‡РЅС‹Рµ вњ“"
              : result.payment_type === "card"
                ? "РћРїР»Р°С‚Р° РїРѕРґС‚РІРµСЂР¶РґРµРЅР° РєР°СЃСЃРѕР№: РєР°СЂС‚Р° вњ“"
              : "РћРїР»Р°С‚Р° РїРѕРґС‚РІРµСЂР¶РґРµРЅР° РєР°СЃСЃРѕР№ вњ“",
        });

        return;
      }

      setHistoryError(
        result.aqsi_status
          ? `РљР°СЃСЃР° РїРѕРєР° РЅРµ РїРѕРґС‚РІРµСЂРґРёР»Р° РѕРїР»Р°С‚Сѓ: ${result.aqsi_status}`
          : "РљР°СЃСЃР° РїРѕРєР° РЅРµ РїРѕРґС‚РІРµСЂРґРёР»Р° РѕРїР»Р°С‚Сѓ"
      );
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ РѕРїР»Р°С‚Сѓ РЅР° РєР°СЃСЃРµ");
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
      setHistoryError(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРѕСЃС‚Р°РІ Р·Р°РєР°Р·Р°");
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
      setHistoryError(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РјРµРЅРёС‚СЊ Р·Р°РєР°Р·");
    } finally {
      setCancellingId(null);
    }
  }

  async function handleRefundOrder(orderId: string, amount: string) {
    const formattedAmount = formatMoney(amount);

    if (!confirm(`РћС„РѕСЂРјРёС‚СЊ РІРѕР·РІСЂР°С‚ РЅР° СЃСѓРјРјСѓ ${formattedAmount}?`)) {
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
      setHistoryError(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС„РѕСЂРјРёС‚СЊ РІРѕР·РІСЂР°С‚");
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
          setClientError(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєР»РёРµРЅС‚РѕРІ");
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
            text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєР°С‚РµРіРѕСЂРёРё РїСЂРѕРґР°Р¶",
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
            text: error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РєР°С‚Р°Р»РѕРі",
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
          setHistoryError(error instanceof Error ? error.message : "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёСЃС‚РѕСЂРёСЋ РїСЂРѕРґР°Р¶");
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
            РџСЂРѕРґР°Р¶Рё
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
              РљР°СЃСЃР°
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
              РСЃС‚РѕСЂРёСЏ
            </button>
          </div>

          {tab === "cash" && order && (
            <div className="rounded-full border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-2 text-xs text-[var(--text-muted)]">
              Р§РµРє #{order.id.slice(0, 8)}
            </div>
          )}
        </div>
      </div>

      {banner && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${getBannerClass(banner.tone)}`}>{banner.text}</div>
      )}

      {tab === "cash" ? (
        <div className="grid min-h-[calc(100vh-11rem)] gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
          <section className="flex min-h-0 flex-col rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
            <div className="border-b border-[var(--line-soft)] p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="relative block">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--text-muted)]">
                      <SearchIcon />
                    </span>
                    <input
                      type="text"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="РџРѕРёСЃРє РїРѕ РЅР°Р·РІР°РЅРёСЋ РёР»Рё SKU..."
                      className={`${searchInputCls} pl-12`}
                    />
                  </label>
                </div>

                <div className="inline-flex items-center gap-2 rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-3 py-2 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <ScanIcon />
                  </span>
                  <span>РЎРєР°РЅРµСЂ: 6+ СЃРёРјРІРѕР»РѕРІ Р·Р° 100РјСЃ + Enter</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {catalogGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => {
                      setSelectedCatalogGroup(group.id);
                      setQuery("");
                    }}
                    className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                      selectedCatalogGroup === group.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--line-soft)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                    }`}
                  >
                    {group.label}
                    <span className="ml-2 text-xs opacity-70">{group.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {catalogGroupsLoading || catalogLoading ? (
                <div className="py-16 text-center text-sm text-[var(--text-muted)]">Р—Р°РіСЂСѓР·РєР° РєР°С‚Р°Р»РѕРіР°...</div>
              ) : catalog.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[var(--line-soft)] bg-[rgba(13,17,23,0.2)] px-5 py-12 text-center">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-[rgba(0,191,165,0.24)] bg-[rgba(0,191,165,0.08)] text-[var(--accent)]">
                    <SearchIcon />
                  </div>
                  <p className="mt-4 text-base font-medium text-[var(--text-main)]">РќРёС‡РµРіРѕ РЅРµ РЅР°Р№РґРµРЅРѕ</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">РџРѕРїСЂРѕР±СѓР№С‚Рµ РґСЂСѓРіРѕР№ Р·Р°РїСЂРѕСЃ РёР»Рё РѕС‚СЃРєР°РЅРёСЂСѓР№С‚Рµ С€С‚СЂРёС…РєРѕРґ</p>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {catalog.map((product) => {
                    const lineBusy = lineBusyKey === product.id;
                    const disabled = !product.sale_price || orderLoading || orderLocked;
                    const accentMeta = getCatalogAccentMeta(product);

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => void addCatalogProduct(product)}
                        disabled={disabled || lineBusy}
                        className={`group relative overflow-hidden rounded-[24px] border p-4 text-left transition-all ${
                          disabled
                            ? "cursor-not-allowed border-[var(--line-soft)] bg-[rgba(240,246,255,0.03)] opacity-60"
                            : "border-[var(--line-soft)] bg-[linear-gradient(180deg,rgba(34,43,61,0.9),rgba(28,35,51,0.95))] hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[rgba(0,191,165,0.08)]"
                        }`}
                      >
                        <span className={`absolute inset-x-4 top-0 h-1 rounded-b-full ${accentMeta.lineClass}`} />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="line-clamp-2 text-sm font-semibold text-[var(--text-main)]">{product.name}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${accentMeta.chipClass}`}>
                                {accentMeta.label}
                              </span>
                              {product.category_name && (
                                <span className="rounded-full border border-[rgba(255,255,255,0.08)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                                  {product.category_name}
                                </span>
                              )}
                            </div>
                          </div>
                          {product.has_stock && product.stock <= 3 && (
                            <span className="rounded-full border border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--warning)]">
                              РјР°Р»Рѕ
                            </span>
                          )}
                        </div>

                        <div className={`mt-4 grid gap-3 ${product.has_stock ? "grid-cols-2" : "grid-cols-1"}`}>
                          <div className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(13,17,23,0.38)] px-3 py-2">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">Р¦РµРЅР°</p>
                            <p className="mt-2 text-base font-semibold text-[var(--text-main)]">
                              {formatMoney(product.sale_price)}
                            </p>
                          </div>

                          {product.has_stock && (
                            <div className="rounded-2xl border border-[var(--line-soft)] bg-[rgba(13,17,23,0.38)] px-3 py-2">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">РћСЃС‚Р°С‚РѕРє</p>
                              <p
                                className={`mt-2 text-base font-semibold ${
                                  product.stock > 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                                }`}
                              >
                                {product.stock} С€С‚.
                              </p>
                            </div>
                          )}
                        </div>

                        {lineBusy && <p className="mt-3 text-xs text-[var(--accent)]">Р”РѕР±Р°РІР»СЏРµРј РІ С‡РµРє...</p>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)]">
            <div className="border-b border-[var(--line-soft)] p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">РўРµРєСѓС‰РёР№ С‡РµРє</p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {orderLoading
                      ? "РЎРѕР·РґР°С‘Рј РЅРѕРІС‹Р№ С‡РµРє..."
                      : order
                        ? `${basketLines.length} РїРѕР·РёС†РёР№ В· ${order.status === "open" ? "РѕС‚РєСЂС‹С‚" : order.status}`
                        : "Р§РµРє СЃРѕР·РґР°СЃС‚СЃСЏ РїСЂРё РїРµСЂРІРѕР№ РїРѕР·РёС†РёРё"}
                  </p>
                </div>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <ReceiptIcon />
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="mb-5 rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">РљР»РёРµРЅС‚</p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      {selectedClient
                        ? "Р§РµРє Р±СѓРґРµС‚ РїСЂРёРІСЏР·Р°РЅ Рє РІС‹Р±СЂР°РЅРЅРѕРјСѓ РєР»РёРµРЅС‚Сѓ"
                        : "Р”Р»СЏ С‚РѕРІР°СЂРѕРІ РєР»РёРµРЅС‚ РЅРµ РѕР±СЏР·Р°С‚РµР»РµРЅ, РґР»СЏ СѓСЃР»СѓРі Рё Р°Р±РѕРЅРµРјРµРЅС‚РѕРІ РѕР±СЏР·Р°С‚РµР»РµРЅ"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setClientError(null);
                        setClientPickerOpen(true);
                      }}
                      disabled={clientSelectionLocked}
                      className="rounded-full border border-[rgba(0,191,165,0.24)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-50"
                    >
                      {selectedClient ? "РЎРјРµРЅРёС‚СЊ РєР»РёРµРЅС‚Р°" : "Р’С‹Р±СЂР°С‚СЊ РєР»РёРµРЅС‚Р°"}
                    </button>
                    {selectedClient && (
                      <button
                        type="button"
                        onClick={() => void applyClientSelection(null)}
                        disabled={clientSelectionLocked}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--line-soft)] text-[var(--text-muted)] transition-colors hover:text-[var(--text-main)] disabled:opacity-50"
                        aria-label="РЈР±СЂР°С‚СЊ РєР»РёРµРЅС‚Р° РёР· С‡РµРєР°"
                      >
                        <CloseIcon />
                      </button>
                    )}
                  </div>
                </div>

                {selectedClient ? (
                  <div className="mt-4 rounded-[20px] border border-[rgba(0,191,165,0.18)] bg-[rgba(0,191,165,0.08)] px-4 py-3">
                    <p className="text-sm font-semibold text-[var(--text-main)]">{getClientName(selectedClient)}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                      <span>{selectedClient.phone || "РўРµР»РµС„РѕРЅ РЅРµ СѓРєР°Р·Р°РЅ"}</span>
                      <span>{getClientSubscriptionLabel(selectedClient)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[20px] border border-dashed border-[var(--line-soft)] bg-[rgba(13,17,23,0.24)] px-4 py-4 text-sm text-[var(--text-muted)]">
                    РљР»РёРµРЅС‚ РЅРµ РІС‹Р±СЂР°РЅ
                  </div>
                )}

                {clientSaving && <p className="mt-3 text-xs text-[var(--accent)]">РЎРѕС…СЂР°РЅСЏРµРј РєР»РёРµРЅС‚Р°...</p>}
                {serviceRequiresClient && !orderClientId && (
                  <p className="mt-3 text-xs text-[var(--warning)]">
                    Р’ С‡РµРєРµ РµСЃС‚СЊ СѓСЃР»СѓРіР°. Р’С‹Р±РµСЂРёС‚Рµ РєР»РёРµРЅС‚Р° РїРµСЂРµРґ РѕС‚РїСЂР°РІРєРѕР№ РЅР° РєР°СЃСЃСѓ.
                  </p>
                )}
              </div>

              {orderLoading ? (
                <div className="py-16 text-center text-sm text-[var(--text-muted)]">РџРѕРґРіРѕС‚Р°РІР»РёРІР°РµРј С‡РµРє...</div>
              ) : basketLines.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-5 py-12 text-center">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                    <ReceiptIcon />
                  </div>
                  <p className="mt-4 text-base font-medium text-[var(--text-main)]">Р§РµРє РїСѓСЃС‚</p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Р’С‹Р±РµСЂРёС‚Рµ РїРѕР·РёС†РёСЋ СЃР»РµРІР° РёР»Рё РѕС‚СЃРєР°РЅРёСЂСѓР№С‚Рµ С€С‚СЂРёС…РєРѕРґ
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {basketLines.map((line) => {
                    const busy = lineBusyKey === line.key;
                    const savingDiscount = lineDiscountSavingKey === line.key;
                    const isEditingDiscount = editingLineDiscountKey === line.key;
                    const hasLineDiscount = line.discountTotal > 0;

                    return (
                      <div
                        key={line.key}
                        className="rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--text-main)]">{line.name}</p>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                              {line.sku && <span className="font-[family:var(--font-mono)]">{line.sku}</span>}
                              <span>{formatMoney(line.salePrice)} Р·Р° С€С‚.</span>
                              {hasLineDiscount && (
                                <span className="rounded-full border border-[rgba(0,191,165,0.22)] px-2 py-0.5 text-[10px] text-[var(--accent)]">
                                  РЎРєРёРґРєР° {line.discountMoney > 0 ? formatMoney(line.discountMoney) : `${line.discountPercent}%`}
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void removeLine(line)}
                            disabled={busy || orderLocked}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(248,81,73,0.22)] text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.1)] disabled:opacity-50"
                            aria-label={`РЈРґР°Р»РёС‚СЊ ${line.name}`}
                          >
                            <CloseIcon />
                          </button>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--line-soft)] bg-[rgba(13,17,23,0.38)] p-1.5">
                            <button
                              type="button"
                              onClick={() => void decrementLine(line)}
                              disabled={busy || orderLocked}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-main)] transition-colors hover:bg-white/5 disabled:opacity-50"
                              aria-label={`РЈРјРµРЅСЊС€РёС‚СЊ РєРѕР»РёС‡РµСЃС‚РІРѕ ${line.name}`}
                            >
                              <MinusIcon />
                            </button>
                            <span className="min-w-10 text-center text-sm font-semibold text-[var(--text-main)]">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => void incrementLine(line)}
                              disabled={busy || orderLocked}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-main)] transition-colors hover:bg-white/5 disabled:opacity-50"
                              aria-label={`РЈРІРµР»РёС‡РёС‚СЊ РєРѕР»РёС‡РµСЃС‚РІРѕ ${line.name}`}
                            >
                              <PlusIcon />
                            </button>
                          </div>

                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-muted)]">РС‚РѕРіРѕ</p>
                            {hasLineDiscount && (
                              <p className="mt-1 text-xs text-[var(--text-muted)] line-through">{formatMoney(line.grossTotal)}</p>
                            )}
                            <p className="mt-1 text-lg font-semibold text-[var(--text-main)]">{formatMoney(line.total)}</p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => openLineDiscountEditor(line)}
                            disabled={busy || orderLocked || savingDiscount}
                            className="text-xs text-[var(--accent)] underline underline-offset-4 transition-colors hover:text-[var(--text-main)] disabled:opacity-50"
                          >
                            {hasLineDiscount ? "РР·РјРµРЅРёС‚СЊ СЃРєРёРґРєСѓ" : "РЎРєРёРґРєР°"}
                          </button>
                          {hasLineDiscount && <p className="text-xs text-[var(--accent)]">в€’{formatMoney(line.discountTotal)}</p>}
                        </div>

                        {isEditingDiscount && (
                          <div className="mt-3 rounded-2xl border border-[var(--line-soft)] bg-[rgba(13,17,23,0.38)] p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setLineDiscountMode("percent")}
                                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                                  lineDiscountMode === "percent"
                                    ? "bg-[var(--accent)] text-[#062b26]"
                                    : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                                }`}
                              >
                                %
                              </button>
                              <button
                                type="button"
                                onClick={() => setLineDiscountMode("money")}
                                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                                  lineDiscountMode === "money"
                                    ? "bg-[var(--accent)] text-[#062b26]"
                                    : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                                }`}
                              >
                                в‚Ѕ
                              </button>
                              <input
                                type="number"
                                min="0"
                                step={lineDiscountMode === "percent" ? "0.1" : "0.01"}
                                value={lineDiscountValue}
                                onChange={(event) => setLineDiscountValue(event.target.value)}
                                placeholder={lineDiscountMode === "percent" ? "0%" : "0 в‚Ѕ"}
                                className="min-w-[120px] flex-1 rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
                              />
                              <button
                                type="button"
                                onClick={() => void saveLineDiscount(line)}
                                disabled={savingDiscount}
                                className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[#062b26] disabled:opacity-50"
                              >
                                {savingDiscount ? "РЎРѕС…СЂР°РЅСЏРµРј..." : "РЎРѕС…СЂР°РЅРёС‚СЊ"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLineDiscountKey(null);
                                  setLineDiscountValue("");
                                }}
                                className="rounded-xl border border-[var(--line-soft)] px-3 py-2 text-xs text-[var(--text-muted)]"
                              >
                                Р—Р°РєСЂС‹С‚СЊ
                              </button>
                            </div>
                          </div>
                        )}

                        {busy && <p className="mt-3 text-xs text-[var(--accent)]">РћР±РЅРѕРІР»СЏРµРј РїРѕР·РёС†РёСЋ...</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--line-soft)] p-5">
              <div className="rounded-[24px] border border-[rgba(0,191,165,0.24)] bg-[linear-gradient(135deg,rgba(0,191,165,0.12),rgba(28,35,51,0.96))] p-5">
                {basketLines.length > 0 && (
                  <div className="mb-5 rounded-[20px] border border-[var(--line-soft)] bg-[rgba(13,17,23,0.28)] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">РЎРєРёРґРєР° РЅР° С‡РµРє</p>
                      <button
                        type="button"
                        onClick={() => scheduleReceiptDiscount("percent", receiptDiscountMode === "percent" ? receiptDiscountValue : "")}
                        disabled={orderLocked}
                        className={`rounded-full px-3 py-1 text-xs transition-colors ${
                          receiptDiscountMode === "percent"
                            ? "bg-[var(--accent)] text-[#062b26]"
                            : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                        }`}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        onClick={() => scheduleReceiptDiscount("money", receiptDiscountMode === "money" ? receiptDiscountValue : "")}
                        disabled={orderLocked}
                        className={`rounded-full px-3 py-1 text-xs transition-colors ${
                          receiptDiscountMode === "money"
                            ? "bg-[var(--accent)] text-[#062b26]"
                            : "border border-[var(--line-soft)] text-[var(--text-muted)]"
                        }`}
                      >
                        в‚Ѕ
                      </button>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        type="number"
                        min="0"
                        step={receiptDiscountMode === "percent" ? "0.1" : "0.01"}
                        value={receiptDiscountValue}
                        onChange={(event) => scheduleReceiptDiscount(receiptDiscountMode, event.target.value)}
                        placeholder={receiptDiscountMode === "percent" ? "0%" : "0 в‚Ѕ"}
                        disabled={orderLocked}
                        className="w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50"
                      />
                      {receiptDiscountSaving && <span className="text-xs text-[var(--accent)]">РЎРѕС…СЂР°РЅСЏРµРј...</span>}
                    </div>
                  </div>
                )}

                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--text-muted)]">РС‚РѕРі</p>
                    {hasAnyDiscount && (
                      <p className="mt-2 text-sm text-[var(--text-muted)] line-through">
                        {formatMoney(basketGrossTotal)}
                      </p>
                    )}
                    <p className="mt-2 text-3xl font-semibold text-[var(--text-main)]">
                      {formatMoney(order?.total_amount ?? 0)}
                    </p>
                    {hasAnyDiscount && (
                      <p className="mt-2 text-xs text-[var(--accent)]">
                        РЎРєРёРґРєР°: в€’{formatMoney(basketLineDiscountTotal + orderLevelDiscount)}
                      </p>
                    )}
                  </div>
                  <p className="text-right text-xs text-[var(--text-muted)]">
                    {basketLines.reduce((sum, line) => sum + line.quantity, 0)} С€С‚.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={
                    confirming ||
                    orderLoading ||
                    basketLines.length === 0 ||
                    orderAwaitingPayment ||
                    sendBlockedByClient ||
                    clientSaving
                  }
                  className="mt-5 inline-flex w-full items-center justify-center rounded-[18px] bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-[#062b26] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirming ? "РћС‚РїСЂР°РІР»СЏРµРј..." : orderAwaitingPayment ? "РћС‚РїСЂР°РІР»РµРЅРѕ РЅР° РєР°СЃСЃСѓ" : "РћС‚РїСЂР°РІРёС‚СЊ РЅР° РєР°СЃСЃСѓ"}
                </button>

                {sendBlockedByClient && (
                  <p className="mt-3 text-sm text-[var(--warning)]">Р’С‹Р±РµСЂРёС‚Рµ РєР»РёРµРЅС‚Р° РґР»СЏ СѓСЃР»СѓРіРё</p>
                )}

                {orderAwaitingPayment && (
                  <>
                    <p className="mt-4 text-sm text-[var(--text-muted)]">
                      Р§РµРє СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅ РЅР° РєР°СЃСЃСѓ. РџСЂРѕРІРµСЂСЏР№С‚Рµ РѕРїР»Р°С‚Сѓ РІРѕ РІРєР»Р°РґРєРµ РСЃС‚РѕСЂРёСЏ РїСЂРѕРґР°Р¶.
                    </p>
                    <button
                      type="button"
                      onClick={handleStartNewOrder}
                      className="mt-3 inline-flex w-full items-center justify-center rounded-[18px] border border-[var(--line-soft)] px-4 py-3 text-sm font-medium text-[var(--text-main)] transition-colors hover:bg-[rgba(255,255,255,0.04)]"
                    >
                      РќРѕРІС‹Р№ С‡РµРє
                    </button>
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <section className="rounded-[28px] border border-[var(--line-soft)] bg-[var(--bg-card)] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-[family:var(--font-heading)] text-xl font-semibold text-[var(--text-main)]">РСЃС‚РѕСЂРёСЏ РїСЂРѕРґР°Р¶</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">РџРѕСЃР»РµРґРЅРёРµ С‡РµРєРё Рё РёС… С‚РµРєСѓС‰РёР№ СЃС‚Р°С‚СѓСЃ</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {historyFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setHistoryFilter(filter.value)}
                  className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                    historyFilter === filter.value
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--line-soft)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {historyError && (
            <div className="mt-4 rounded-2xl border border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] px-4 py-3 text-sm text-[var(--danger)]">
              {historyError}
            </div>
          )}

          <div className="mt-5 overflow-hidden rounded-[24px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)]">
              <div className="hidden grid-cols-[1.4fr_110px_140px_140px_170px_120px] gap-4 border-b border-[var(--line-soft)] px-5 py-4 text-[13px] font-medium uppercase tracking-[0.14em] text-slate-300 lg:grid">
                <span>Р”Р°С‚Р° Рё РІСЂРµРјСЏ</span>
                <span>РџРѕР·РёС†РёРё</span>
                <span>РЎСѓРјРјР°</span>
              <span>РћРїР»Р°С‚Р°</span>
              <span>РЎС‚Р°С‚СѓСЃ</span>
              <span className="text-right">Р”РµР№СЃС‚РІРёСЏ</span>
            </div>

            {historyLoading ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">Р—Р°РіСЂСѓР¶Р°РµРј РёСЃС‚РѕСЂРёСЋ...</div>
            ) : orders.length === 0 ? (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">Р—Р°РєР°Р·РѕРІ РїРѕРєР° РЅРµС‚</div>
            ) : (
              <div className="divide-y divide-[var(--line-soft)]">
                {orders.map((historyOrder, index) => {
                  const isExpanded = expandedOrderId === historyOrder.id;
                  const detail = orderDetails[historyOrder.id];
                  const detailLoading = detailLoadingId === historyOrder.id;
                  const cancelling = cancellingId === historyOrder.id;
                  const refunding = refundingId === historyOrder.id;
                  const syncingHistoryOrder = syncingOrderId === historyOrder.id;
                  const canCheckPayment =
                    historyOrder.status === "open" && historyOrder.items_count > 0 && historyOrder.aqsi_receipt_id;

                  return (
                    <div key={historyOrder.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => void handleToggleOrder(historyOrder.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void handleToggleOrder(historyOrder.id);
                          }
                        }}
                        className={`cursor-pointer px-5 py-4 transition-colors ${
                          index % 2 === 0 ? "bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)]" : "hover:bg-[rgba(255,255,255,0.04)]"
                        }`}
                      >
                        <div className="grid gap-3 lg:grid-cols-[1.4fr_110px_140px_140px_170px_120px] lg:items-center">
                          <div>
                            <p className="text-sm font-semibold text-[var(--text-main)]">{formatSalesDate(historyOrder.created_at)}</p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">#{historyOrder.id.slice(0, 8)}</p>
                          </div>
                          <div className="text-sm text-[var(--text-main)]">{historyOrder.items_count}</div>
                          <div className="text-sm font-medium text-[var(--text-main)]">{formatMoney(historyOrder.total_amount)}</div>
                          <div className="text-sm text-[var(--text-main)]">{getPaymentLabel(historyOrder.payment_type)}</div>
                          <div>
                            {canCheckPayment ? (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleSyncPayment(historyOrder.id);
                                }}
                                disabled={syncingHistoryOrder}
                                className={getHistoryActionButtonClass("accent")}
                              >
                                {syncingHistoryOrder ? "РџСЂРѕРІРµСЂСЏРµРј..." : "РџСЂРѕРІРµСЂРёС‚СЊ РѕРїР»Р°С‚Сѓ"}
                              </button>
                            ) : (
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${getStatusBadgeClass(historyOrder.status)}`}>
                                {getStatusLabel(historyOrder.status)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            {canCheckPayment && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleCancelOrder(historyOrder.id);
                                }}
                                disabled={cancelling}
                                className={getHistoryActionButtonClass("danger")}
                              >
                                {cancelling ? "РћС‚РјРµРЅСЏРµРј..." : "РћС‚РјРµРЅРёС‚СЊ"}
                              </button>
                            )}
                            {historyOrder.status === "confirmed" && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleRefundOrder(historyOrder.id, historyOrder.total_amount);
                                }}
                                disabled={refunding}
                                className={getHistoryActionButtonClass("warning")}
                              >
                                {refunding ? "Р’РѕР·РІСЂР°С‰Р°РµРј..." : "Р’РѕР·РІСЂР°С‚"}
                              </button>
                            )}
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-soft)] text-[var(--text-muted)]">
                              <ChevronIcon open={isExpanded} />
                            </span>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-[var(--line-soft)] bg-[rgba(13,17,23,0.34)] px-5 py-4">
                          {detailLoading ? (
                            <div className="py-6 text-sm text-[var(--text-muted)]">Р—Р°РіСЂСѓР¶Р°РµРј СЃРѕСЃС‚Р°РІ Р·Р°РєР°Р·Р°...</div>
                          ) : detail ? (
                            <div className="space-y-3">
                              {detail.items.map((item) => (
                                (() => {
                                  const summary = getItemNetTotal(item);

                                  return (
                                    <div
                                      key={item.id}
                                      className="grid gap-3 rounded-2xl border border-[var(--line-soft)] bg-[rgba(255,255,255,0.02)] px-4 py-3 lg:grid-cols-[1fr_100px_140px_140px]"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-[var(--text-main)]">{item.name}</p>
                                        {item.sku && <p className="mt-1 text-xs text-[var(--text-muted)]">{item.sku}</p>}
                                      </div>
                                      <div className="text-sm text-[var(--text-main)]">{item.quantity} С€С‚.</div>
                                      <div className="text-sm text-[var(--text-main)]">{formatMoney(item.sale_price)}</div>
                                      <div className="text-right text-sm font-medium text-[var(--text-main)]">
                                        {summary.discountTotal > 0 && (
                                          <p className="text-xs text-[var(--text-muted)] line-through">
                                            {formatMoney(summary.grossTotal)}
                                          </p>
                                        )}
                                        <p>{formatMoney(summary.total)}</p>
                                      </div>
                                    </div>
                                  );
                                })()
                              ))}
                            </div>
                          ) : (
                            <div className="py-6 text-sm text-[var(--text-muted)]">РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРѕСЃС‚Р°РІ Р·Р°РєР°Р·Р°</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <HistoryIcon />
            </span>
            <span>РљР»РёРє РїРѕ СЃС‚СЂРѕРєРµ РѕС‚РєСЂС‹РІР°РµС‚ СЃРѕСЃС‚Р°РІ Р·Р°РєР°Р·Р°</span>
          </div>
        </section>
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

