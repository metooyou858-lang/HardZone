import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { UsersPanel } from "@/components/admin/users-panel";
import { hasModuleAccess } from "@/lib/access";
import { getSessionCookieName, readSessionToken } from "@/lib/server/session";

export default async function AdminUsersPage() {
  const sessionToken = (await cookies()).get(getSessionCookieName())?.value;
  const session = await readSessionToken(sessionToken);

  if (!session) {
    redirect("/login?next=/admin/users");
  }

  if (!hasModuleAccess(session.user.modules, "users_manage")) {
    redirect("/");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-main)]">Сотрудники и доступы</h1>
      <UsersPanel currentUserId={session.user.id} currentUserRole={session.user.role} />
    </div>
  );
}
