import { NextResponse } from "next/server";

import { getBackendApiBase } from "@/lib/server/backend";
import { createSessionToken, getSessionCookieName, getSessionCookieOptions, type SessionUser } from "@/lib/server/session";

type BackendLoginResponse = {
  success?: boolean;
  data?: {
    user?: SessionUser;
  };
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; username?: string; password?: string };
    const email = body.email?.trim() || body.username?.trim() || "";
    const password = body.password || "";

    if (!email || !password) {
      return NextResponse.json({ error: "Введите email и пароль" }, { status: 422 });
    }

    const backendResponse = await fetch(`${getBackendApiBase()}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    const data = (await backendResponse.json()) as BackendLoginResponse;
    if (!backendResponse.ok || !data.data?.user) {
      return NextResponse.json({ error: data.error || "Не удалось выполнить вход" }, { status: backendResponse.status || 500 });
    }

    const sessionToken = await createSessionToken(data.data.user);
    const response = NextResponse.json({ success: true, data: { user: data.data.user } });
    response.cookies.set(getSessionCookieName(), sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось выполнить вход" }, { status: 500 });
  }
}
