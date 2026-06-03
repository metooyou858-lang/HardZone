const ALL_MODULES = [
  'warehouse',
  'services',
  'sales',
  'clients',
  'schedule',
  'schedule_edit_groups',
  'schedule_edit_personal',
  'schedule_cancel',
  'schedule_clients',
  'schedule_attendance',
  'schedule_gym',
  'analytics',
  'users_manage',
];

const ROLE_DEFAULT_MODULES = {
  owner: ALL_MODULES,
  admin: ALL_MODULES,
};

const ROLE_DEFAULT_TITLES = {
  owner: 'Главный администратор',
  admin: 'Администратор',
};

function normalizeModules(value) {
  const input = Array.isArray(value) ? value : [];
  return [...new Set(input.map((item) => String(item || '').trim()).filter((item) => ALL_MODULES.includes(item)))];
}

function getDefaultModulesForRole(role) {
  return [...(ROLE_DEFAULT_MODULES[role] || [])];
}

function getDefaultRoleTitle(role) {
  return ROLE_DEFAULT_TITLES[role] || ROLE_DEFAULT_TITLES.admin;
}

function resolveModules(role, grants, revokes) {
  const next = new Set(getDefaultModulesForRole(role));

  for (const permission of normalizeModules(grants)) {
    next.add(permission);
  }

  for (const permission of normalizeModules(revokes)) {
    next.delete(permission);
  }

  return ALL_MODULES.filter((permission) => next.has(permission));
}

function buildUserAccessPayload(role, desiredModules) {
  const defaults = new Set(getDefaultModulesForRole(role));
  const desired = new Set(normalizeModules(desiredModules));

  const module_grants = ALL_MODULES.filter((permission) => desired.has(permission) && !defaults.has(permission));
  const module_revokes = ALL_MODULES.filter((permission) => !desired.has(permission) && defaults.has(permission));

  return {
    module_grants,
    module_revokes,
    modules: resolveModules(role, module_grants, module_revokes),
  };
}

function hasModuleAccess(user, permission) {
  return Boolean(user?.modules?.includes(permission));
}

module.exports = {
  ALL_MODULES,
  ROLE_DEFAULT_MODULES,
  ROLE_DEFAULT_TITLES,
  normalizeModules,
  getDefaultModulesForRole,
  getDefaultRoleTitle,
  resolveModules,
  buildUserAccessPayload,
  hasModuleAccess,
};
