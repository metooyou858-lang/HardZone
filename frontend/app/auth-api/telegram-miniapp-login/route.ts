import { NextResponse } from "next/server";

import { getBackendApiBase } from "@/lib/server/backend";
import { createSessionToken, getSessionCookieName, getSessionCookieOptions, type SessionUser } from "@/lib/server/session";

type BackendTelegramLoginResponse = {
  success?: boolean;
  data?: {
    user?: SessionUser;
  };
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { init_data?: string };
    const initData = body.init_data || "";

    if (!initData) {
      return NextResponse.json({ error: "Telegram авторизация не передана" }, { status: 422 });
    }

    const backendResponse = await fetch(`${getBackendApiBase()}/telegram/miniapp-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ init_data: initData }),
      cache: "no-store",
    });

    const data = (await backendResponse.json()) as BackendTelegramLoginResponse;
    if (!backendResponse.ok || !data.data?.user) {
      return NextResponse.json(
        { error: data.error || "Не удалось войти через Telegram" },
        { status: backendResponse.status || 500 }
      );
    }

    const sessionToken = await createSessionToken(data.data.user);
    const response = NextResponse.json({ success: true, data: { user: data.data.user } });
    response.cookies.set(getSessionCookieName(), sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось войти через Telegram" }, { status: 500 });
  }
}
