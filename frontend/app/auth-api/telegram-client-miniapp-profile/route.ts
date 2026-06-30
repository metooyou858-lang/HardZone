import { NextResponse } from "next/server";

import type { ClientMiniAppPayload, ClientMiniAppProfileInput } from "@/lib/api/client-miniapp";
import { getBackendApiBase } from "@/lib/server/backend";

type BackendTelegramClientProfileResponse = {
  success?: boolean;
  data?: ClientMiniAppPayload;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      init_data?: string;
      profile?: ClientMiniAppProfileInput;
    };
    const initData = body.init_data || "";

    if (!initData) {
      return NextResponse.json({ error: "Telegram авторизация не передана" }, { status: 422 });
    }

    const backendResponse = await fetch(`${getBackendApiBase()}/telegram/client-miniapp-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        init_data: initData,
        profile: body.profile || {},
      }),
      cache: "no-store",
    });

    const data = (await backendResponse.json()) as BackendTelegramClientProfileResponse;
    if (!backendResponse.ok || !data.data?.client) {
      return NextResponse.json(
        { error: data.error || "Не удалось сохранить профиль" },
        { status: backendResponse.status || 500 }
      );
    }

    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось сохранить профиль" }, { status: 500 });
  }
}
