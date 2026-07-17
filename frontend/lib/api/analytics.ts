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
  payroll_expenses: number;
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

export type PayrollRuleItem = {
  id: number;
  training_type_id: number | null;
  training_type_name: string | null;
  product_id: number | null;
  product_name: string | null;
};

export type PayrollTier = { from: number; to: number | null; amount: number };

export type PayrollRule = {
  id: number;
  name: string;
  all_trainers: boolean;
  all_activities: boolean;
  calculation_type: "fixed" | "per_attendee" | "tiered" | "percentage";
  per_attendee_amount: number;
  percentage_rate: number;
  tiers: PayrollTier[];
  is_active: boolean;
  base_amount: number;
  bonus_threshold: number | null;
  bonus_per_person: number | null;
  effective_from: string;
  comment: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  items: PayrollRuleItem[];
  trainers: Array<{ trainer_id: number; trainer_name: string }>;
};
export type PayrollLine = {
  slot_id: number;
  date: string;
  start_time: string;
  slot_type: "group" | "personal" | "rental";
  training_type_id: number | null;
  training_type_name: string;
  product_id: number | null;
  product_name: string | null;
  trainer_id: number;
  trainer_name: string;
  attended_count: number;
  confirmed_count: number;
  base_amount: number;
  bonus_threshold: number | null;
  bonus_per_person: number;
  bonus_people: number;
  bonus_amount: number;
  gross_amount?: number;
  gym_amount?: number;
  total_amount: number;
  rule_id: number | null;
  warnings: string[];
};

export type PayrollTrainerSummary = {
  trainer_id: number;
  trainer_name: string;
  slots_count: number;
  attended_count: number;
  base_amount: number;
  bonus_amount: number;
  gross_amount?: number;
  gym_amount?: number;
  total_amount: number;
  warnings_count: number;
  lines: PayrollLine[];
};

export type PayrollRunEmployee = {
  id: number;
  trainer_id: number | null;
  trainer_name: string;
  slots_count: number;
  attended_count: number;
  base_amount: number;
  bonus_amount: number;
  gross_amount?: number;
  gym_amount?: number;
  total_amount: number;
  payment_status: "pending" | "paid";
  paid_date: string | null;
  paid_at: string | null;
  calculation_snapshot: PayrollTrainerSummary;
};

export type PayrollRun = {
  id: number;
  date_from: string;
  date_to: string;
  status: "draft" | "approved";
  total_amount: number;
  employees_count: number;
  paid_count: number;
  created_at: string;
  approved_at: string | null;
  employees: PayrollRunEmployee[];
};
export type PayrollReport = {
  range: { from: string; to: string };
  summary: {
    trainers_count: number;
    slots_count: number;
    attended_count: number;
    base_amount: number;
    bonus_amount: number;
  gross_amount?: number;
  gym_amount?: number;
    total_amount: number;
    warnings_count: number;
  };
  trainers: PayrollTrainerSummary[];
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
  payroll_expenses: Array<{ id: number; run_id: number; trainer_id: number | null; trainer_name: string; amount: number; expense_date: string; date_from: string; date_to: string }>;
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

export async function fetchPayrollRules() {
  const response = await apiFetch<ApiEnvelope<PayrollRule[]>>("/analytics/payroll/rules");
  return response.data;
}

export async function createPayrollRule(data: {
  name: string;
  trainer_ids: number[];
  all_trainers: boolean;
  training_type_ids: number[];
  product_ids: number[];
  all_activities: boolean;
  calculation_type: "fixed" | "per_attendee" | "tiered" | "percentage";
  base_amount: number;
  per_attendee_amount: number;
  percentage_rate: number;
  bonus_threshold?: number | null;
  bonus_per_person?: number | null;
  tiers: Array<{ from: number; to: number | null; amount: number }>;
  effective_from: string;
  comment?: string | null;
}) {
  const response = await apiFetch<ApiEnvelope<{ id: number }>>("/analytics/payroll/rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.data;
}
export async function updatePayrollRule(id: number, data: Parameters<typeof createPayrollRule>[0]) {
  const response = await apiFetch<ApiEnvelope<{ id: number }>>(`/analytics/payroll/rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return response.data;
}
export async function deletePayrollRule(id: number) {
  const response = await apiFetch<ApiEnvelope<{ id: number }>>(`/analytics/payroll/rules/${id}`, {
    method: "DELETE",
  });

  return response.data;
}

export async function fetchPayrollRuns() {
  const response = await apiFetch<ApiEnvelope<PayrollRun[]>>("/analytics/payroll/runs");
  return response.data;
}

export async function createPayrollRun(data: { from: string; to: string }) {
  const response = await apiFetch<ApiEnvelope<{ id: number }>>("/analytics/payroll/runs", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.data;
}

export async function approvePayrollRun(id: number) {
  const response = await apiFetch<ApiEnvelope<{ id: number }>>("/analytics/payroll/runs/" + id + "/approve", {
    method: "POST",
  });
  return response.data;
}

export async function deletePayrollRun(id: number) {
  const response = await apiFetch<ApiEnvelope<{ id: number }>>("/analytics/payroll/runs/" + id, {
    method: "DELETE",
  });
  return response.data;
}

export async function payPayrollRunEmployee(runId: number, employeeId: number, paidDate: string) {
  const response = await apiFetch<ApiEnvelope<{ id: number }>>("/analytics/payroll/runs/" + runId + "/employees/" + employeeId + "/pay", {
    method: "POST",
    body: JSON.stringify({ paid_date: paidDate }),
  });
  return response.data;
}
export async function fetchPayrollReport(params: { from: string; to: string }) {
  const search = new URLSearchParams();
  search.set("from", params.from);
  search.set("to", params.to);

  const response = await apiFetch<ApiEnvelope<PayrollReport>>(`/analytics/payroll?${search.toString()}`);
  return response.data;
}
