import { formatMoney } from "@/components/warehouse/shared";
import type { Category } from "@/lib/api/categories";
import type { ClientListItem } from "@/lib/api/clients";
import type { Order, OrderItem, OrderItemKind, OrderStatus } from "@/lib/api/orders";
import type { Product } from "@/lib/api/products";
export type BannerTone = "info" | "success" | "error";
export type SalesTab = "cash" | "history";
export type HistoryFilter = "all" | OrderStatus;
export type DiscountMode = "percent" | "money";
export type CatalogGroup = {
  id: string;
  label: string;
  count: number;
  kind: "category" | "services";
};

export type BannerState = {
  tone: BannerTone;
  text: string;
} | null;

export type BasketLine = {
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

export { formatMoney };

export const searchInputCls =
  "w-full rounded-[18px] border border-[var(--line-soft)] bg-[var(--bg-card-soft)] px-4 py-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(0,191,165,0.12)]";
export const SERVICES_GROUP_ID = "__services__";

export const historyFilters: { value: HistoryFilter; label: string }[] = [
  { value: "all", label: "Р’СЃРµ" },
  { value: "open", label: "РћР¶РёРґР°РµС‚" },
  { value: "confirmed", label: "РћРїР»Р°С‡РµРЅ" },
  { value: "refunded", label: "Р’РѕР·РІСЂР°С‚" },
  { value: "cancelled", label: "РћС‚РјРµРЅС‘РЅ" },
];

export function SearchIcon() {
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

export function ScanIcon() {
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

export function MinusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M4.167 10h11.666" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M10 4.167v11.666M4.167 10h11.666" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
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

export function ReceiptIcon() {
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

export function HistoryIcon() {
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

export function ChevronIcon({ open }: { open: boolean }) {
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

export function resolveOrderItemKind(product: Product): OrderItemKind {
  if (product.has_stock) {
    return "product";
  }

  const typeName = (product.product_type_name ?? "").toLowerCase();
  if (typeName.includes("Р°Р±РѕРЅ")) {
    return "subscription";
  }

  return "service";
}

export function getTypeLabel(product: Product) {
  if (product.product_type_name) {
    return product.product_type_name;
  }

  return product.has_stock ? "РўРѕРІР°СЂ" : "РЈСЃР»СѓРіР°";
}

export function getCatalogAccentMeta(product: Product) {
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

export function isSellableInCash(product: Product) {
  return !product.has_stock || product.stock > 0;
}

export function buildCatalogGroups(categories: Category[], serviceCount: number): CatalogGroup[] {
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

export function getBannerClass(tone: BannerTone) {
  if (tone === "success") {
    return "border-[rgba(63,185,80,0.35)] bg-[rgba(63,185,80,0.12)] text-[var(--success)]";
  }

  if (tone === "error") {
    return "border-[rgba(248,81,73,0.35)] bg-[rgba(248,81,73,0.12)] text-[var(--danger)]";
  }

  return "border-[rgba(0,191,165,0.28)] bg-[rgba(0,191,165,0.1)] text-[var(--accent)]";
}

export function getStatusLabel(status: OrderStatus) {
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

export function getStatusBadgeClass(status: OrderStatus) {
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

export function getPaymentLabel(paymentType: Order["payment_type"]) {
  if (paymentType === "cash") {
    return "РќР°Р»РёС‡РЅС‹Рµ";
  }

  if (paymentType === "card") {
    return "РљР°СЂС‚Р°";
  }

  return "вЂ”";
}

export function getHistoryActionButtonClass(tone: "accent" | "danger" | "warning") {
  if (tone === "danger") {
    return "rounded-full border border-[rgba(248,81,73,0.24)] bg-[rgba(248,81,73,0.12)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition-colors hover:bg-[rgba(248,81,73,0.18)] disabled:opacity-50";
  }

  if (tone === "warning") {
    return "rounded-full border border-[rgba(210,153,34,0.24)] bg-[rgba(210,153,34,0.12)] px-3 py-1.5 text-xs font-medium text-[var(--warning)] transition-colors hover:bg-[rgba(210,153,34,0.18)] disabled:opacity-50";
  }

  return "rounded-full border border-[rgba(0,191,165,0.24)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:brightness-110 disabled:opacity-50";
}

export function getClientName(client: Pick<ClientListItem, "first_name" | "last_name" | "middle_name">) {
  return [client.last_name, client.first_name, client.middle_name].filter(Boolean).join(" ");
}

export function getSubscriptionTypeLabel(type: ClientListItem["subscription_type"]) {
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

export function getClientSubscriptionLabel(client: ClientListItem) {
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

export function shouldDisplayInHistory(order: Order, filter: HistoryFilter) {
  if (filter !== "all" && order.status !== filter) {
    return false;
  }

  if (order.status === "open") {
    return Boolean(order.aqsi_receipt_id);
  }

  return true;
}

export function formatSalesDate(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function asAmount(value: string | number | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveDiscountMoney(
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

export function detectDiscountMode(
  discountPercent: string | number | null | undefined,
  discountMoney: string | number | null | undefined
): DiscountMode {
  return asAmount(discountMoney) > 0 ? "money" : "percent";
}

export function formatDiscountValue(
  mode: DiscountMode,
  discountPercent: string | number | null | undefined,
  discountMoney: string | number | null | undefined
) {
  const value = mode === "money" ? asAmount(discountMoney) : asAmount(discountPercent);
  return value > 0 ? String(value) : "";
}

export function parseDiscountInput(value: string) {
  if (!value.trim()) {
    return 0;
  }

  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function getItemNetTotal(item: OrderItem) {
  const grossTotal = asAmount(item.total);
  const discountTotal = resolveDiscountMoney(grossTotal, item.discount_percent, item.discount_money);

  return {
    grossTotal,
    discountTotal,
    total: Math.max(0, grossTotal - discountTotal),
  };
}

export function groupOrderItems(items: OrderItem[]) {
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

