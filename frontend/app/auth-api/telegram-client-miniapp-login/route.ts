import { NextResponse } from "next/server";

import { getBackendApiBase } from "@/lib/server/backend";
import type { ClientMiniAppPayload } from "@/lib/api/client-miniapp";

type BackendTelegramClientLoginResponse = {
  success?: boolean;
  data?: ClientMiniAppPayload;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { init_data?: string };
    const initData = body.init_data || "";

    if (!initData) {
      return NextResponse.json({ error: "Telegram авторизация не передана" }, { status: 422 });
    }

    const backendResponse = await fetch(`${getBackendApiBase()}/telegram/client-miniapp-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ init_data: initData }),
      cache: "no-store",
    });

    const data = (await backendResponse.json()) as BackendTelegramClientLoginResponse;
    if (!backendResponse.ok || !data.data?.client) {
      return NextResponse.json(
        { error: data.error || "Не удалось войти через Telegram" },
        { status: backendResponse.status || 500 }
      );
    }

    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось войти через Telegram" }, { status: 500 });
  }
}
