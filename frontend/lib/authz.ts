import { hasModuleAccess, moduleLabels, roleLabels, type AuthModulePermission } from "@/lib/access";
import type { SessionUser } from "@/lib/server/session";

export { moduleLabels, roleLabels };
export type { AuthModulePermission };

export const moduleByPath: Array<{ prefix: string; permission: AuthModulePermission }> = [
  { prefix: "/admin/users", permission: "users_manage" },
  { prefix: "/analytics", permission: "analytics" },
  { prefix: "/services", permission: "services" },
  { prefix: "/warehouse", permission: "warehouse" },
  { prefix: "/clients", permission: "clients" },
  { prefix: "/sales", permission: "sales" },
  { prefix: "/schedule", permission: "schedule" },
];

export function canAccessPath(pathname: string, user: Pick<SessionUser, "modules">): boolean {
  for (const entry of moduleByPath) {
    if (pathname.startsWith(entry.prefix)) {
      return hasModuleAccess(user.modules, entry.permission);
    }
  }

  return true;
}
