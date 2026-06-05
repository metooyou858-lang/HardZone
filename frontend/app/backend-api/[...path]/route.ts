import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getBackendApiBase } from "@/lib/server/backend";
import { getSessionCookieName, readSessionToken } from "@/lib/server/session";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const sessionToken = (await cookies()).get(getSessionCookieName())?.value;
  const session = await readSessionToken(sessionToken);

  if (!session) {
    return NextResponse.json({ error: "Требуется вход администратора" }, { status: 401 });
  }

  const { path = [] } = await context.params;
  // Next.js auto-decodes [...path] segments. Re-encode so backend receives a valid URL —
  // otherwise raw `%`, `?`, `#` etc. from DataMatrix serials break percent-decoding.
  const encodedPath = path.map(encodeURIComponent).join("/");
  const backendUrl = new URL(`${getBackendApiBase()}/${encodedPath}`);

  request.nextUrl.searchParams.forEach((value, key) => {
    backendUrl.searchParams.append(key, value);
  });

  const headers = new Headers();
  headers.set("x-hardzone-session", sessionToken || "");

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const accept = request.headers.get("accept");
  if (accept) {
    headers.set("accept", accept);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const bodyBuffer = await request.arrayBuffer();
    init.body = bodyBuffer.byteLength > 0 ? Buffer.from(bodyBuffer) : undefined;
  }

  let backendResponse: Response;

  try {
    backendResponse = await fetch(backendUrl, init);
  } catch {
    return NextResponse.json(
      { error: "Backend HardZone временно недоступен" },
      { status: 502 }
    );
  }

  const responseBuffer = await backendResponse.arrayBuffer();
  const responseHeaders = new Headers();

  const responseContentType = backendResponse.headers.get("content-type");
  if (responseContentType) {
    responseHeaders.set("content-type", responseContentType);
  }

  const contentDisposition = backendResponse.headers.get("content-disposition");
  if (contentDisposition) {
    responseHeaders.set("content-disposition", contentDisposition);
  }

  if (backendResponse.status === 204 || backendResponse.status === 304) {
    return new NextResponse(null, {
      status: backendResponse.status,
      headers: responseHeaders,
    });
  }

  return new NextResponse(responseBuffer, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context);
}
