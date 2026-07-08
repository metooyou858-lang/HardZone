import { apiFetch } from "./client";

export type AnalyticsKind = "product" | "service" | "subscription";

export type AnalyticsSummary = {
  revenue: number;
  order_revenue: number;
  legacy_revenue: number;
  product_revenue: number;
  service_revenue: number;
  cost_of_sold_goods: number;
  purchase_expenses: number;
  writeoff_expenses: number;
  external_expenses: number;
  gross_profit: number;
  cash_profit: number;
  checks_count: number;
  product_items_sold: number;
  visits_count: number;
  open_gym_visits: number;
  group_visits: number;
};

export type AnalyticsCheckItem = {
  id: string;
  kind: AnalyticsKind;
  name: string;
  sku: string | null;
  quantity: number;
  refunded_quantity: number;
  active_quantity: number;
  sale_price: number;
  revenue: number;
  cost: number;
  profit: number;
};

export type AnalyticsCheck = {
  id: string;
  status: "confirmed" | "partially_refunded" | "refunded";
  payment_type: "cash" | "card" | null;
  client_id: string | number | null;
  client_name: string | null;
  aqsi_receipt_id: string | null;
  created_at: string;
  confirmed_at: string | null;
  items_count: number;
  revenue: number;
  cost: number;
  profit: number;
  items: AnalyticsCheckItem[];
};

export type AnalyticsSaleLine = AnalyticsCheckItem & {
  order_id: string | null;
  payment_type: "cash" | "card" | null;
  client_name: string | null;
  sold_at: string;
};

export type AnalyticsPurchase = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  quantity: number;
  cost_price_at_receipt: number | null;
  total_cost: number;
  method: string;
  comment: string | null;
  created_at: string;
};

export type AnalyticsWriteoff = {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  quantity: number;
  reason_type: string;
  reason: string | null;
  cost_price: number;
  total_cost: number;
  created_at: string;
};

export type AnalyticsExternalExpense = {
  id: number;
  title: string;
  amount: number;
  expense_date: string;
  comment: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type AnalyticsVisit = {
  id: number;
  client_id: number;
  subscription_id: number | null;
  visit_type: "group" | "open_gym";
  visited_at: string;
  created_by: string | null;
  client_name: string;
};

export type AnalyticsReport = {
  range: { from: string; to: string };
  summary: AnalyticsSummary;
  checks: AnalyticsCheck[];
  product_sales: AnalyticsSaleLine[];
  service_sales: AnalyticsSaleLine[];
  purchases: AnalyticsPurchase[];
  writeoffs: AnalyticsWriteoff[];
  external_expenses: AnalyticsExternalExpense[];
  visits: AnalyticsVisit[];
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export async function fetchAnalyticsReport(params: { from?: string; to?: string } = {}) {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);

  const response = await apiFetch<ApiEnvelope<AnalyticsReport>>(
    `/analytics${search.size ? `?${search.toString()}` : ""}`
  );

  return response.data;
}

export async function createAnalyticsExpense(data: {
  title: string;
  amount: number;
  expense_date: string;
  comment?: string | null;
}) {
  const response = await apiFetch<ApiEnvelope<AnalyticsExternalExpense>>("/analytics/expenses", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function deleteAnalyticsExpense(id: number) {
  const response = await apiFetch<ApiEnvelope<{ id: number }>>(`/analytics/expenses/${id}`, {
    method: "DELETE",
  });

  return response.data;
}
