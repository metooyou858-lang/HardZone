import { apiFetch } from "./client";

type ApiEnvelope<T> = { success: boolean; data: T; error?: string };

export type DashboardSlot = {
  id: string;
  slot_type: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  status: string;
  training_type_id: string | null;
  training_type_name: string | null;
  trainer_id: string | null;
  trainer_name: string | null;
  occupied_count: number;
  is_in_progress: boolean;
};

export type DashboardUnpaidVisit = {
  id: string;
  visit_type: string;
  client_id: string;
  client_name: string;
  visit_date: string;
  visit_time: string;
  title: string;
};

export type DashboardExpiringSubscription = {
  id: string;
  client_id: string;
  client_name: string;
  type: string;
  visits_total: number | null;
  visits_left: number | null;
  expires_at: string;
  product_name: string | null;
};

export type DashboardLowStockItem = {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  shortage: number;
};

export type DashboardData = {
  generated_at: string;
  schedule: null | {
    date: string;
    total_slots: number;
    completed_slots: number;
    total_bookings: number;
    slots: DashboardSlot[];
  };
  attention: {
    unpaid_visits: DashboardUnpaidVisit[];
    expiring_subscriptions: DashboardExpiringSubscription[];
    low_stock: DashboardLowStockItem[];
  };
};

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await apiFetch<ApiEnvelope<DashboardData>>("/dashboard");
  return response.data;
}
