import {
  getDefaultModulesForRole,
  getDefaultRoleTitle,
  normalizeModules,
  type AuthModulePermission,
  type AuthUserRole,
} from "@/lib/access";

export type SessionUser = {
  id: number;
  name: string;
  username: string;
  role: AuthUserRole;
  role_title: string;
  modules: AuthModulePermission[];
};

type SessionPayload = {
  exp: number;
  user: SessionUser;
};

const SESSION_COOKIE_NAME = "hardzone_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function getSessionSecret(): string {
  return process.env.HARDZONE_SESSION_SECRET || process.env.BACKEND_API_TOKEN || "";
}

function toBase64Url(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));

  if (typeof Buffer !== "undefined") {
    return Buffer.from(`${normalized}${padding}`, "base64").toString("utf-8");
  }

  const binary = atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

async function createSignature(value: string): Promise<string> {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("Session secret is not configured");
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

function isValidSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "number" &&
    Number.isFinite(user.id) &&
    typeof user.name === "string" &&
    user.name.trim().length > 0 &&
    typeof user.username === "string" &&
    user.username.trim().length > 0 &&
    (user.role === "owner" || user.role === "admin")
  );
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function getSessionCookieOptions(expiresAt?: number) {
  const finalExpiresAt = expiresAt ?? Date.now() + SESSION_MAX_AGE_SECONDS * 1000;

  return {
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: new Date(finalExpiresAt),
  };
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload: SessionPayload = {
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    user,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = await createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function readSessionToken(token?: string | null): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = await createSignature(encodedPayload);
  if (expectedSignature !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as Partial<SessionPayload>;
    if (!payload || typeof payload.exp !== "number" || payload.exp <= Date.now() || !isValidSessionUser(payload.user)) {
      return null;
    }

    const user = payload.user;
    return {
      exp: payload.exp,
      user: {
        ...user,
        role_title:
          typeof (user as { role_title?: unknown }).role_title === "string" &&
          (user as { role_title?: string }).role_title?.trim()
            ? ((user as { role_title?: string }).role_title as string)
            : getDefaultRoleTitle(user.role as AuthUserRole),
        modules: normalizeModules((user as { modules?: unknown }).modules).length
          ? normalizeModules((user as { modules?: unknown }).modules)
          : getDefaultModulesForRole(user.role as AuthUserRole),
      },
    };
  } catch {
    return null;
  }
}

export type SessionRole = AuthUserRole;

export async function verifySessionToken(token?: string | null): Promise<boolean> {
  return Boolean(await readSessionToken(token));
}
