import { NextResponse } from "next/server";

import { getBackendApiBase } from "@/lib/server/backend";
import type { ClientMiniAppPayload } from "@/lib/api/client-miniapp";

type BackendTelegramClientCancelBookingResponse = {
  success?: boolean;
  data?: ClientMiniAppPayload;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { init_data?: string; booking_id?: string | number };
    const initData = body.init_data || "";

    if (!initData) {
      return NextResponse.json({ error: "Telegram авторизация не передана" }, { status: 422 });
    }

    if (!body.booking_id) {
      return NextResponse.json({ error: "Укажите запись" }, { status: 422 });
    }

    const backendResponse = await fetch(`${getBackendApiBase()}/telegram/client-miniapp-cancel-booking`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ init_data: initData, booking_id: body.booking_id }),
      cache: "no-store",
    });

    const data = (await backendResponse.json()) as BackendTelegramClientCancelBookingResponse;
    if (!backendResponse.ok || !data.data?.client) {
      return NextResponse.json(
        { error: data.error || "Не удалось отменить запись" },
        { status: backendResponse.status || 500 }
      );
    }

    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось отменить запись" }, { status: 500 });
  }
}
