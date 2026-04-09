import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createProxyUserHeaders, getBackendApiBase, getBackendApiToken } from "@/lib/server/backend";
import { createSessionToken, getSessionCookieName, getSessionCookieOptions, readSessionToken, type SessionUser } from "@/lib/server/session";

type BackendMeResponse = {
  success?: boolean;
  data?: {
    user?: SessionUser;
  };
  error?: string;
};

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(getSessionCookieName())?.value;
  const session = await readSessionToken(sessionToken);

  if (!session) {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  try {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${getBackendApiToken()}`);

    const proxyHeaders = createProxyUserHeaders(session.user);
    Object.entries(proxyHeaders).forEach(([key, value]) => headers.set(key, value));

    const backendResponse = await fetch(`${getBackendApiBase()}/auth/me`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const data = (await backendResponse.json()) as BackendMeResponse;
    if (!backendResponse.ok || !data.data?.user) {
      const response = NextResponse.json(
        { error: data.error || "Не удалось проверить текущую сессию" },
        { status: backendResponse.status || 401 }
      );
      response.cookies.set(getSessionCookieName(), "", {
        ...getSessionCookieOptions(0),
        maxAge: 0,
        expires: new Date(0),
      });
      return response;
    }

    const nextSessionToken = await createSessionToken(data.data.user);
    const response = NextResponse.json({ success: true, data: { user: data.data.user } });
    response.cookies.set(getSessionCookieName(), nextSessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось проверить текущую сессию" }, { status: 500 });
  }
}
