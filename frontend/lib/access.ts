export type AuthUserRole = "owner" | "admin";

export type AuthModulePermission =
  | "warehouse"
  | "services"
  | "sales"
  | "clients"
  | "schedule"
  | "analytics"
  | "users_manage";

export const ALL_MODULE_PERMISSIONS: AuthModulePermission[] = [
  "warehouse",
  "services",
  "sales",
  "clients",
  "schedule",
  "analytics",
  "users_manage",
];

export const roleLabels: Record<AuthUserRole, string> = {
  owner: "Владелец",
  admin: "Главный администратор",
};

export const moduleLabels: Record<AuthModulePermission, string> = {
  warehouse: "Склад",
  services: "Услуги",
  sales: "Продажи",
  clients: "Клиенты",
  schedule: "Расписание",
  analytics: "Аналитика",
  users_manage: "Сотрудники и доступы",
};

export const roleDefaultModules: Record<AuthUserRole, AuthModulePermission[]> = {
  owner: ALL_MODULE_PERMISSIONS,
  admin: ALL_MODULE_PERMISSIONS,
};

export function normalizeModules(input: unknown): AuthModulePermission[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return [
    ...new Set(
      input
        .map((item) => String(item || "").trim())
        .filter((item): item is AuthModulePermission =>
          ALL_MODULE_PERMISSIONS.includes(item as AuthModulePermission)
        )
    ),
  ];
}

export function getDefaultModulesForRole(role: AuthUserRole): AuthModulePermission[] {
  return [...roleDefaultModules[role]];
}

export function getDefaultRoleTitle(role: AuthUserRole): string {
  return roleLabels[role];
}

export function hasModuleAccess(
  modules: readonly AuthModulePermission[] | null | undefined,
  module: AuthModulePermission
): boolean {
  return Boolean(modules?.includes(module));
}
