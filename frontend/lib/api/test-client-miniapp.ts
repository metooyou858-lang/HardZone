import type { ClientMiniAppPayload } from "@/lib/api/client-miniapp";

type ApiEnvelope = {
  data?: ClientMiniAppPayload;
  error?: string;
};

async function postTestClient(action: string, body: Record<string, unknown>) {
  const response = await fetch(`/auth-api/telegram-test-client/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as ApiEnvelope | null;
  if (!response.ok || !data?.data) {
    throw new Error(data?.error || "Не удалось выполнить действие");
  }

  return data.data;
}

export function loginTestClientMiniApp(initData: string) {
  return postTestClient("login", { init_data: initData });
}

export function bookTestClientMiniAppSlot(initData: string, slotId: string | number) {
  return postTestClient("book", { init_data: initData, slot_id: slotId });
}

export function cancelTestClientMiniAppBooking(initData: string, bookingId: string | number) {
  return postTestClient("cancel-booking", { init_data: initData, booking_id: bookingId });
}

export function reviewTestClientMiniAppTrainer(
  initData: string,
  trainerId: string | number,
  rating: number,
  comment: string
) {
  return postTestClient("trainer-review", {
    init_data: initData,
    trainer_id: trainerId,
    rating,
    comment,
  });
}
