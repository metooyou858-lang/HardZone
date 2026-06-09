import { NextRequest, NextResponse } from "next/server";

import { getBackendApiBase } from "@/lib/server/backend";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function getBackendPublicBase() {
  const apiBase = getBackendApiBase();
  return apiBase.endsWith("/api") ? apiBase.slice(0, -4) : apiBase;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  const encodedPath = path.map(encodeURIComponent).join("/");

  if (!encodedPath) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const backendResponse = await fetch(`${getBackendPublicBase()}/uploads/${encodedPath}`, {
    cache: "no-store",
  });

  if (!backendResponse.ok) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const headers = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  headers.set("cache-control", "public, max-age=3600");

  return new NextResponse(await backendResponse.arrayBuffer(), {
    status: 200,
    headers,
  });
}
