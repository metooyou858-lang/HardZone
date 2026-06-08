import { NextResponse } from "next/server";

import { getBackendApiBase } from "@/lib/server/backend";
import type { ClientMiniAppPayload } from "@/lib/api/client-miniapp";

type BackendTelegramClientLinkPhoneResponse = {
  success?: boolean;
  data?: ClientMiniAppPayload;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { init_data?: string; phone?: string };
    const initData = body.init_data || "";
    const phone = body.phone || "";

    if (!initData) {
      return NextResponse.json({ error: "Telegram авторизация не передана" }, { status: 422 });
    }

    if (!phone.trim()) {
      return NextResponse.json({ error: "Укажите номер телефона" }, { status: 422 });
    }

    const backendResponse = await fetch(`${getBackendApiBase()}/telegram/client-miniapp-link-phone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ init_data: initData, phone }),
      cache: "no-store",
    });

    const data = (await backendResponse.json()) as BackendTelegramClientLinkPhoneResponse;
    if (!backendResponse.ok || !data.data?.client) {
      return NextResponse.json(
        { error: data.error || "Не удалось привязать Telegram по телефону" },
        { status: backendResponse.status || 500 }
      );
    }

    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось привязать Telegram по телефону" }, { status: 500 });
  }
}
