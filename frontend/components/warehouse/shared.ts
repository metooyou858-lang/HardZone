export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

export const labelCls = "text-xs font-medium uppercase tracking-wider text-slate-400";

export const REASONS = [
  { value: "damage", label: "Порча" },
  { value: "expired", label: "Истёк срок" },
  { value: "own_use", label: "Собственные нужды" },
  { value: "other", label: "Другое" },
];

export function isBarcodeQuery(value: string) {
  return /^\d{6,}$/.test(value.trim());
}

export function makeAutoSku(query: string) {
  const trimmed = query.trim();
  return isBarcodeQuery(trimmed) ? trimmed : `AUTO-${Date.now()}`;
}

export function formatMoney(value: string | number | null | undefined, suffix = " ₽") {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return `${Number.parseFloat(String(value)).toLocaleString("ru")}${suffix}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ru", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function stockColor(stock: number) {
  if (stock === 0) {
    return "text-red-500";
  }

  if (stock <= 5) {
    return "text-amber-500";
  }

  return "text-emerald-600";
}
