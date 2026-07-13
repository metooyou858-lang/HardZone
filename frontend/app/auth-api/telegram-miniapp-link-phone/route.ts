import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Подтвердите свой номер кнопкой в чат-боте HardZone." },
    { status: 410 }
  );
}
