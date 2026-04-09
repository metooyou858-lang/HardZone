import { apiFetch } from "@/lib/api/client";
import { type AuthModulePermission, type AuthUserRole } from "@/lib/access";

export type AuthUser = {
  id: number;
  name: string;
  username: string;
  email: string | null;
  role: AuthUserRole;
  role_title: string;
  is_active: boolean;
  last_login_at?: string | null;
  module_grants: AuthModulePermission[];
  module_revokes: AuthModulePermission[];
  modules: AuthModulePermission[];
};

export type AuthUserPayload = {
  name: string;
  username?: string;
  email?: string | null;
  role?: AuthUserRole;
  role_title?: string;
  modules?: AuthModulePermission[];
  is_active?: boolean;
  password?: string;
};

export type ResetLinkPayload = {
  email: string | null;
  expires_at: string;
  reset_url: string;
};

export type AuthUserOnboarding = {
  email_sent: boolean;
  email_error: string | null;
  temporary_password: string | null;
};

export async function fetchAuthUsers(): Promise<AuthUser[]> {
  const response = await apiFetch<{ success: true; data: AuthUser[] }>("/auth/users");
  return response.data;
}

export async function createAuthUser(
  payload: AuthUserPayload
): Promise<{ user: AuthUser; onboarding: AuthUserOnboarding }> {
  const response = await apiFetch<{ success: true; data: { user: AuthUser; onboarding: AuthUserOnboarding } }>(
    "/auth/users",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );

  return response.data;
}

export async function updateAuthUser(id: number, payload: Partial<AuthUserPayload>): Promise<AuthUser> {
  const response = await apiFetch<{ success: true; data: { user: AuthUser } }>(`/auth/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return response.data.user;
}

export async function createAuthUserResetLink(id: number): Promise<ResetLinkPayload> {
  const response = await apiFetch<{ success: true; data: ResetLinkPayload }>(`/auth/users/${id}/reset-link`, {
    method: "POST",
  });

  return response.data;
}

export async function sendAuthUserTemporaryPassword(id: number): Promise<{ email: string | null }> {
  const response = await apiFetch<{ success: true; data: { email: string | null } }>(`/auth/users/${id}/send-password`, {
    method: "POST",
  });

  return response.data;
}

export async function deleteAuthUser(id: number): Promise<void> {
  await apiFetch(`/auth/users/${id}`, {
    method: "DELETE",
  });
}
