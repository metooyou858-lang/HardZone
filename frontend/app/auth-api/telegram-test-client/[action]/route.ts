import { NextResponse } from "next/server";

const ACTIONS = new Set(["login", "book", "cancel-booking", "trainer-review"]);

type RouteContext = {
  params: Promise<{ action: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { action } = await context.params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const apiBase = String(
      process.env.TELEGRAM_TEST_BACKEND_API_URL || "http://127.0.0.1:3002/api"
    ).replace(/\/+$/, "");
    const backendResponse = await fetch(
      `${apiBase}/telegram/client-miniapp-${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      }
    );
    const data = await backendResponse.json().catch(() => ({ error: "Некорректный ответ сервера" }));
    return NextResponse.json(data, { status: backendResponse.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Тестовый бот временно недоступен" }, { status: 500 });
  }
}
