import { createHmac } from "node:crypto";

import type { SessionUser } from "@/lib/server/session";

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64url");
}

function getProxySecret(): string {
  const secret = process.env.BACKEND_API_PROXY_SECRET || process.env.BACKEND_API_TOKEN || "";

  if (!secret) {
    throw new Error("Backend proxy secret is not configured");
  }

  return secret;
}

export function getBackendApiBase(): string {
  return normalizeBaseUrl(
    process.env.BACKEND_API_URL || process.env.INTERNAL_API_URL || "http://127.0.0.1:3000/api"
  );
}

export function getBackendApiToken(): string {
  const token = process.env.BACKEND_API_TOKEN || "";

  if (!token) {
    throw new Error("Backend API token is not configured");
  }

  return token;
}

export function createProxyUserHeaders(user: SessionUser): Record<string, string> {
  const timestamp = Date.now().toString();
  const username = user.username.trim().toLowerCase();
  const name = user.name.trim();
  const payload = [user.id, user.role, username, name, timestamp].join(":");
  const signature = createHmac("sha256", getProxySecret()).update(payload).digest("base64url");

  return {
    "x-hardzone-user-id": String(user.id),
    "x-hardzone-user-role": user.role,
    "x-hardzone-user-username": toBase64Url(username),
    "x-hardzone-user-name": toBase64Url(name),
    "x-hardzone-user-ts": timestamp,
    "x-hardzone-user-signature": signature,
  };
}
