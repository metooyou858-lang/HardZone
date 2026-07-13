import { apiFetch } from "./client";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type CoverageStatus = "pending" | "covered" | "unpaid" | "comped" | "not_required";

export type StaffSlot = {
  id: string;
  slot_type: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  booked_count: number;
  status: string;
  is_free?: boolean;
  comment?: string | null;
  training_type_name: string | null;
  training_type_color?: string | null;
  trainer_id?: string | null;
  trainer_name: string | null;
  confirmed_count: number | string;
  attended_count: number | string;
};

export type StaffBooking = {
  id: string;
  status: "confirmed" | "attended";
  places_count: number;
  subscription_id: string | null;
  coverage_status: CoverageStatus;
  coverage_reason: string | null;
  coverage_note: string | null;
  created_at: string;
  client_id: string;
  client_name: string;
  client_phone: string | null;
  client_barcode: string | null;
  subscription_type: string | null;
  subscription_status: string | null;
  visits_left: number | null;
  expires_at: string | null;
};

export type StaffSlotBookings = {
  slot: StaffSlot;
  bookings: StaffBooking[];
};

export type StaffClientSearchResult = {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  barcode: string | null;
  status: string | null;
  subscription_id: string | null;
  subscription_type: string | null;
  subscription_status: string | null;
  visits_left: number | null;
  expires_at: string | null;
  is_eligible?: boolean;
};

export type StaffMe = {
  user: {
    id: number;
    name: string;
    username: string;
    role: string;
    role_title?: string | null;
    modules?: string[];
  };
  trainer_profile: {
    id: string | number;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    is_active: boolean;
  } | null;
};

export async function fetchStaffMe(): Promise<StaffMe> {
  const response = await apiFetch<ApiEnvelope<StaffMe>>("/staff/me");
  return response.data;
}

export async function fetchStaffToday(date?: string): Promise<{ date: string; slots: StaffSlot[] }> {
  const query = new URLSearchParams();
  if (date) query.set("date", date);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await apiFetch<ApiEnvelope<{ date: string; slots: StaffSlot[] }>>(`/staff/schedule/today${suffix}`);
  return response.data;
}

export async function fetchStaffBookings(slotId: string | number): Promise<StaffSlotBookings> {
  const response = await apiFetch<ApiEnvelope<StaffSlotBookings>>(`/staff/bookings?slot_id=${slotId}`);
  return response.data;
}

export async function attendStaffBooking(
  bookingId: string | number,
  options?: { attendanceMode?: "auto" | "unpaid" | "comped"; coverageNote?: string | null }
): Promise<StaffSlotBookings> {
  const response = await apiFetch<ApiEnvelope<StaffSlotBookings>>(`/staff/bookings/${bookingId}/attend`, {
    method: "POST",
    body: JSON.stringify({
      attendance_mode: options?.attendanceMode,
      coverage_note: options?.coverageNote ?? null,
    }),
  });
  return response.data;
}

export async function unattendStaffBooking(bookingId: string | number): Promise<StaffSlotBookings> {
  const response = await apiFetch<ApiEnvelope<StaffSlotBookings>>(`/staff/bookings/${bookingId}/unattend`, {
    method: "POST",
  });
  return response.data;
}

export async function cancelStaffBooking(bookingId: string | number): Promise<StaffSlotBookings> {
  const response = await apiFetch<ApiEnvelope<StaffSlotBookings>>(`/staff/bookings/${bookingId}/cancel`, {
    method: "POST",
  });
  return response.data;
}

export async function searchStaffClients(query: string, slotId?: string | number): Promise<StaffClientSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: "12" });
  if (slotId) params.set("slot_id", String(slotId));
  const response = await apiFetch<ApiEnvelope<StaffClientSearchResult[]>>(`/staff/client-search?${params.toString()}`);
  return response.data;
}

export async function createStaffBooking(data: {
  slot_id: string | number;
  client_id: string | number;
  subscription_id?: string | number | null;
  allow_unpaid?: boolean;
  unpaid_reason?: string;
}): Promise<StaffSlotBookings> {
  const response = await apiFetch<ApiEnvelope<StaffSlotBookings>>("/staff/bookings", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.data;
}
