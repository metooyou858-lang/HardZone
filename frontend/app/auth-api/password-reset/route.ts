import { NextResponse } from "next/server";

import { getBackendApiBase } from "@/lib/server/backend";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim() || "";

    if (!token) {
      return NextResponse.json({ error: "Ссылка восстановления не найдена" }, { status: 422 });
    }

    const backendResponse = await fetch(`${getBackendApiBase()}/auth/password-reset/${encodeURIComponent(token)}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось проверить ссылку восстановления" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; token?: string; password?: string };
    const isRequestMode = Boolean(body.email) && !body.token && !body.password;

    const backendResponse = await fetch(
      `${getBackendApiBase()}/${isRequestMode ? "auth/password-reset/request" : "auth/password-reset/complete"}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(
          isRequestMode
            ? {
                email: body.email || "",
              }
            : {
                token: body.token || "",
                password: body.password || "",
              }
        ),
        cache: "no-store",
      }
    );

    const data = await backendResponse.json();
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось выполнить восстановление пароля" }, { status: 500 });
  }
}
