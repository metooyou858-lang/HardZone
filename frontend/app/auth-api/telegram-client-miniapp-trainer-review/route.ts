import { NextResponse } from "next/server";

import type { ClientMiniAppPayload } from "@/lib/api/client-miniapp";
import { getBackendApiBase } from "@/lib/server/backend";

type BackendTelegramClientTrainerReviewResponse = {
  success?: boolean;
  data?: ClientMiniAppPayload;
  error?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      init_data?: string;
      trainer_id?: string | number;
      rating?: number;
      comment?: string;
    };
    const initData = body.init_data || "";

    if (!initData) {
      return NextResponse.json({ error: "Telegram авторизация не передана" }, { status: 422 });
    }

    if (!body.trainer_id) {
      return NextResponse.json({ error: "Укажите тренера" }, { status: 422 });
    }

    const backendResponse = await fetch(`${getBackendApiBase()}/telegram/client-miniapp-trainer-review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        init_data: initData,
        trainer_id: body.trainer_id,
        rating: body.rating,
        comment: body.comment,
      }),
      cache: "no-store",
    });

    const data = (await backendResponse.json()) as BackendTelegramClientTrainerReviewResponse;
    if (!backendResponse.ok || !data.data?.client) {
      return NextResponse.json(
        { error: data.error || "Не удалось сохранить отзыв" },
        { status: backendResponse.status || 500 }
      );
    }

    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось сохранить отзыв" }, { status: 500 });
  }
}
