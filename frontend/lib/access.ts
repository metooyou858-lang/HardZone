export type AuthUserRole = "owner" | "admin";

export type AuthModulePermission =
  | "warehouse"
  | "services"
  | "sales"
  | "sales_create"
  | "sales_pay"
  | "sales_cancel"
  | "sales_refund"
  | "sales_aqsi_recovery"
  | "clients"
  | "schedule"
  | "schedule_edit_groups"
  | "schedule_edit_personal"
  | "schedule_cancel"
  | "schedule_clients"
  | "schedule_attendance"
  | "schedule_gym"
  | "analytics"
  | "users_manage";

export const ALL_MODULE_PERMISSIONS: AuthModulePermission[] = [
  "warehouse",
  "services",
  "sales",
  "sales_create",
  "sales_pay",
  "sales_cancel",
  "sales_refund",
  "sales_aqsi_recovery",
  "clients",
  "schedule",
  "schedule_edit_groups",
  "schedule_edit_personal",
  "schedule_cancel",
  "schedule_clients",
  "schedule_attendance",
  "schedule_gym",
  "analytics",
  "users_manage",
];

export const SCHEDULE_SUB_PERMISSIONS: AuthModulePermission[] = [
  "schedule_edit_groups",
  "schedule_edit_personal",
  "schedule_cancel",
  "schedule_clients",
  "schedule_attendance",
  "schedule_gym",
];

export const SALES_SUB_PERMISSIONS: AuthModulePermission[] = [
  "sales_create",
  "sales_pay",
  "sales_cancel",
  "sales_refund",
  "sales_aqsi_recovery",
];

export const roleLabels: Record<AuthUserRole, string> = {
  owner: "Главный администратор",
  admin: "Администратор",
};

export const moduleLabels: Record<AuthModulePermission, string> = {
  warehouse: "Склад",
  services: "Услуги",
  sales: "Продажи",
  sales_create: "Продажи: создание и редактирование чека",
  sales_pay: "Продажи: оплата",
  sales_cancel: "Продажи: отмена",
  sales_refund: "Продажи: возвраты",
  sales_aqsi_recovery: "Продажи: восстановление AQSI",
  clients: "Клиенты",
  schedule: "Расписание",
  schedule_edit_groups: "Групповые: создание и редактирование",
  schedule_edit_personal: "Персоналки: создание и редактирование",
  schedule_cancel: "Отмена тренировок",
  schedule_clients: "Запись и отписка клиентов",
  schedule_attendance: "Отметка посещаемости",
  schedule_gym: "Зал (open gym)",
  analytics: "Аналитика",
  users_manage: "Сотрудники и доступы",
};

export type AccessPresetId = "admin_full" | "duty_trainer";

export type AccessPreset = {
  id: AccessPresetId;
  label: string;
  description: string;
  role_title: string;
  modules: AuthModulePermission[];
};

export const accessPresets: AccessPreset[] = [
  {
    id: "admin_full",
    label: "Администратор",
    description: "Полный доступ к CRM, настройкам, сотрудникам и системной диагностике.",
    role_title: "Администратор",
    modules: ALL_MODULE_PERMISSIONS,
  },
  {
    id: "duty_trainer",
    label: "Дежурный тренер",
    description: "Продажи, клиенты, запись на тренировки и посещаемость без отмен тренировок и системных прав.",
    role_title: "Дежурный тренер",
    modules: ["sales", "sales_create", "sales_pay", "clients", "schedule", "schedule_clients", "schedule_attendance"],
  },
];

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
