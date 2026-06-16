import { apiFetch } from "./client";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type SlotType = "group" | "personal" | "rental";
export type SlotStatus = "active" | "cancelled" | "completed";
export type BookingStatus = "confirmed" | "cancelled" | "attended" | "missed";
export type CoverageStatus = "pending" | "covered" | "unpaid" | "comped" | "not_required";
export type GymHour = {
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
  updated_at: string | null;
};

export type OpenGymVisit = {
  id: string;
  client_id: string;
  subscription_id: string | null;
  coverage_status: CoverageStatus;
  coverage_reason: string | null;
  coverage_note: string | null;
  visit_type: "open_gym";
  visited_at: string;
  schedule_id: string | null;
  slot_id?: string | null;
  created_by: string | null;
  client_name: string;
  client_phone: string | null;
  client_barcode: string | null;
};

export type GymOverview = {
  hours: GymHour[];
  today: {
    day_of_week: number;
    is_open: boolean;
    open_time: string | null;
    close_time: string | null;
    updated_at: string | null;
    current_date: string;
    current_time: string;
    is_open_now: boolean;
  };
  visits: OpenGymVisit[];
  total_today: number;
};

export type ScheduleSlot = {
  id: string;
  template_id: string | null;
  slot_type: SlotType;
  training_type_id: string | null;
  trainer_id: string | null;
  product_id: string | null;
  date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  booked_count: number;
  status: SlotStatus;
  is_free: boolean;
  block_if_empty_hours: number | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
  training_type_name: string | null;
  training_type_color: string | null;
  trainer_name: string | null;
  product_name: string | null;
  confirmed_count?: number | string;
};

export type ScheduleBooking = {
  id: string;
  slot_id: string;
  client_id: string;
  subscription_id: string | null;
  covered_by_booking_id: string | null;
  coverage_status: CoverageStatus;
  coverage_reason: string | null;
  coverage_note: string | null;
  places_count: number;
  status: BookingStatus;
  booked_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string;
  client_phone?: string | null;
  client_barcode?: string | null;
};

export type ScheduleSlotDetail = ScheduleSlot & {
  bookings: ScheduleBooking[];
};

export type ScheduleTemplate = {
  id: string;
  slot_type: SlotType;
  training_type_id: string | null;
  trainer_id: string | null;
  product_id: string | null;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  block_if_empty_hours: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  training_type_name: string | null;
  training_type_color: string | null;
  trainer_name: string | null;
};

export async function fetchScheduleSlots(params: {
  date_from?: string;
  date_to?: string;
  trainer_id?: string | null;
  slot_type?: SlotType | "";
}): Promise<ScheduleSlot[]> {
  const query = new URLSearchParams();

  if (params.date_from) {
    query.set("date_from", params.date_from);
  }

  if (params.date_to) {
    query.set("date_to", params.date_to);
  }

  if (params.trainer_id) {
    query.set("trainer_id", params.trainer_id);
  }

  if (params.slot_type) {
    query.set("slot_type", params.slot_type);
  }

  const response = await apiFetch<ApiEnvelope<ScheduleSlot[]>>(`/schedule/slots?${query.toString()}`);
  return response.data;
}

export async function fetchScheduleSlot(id: string): Promise<ScheduleSlotDetail> {
  const response = await apiFetch<ApiEnvelope<ScheduleSlotDetail>>(`/schedule/slots/${id}`);
  return response.data;
}

export async function createScheduleSlot(data: {
  slot_type?: SlotType;
  training_type_id?: number | null;
  trainer_id?: number | null;
  product_id?: number | null;
  date: string;
  start_time: string;
  duration_minutes?: number;
  capacity?: number;
  is_free?: boolean;
  block_if_empty_hours?: number | null;
  comment?: string | null;
}): Promise<ScheduleSlot> {
  const response = await apiFetch<ApiEnvelope<ScheduleSlot>>("/schedule/slots", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function updateScheduleSlot(
  id: string,
  data: Partial<{
    slot_type: SlotType;
    training_type_id: number | null;
    trainer_id: number | null;
    product_id: number | null;
    date: string;
    start_time: string;
    duration_minutes: number;
    capacity: number;
    is_free: boolean;
    block_if_empty_hours: number | null;
    comment: string | null;
    status: SlotStatus;
  }>
): Promise<ScheduleSlot> {
  const response = await apiFetch<ApiEnvelope<ScheduleSlot>>(`/schedule/slots/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function cancelScheduleSlot(id: string): Promise<ScheduleSlot> {
  const response = await apiFetch<ApiEnvelope<ScheduleSlot>>(`/schedule/slots/${id}/cancel`, {
    method: "POST",
  });

  return response.data;
}

export async function fetchScheduleTemplates(): Promise<ScheduleTemplate[]> {
  const response = await apiFetch<ApiEnvelope<ScheduleTemplate[]>>("/schedule/templates");
  return response.data;
}

export async function fetchGymOverview(): Promise<GymOverview> {
  const response = await apiFetch<ApiEnvelope<GymOverview>>("/schedule/gym-hours");
  return response.data;
}

export async function saveGymHours(days: GymHour[]): Promise<GymOverview> {
  const response = await apiFetch<ApiEnvelope<GymOverview>>("/schedule/gym-hours", {
    method: "PUT",
    body: JSON.stringify({
      days: days.map((day) => ({
        day_of_week: day.day_of_week,
        is_open: day.is_open,
        open_time: day.is_open ? day.open_time : null,
        close_time: day.is_open ? day.close_time : null,
      })),
    }),
  });

  return response.data;
}

export async function checkInOpenGym(data: {
  client_id?: string | number;
  barcode?: string;
  subscription_id?: string | number | null;
  attendance_mode?: "auto" | "unpaid" | "comped";
  coverage_note?: string | null;
  created_by?: string;
}): Promise<{
  visit: OpenGymVisit;
  visits: OpenGymVisit[];
  total_today: number;
  today: GymOverview["today"];
  within_hours: boolean;
}> {
  const response = await apiFetch<
    ApiEnvelope<{
      visit: OpenGymVisit;
      visits: OpenGymVisit[];
      total_today: number;
      today: GymOverview["today"];
      within_hours: boolean;
    }>
  >("/schedule/open-gym/check-in", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function deleteGymVisit(visitId: string): Promise<{
  visits: OpenGymVisit[];
  total_today: number;
  today: GymOverview["today"];
}> {
  const response = await apiFetch<
    ApiEnvelope<{
      visits: OpenGymVisit[];
      total_today: number;
      today: GymOverview["today"];
    }>
  >(`/schedule/open-gym/visits/${visitId}`, { method: "DELETE" });
  return response.data;
}

export async function createScheduleTemplate(data: {
  slot_type?: SlotType;
  training_type_id?: number | null;
  trainer_id?: number | null;
  product_id?: number | null;
  day_of_week: number;
  start_time: string;
  duration_minutes?: number;
  capacity?: number;
  block_if_empty_hours?: number | null;
}): Promise<ScheduleTemplate> {
  const response = await apiFetch<ApiEnvelope<ScheduleTemplate>>("/schedule/templates", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function generateScheduleTemplates(data: {
  date_from: string;
  date_to: string;
}): Promise<{ created: number }> {
  const response = await apiFetch<ApiEnvelope<{ created: number }>>("/schedule/templates/generate", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function createBooking(data: {
  slot_id: string | number;
  client_id: string | number;
  subscription_id?: string | number | null;
  allow_unpaid?: boolean;
  unpaid_reason?: string;
  booked_by?: string;
  covered_by_booking_id?: string | null;
}): Promise<ScheduleBooking> {
  const response = await apiFetch<ApiEnvelope<ScheduleBooking>>("/bookings", {
    method: "POST",
    body: JSON.stringify(data),
  });

  return response.data;
}

export async function cancelBooking(id: string | number, cancel_reason?: string | null): Promise<void> {
  await apiFetch<ApiEnvelope<unknown>>(`/bookings/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ cancel_reason: cancel_reason ?? null }),
  });
}

export async function attachEligibleSubscriptionToBooking(id: string | number): Promise<{
  attached: boolean;
  booking: ScheduleBooking;
  subscription: unknown | null;
}> {
  const response = await apiFetch<ApiEnvelope<{
    attached: boolean;
    booking: ScheduleBooking;
    subscription: unknown | null;
  }>>(`/bookings/${id}/attach-eligible-subscription`, {
    method: "POST",
  });

  return response.data;
}

export async function attendBooking(
  id: string | number,
  options?: { skipSubscription?: boolean; attendanceMode?: "auto" | "unpaid" | "comped"; coverageNote?: string | null }
): Promise<void> {
  await apiFetch<ApiEnvelope<unknown>>(`/bookings/${id}/attend`, {
    method: "POST",
    body: JSON.stringify({
      skip_subscription: options?.skipSubscription ?? false,
      attendance_mode: options?.attendanceMode,
      coverage_note: options?.coverageNote ?? null,
    }),
  });
}

export async function unattendBooking(id: string | number): Promise<void> {
  await apiFetch<ApiEnvelope<unknown>>(`/bookings/${id}/unattend`, {
    method: "POST",
  });
}

export async function attendBookingByBarcode(data: {
  barcode: string;
  slot_id: string | number;
}): Promise<void> {
  await apiFetch<ApiEnvelope<unknown>>("/bookings/attend-by-barcode", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
