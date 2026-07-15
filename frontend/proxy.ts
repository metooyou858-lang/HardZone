import { NextRequest, NextResponse } from "next/server";

import { canAccessPath } from "@/lib/authz";
import { getSessionCookieName, readSessionToken } from "@/lib/server/session";

const PUBLIC_FILE_PATTERN = /\.[^/]+$/;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const isLocalPreview =
    process.env.NODE_ENV === "development" &&
    (request.nextUrl.hostname === "localhost" || request.nextUrl.hostname === "127.0.0.1");
  if (isLocalPreview) {
    if (pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth-api/") ||
    pathname.startsWith("/backend-api/") ||
    pathname.startsWith("/telegram/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/reset-password" ||
    pathname === "/favicon.ico" ||
    PUBLIC_FILE_PATTERN.test(pathname)
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(getSessionCookieName())?.value;
  const session = await readSessionToken(sessionToken);
  const isAuthenticated = Boolean(session);

  if (pathname === "/login") {
    if (!isAuthenticated) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isAuthenticated && session) {
    if (!canAccessPath(pathname, session.user)) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/:path*",
};
