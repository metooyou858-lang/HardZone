export type ClientMiniAppClient = {
  id: number;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
  email: string | null;
  barcode: string | null;
  status: string;
};

export type ClientMiniAppSubscription = {
  id: string;
  type: "single" | "visits" | "period" | "unlimited";
  status: "active" | "frozen" | "expired" | "exhausted";
  visits_total: number | null;
  visits_left: number | null;
  started_at: string | null;
  expires_at: string | null;
  is_family: boolean;
  product_name: string | null;
};

export type ClientMiniAppBooking = {
  id: string;
  status: "confirmed" | "cancelled" | "attended" | "missed";
  date: string;
  start_time: string;
  duration_minutes: number;
  training_type_name: string | null;
  trainer_name: string | null;
};

export type ClientMiniAppAvailableSlot = {
  id: string;
  date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  slot_type: "group" | "personal" | "rental";
  is_free: boolean;
  block_if_empty_hours: number | null;
  training_type_name: string | null;
  training_type_color: string | null;
  training_type_description: string | null;
  training_type_audience: string | null;
  training_type_location: string | null;
  training_type_booking_note: string | null;
  training_type_tags: string[];
  trainer_id: string | null;
  trainer_name: string | null;
  trainer_photo_url: string | null;
  trainer_rating: number | null;
  trainer_reviews_count: number;
  booked_count: number;
  free_places: number;
  is_booked: boolean;
  client_booking_id: string | null;
};

export type ClientMiniAppVisit = {
  id: string;
  visit_type: "group" | "open_gym";
  visited_at: string;
  date: string | null;
  start_time: string | null;
  training_type_name: string | null;
};

export type ClientMiniAppTrainer = {
  id: string;
  first_name: string;
  last_name: string;
  position: string | null;
  bio: string | null;
  photo_url: string | null;
  rating: number | null;
  reviews_count: number;
  my_review: {
    rating: number;
    comment: string | null;
    updated_at: string;
  } | null;
  specialties: string[];
  training_types: Array<{
    id: string;
    name: string;
    slot_type: "group" | "personal" | "rental";
    color: string | null;
    description: string | null;
  }>;
};

export type ClientMiniAppPayload = {
  client: ClientMiniAppClient;
  subscriptions: ClientMiniAppSubscription[];
  bookings: ClientMiniAppBooking[];
  visits: ClientMiniAppVisit[];
  available_slots: ClientMiniAppAvailableSlot[];
  trainers: ClientMiniAppTrainer[];
  debt: {
    unpaid_missed_count: number;
  };
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string;
};

export async function loginClientMiniApp(initData: string): Promise<ClientMiniAppPayload> {
  const response = await fetch("/auth-api/telegram-client-miniapp-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ init_data: initData }),
  });

  const data = (await response.json().catch(() => null)) as ApiEnvelope<ClientMiniAppPayload> | null;
  if (!response.ok || !data?.data) {
    throw new Error(data?.error || "Не удалось войти через Telegram");
  }

  return data.data;
}

export async function linkClientMiniAppPhone(initData: string, phone: string): Promise<ClientMiniAppPayload> {
  const response = await fetch("/auth-api/telegram-client-miniapp-link-phone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ init_data: initData, phone }),
  });

  const data = (await response.json().catch(() => null)) as ApiEnvelope<ClientMiniAppPayload> | null;
  if (!response.ok || !data?.data) {
    throw new Error(data?.error || "Не удалось привязать Telegram по телефону");
  }

  return data.data;
}

export async function bookClientMiniAppSlot(initData: string, slotId: string | number): Promise<ClientMiniAppPayload> {
  const response = await fetch("/auth-api/telegram-client-miniapp-book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ init_data: initData, slot_id: slotId }),
  });

  const data = (await response.json().catch(() => null)) as ApiEnvelope<ClientMiniAppPayload> | null;
  if (!response.ok || !data?.data) {
    throw new Error(data?.error || "Не удалось записаться");
  }

  return data.data;
}

export async function cancelClientMiniAppBooking(
  initData: string,
  bookingId: string | number
): Promise<ClientMiniAppPayload> {
  const response = await fetch("/auth-api/telegram-client-miniapp-cancel-booking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ init_data: initData, booking_id: bookingId }),
  });

  const data = (await response.json().catch(() => null)) as ApiEnvelope<ClientMiniAppPayload> | null;
  if (!response.ok || !data?.data) {
    throw new Error(data?.error || "Не удалось отменить запись");
  }

  return data.data;
}

export async function reviewClientMiniAppTrainer(
  initData: string,
  trainerId: string | number,
  rating: number,
  comment: string
): Promise<ClientMiniAppPayload> {
  const response = await fetch("/auth-api/telegram-client-miniapp-trainer-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ init_data: initData, trainer_id: trainerId, rating, comment }),
  });

  const data = (await response.json().catch(() => null)) as ApiEnvelope<ClientMiniAppPayload> | null;
  if (!response.ok || !data?.data) {
    throw new Error(data?.error || "Не удалось сохранить отзыв");
  }

  return data.data;
}
