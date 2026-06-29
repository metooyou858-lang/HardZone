import { NextResponse } from "next/server";

import type { ClientMiniAppPayload } from "@/lib/api/client-miniapp";
import { getBackendApiBase } from "@/lib/server/backend";

type BackendTelegramClientAthleteProfileResponse = {
  success?: boolean;
  data?: ClientMiniAppPayload;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      init_data?: string;
      values?: Array<{ field_id: string; value: string | number | boolean | string[] | null }>;
    };
    const initData = body.init_data || "";

    if (!initData) {
      return NextResponse.json({ error: "Telegram авторизация не передана" }, { status: 422 });
    }

    if (!Array.isArray(body.values) || body.values.length === 0) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 422 });
    }

    const backendResponse = await fetch(`${getBackendApiBase()}/telegram/client-miniapp-athlete-profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        init_data: initData,
        values: body.values,
      }),
      cache: "no-store",
    });

    const data = (await backendResponse.json()) as BackendTelegramClientAthleteProfileResponse;
    if (!backendResponse.ok || !data.data?.client) {
      return NextResponse.json(
        { error: data.error || "Не удалось сохранить профиль атлета" },
        { status: backendResponse.status || 500 }
      );
    }

    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось сохранить профиль атлета" }, { status: 500 });
  }
}
