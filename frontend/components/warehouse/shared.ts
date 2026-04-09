export const inputCls =
  "w-full rounded-xl border border-[var(--line-soft)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[rgba(0,191,165,0.12)]";

export const labelCls = "text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]";

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
    return "text-[var(--danger)]";
  }

  if (stock <= 5) {
    return "text-[var(--warning)]";
  }

  return "text-[var(--success)]";
}
