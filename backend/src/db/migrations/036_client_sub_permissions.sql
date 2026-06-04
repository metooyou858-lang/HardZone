-- Split client access into read/create/update/import permissions.
-- Users that already had the base clients module revoked must not receive
-- the newly introduced client sub-permissions through admin defaults.
UPDATE users
SET module_revokes = (
  SELECT ARRAY(
    SELECT DISTINCT permission
    FROM unnest(
      COALESCE(module_revokes, '{}'::TEXT[]) ||
      ARRAY['clients_create', 'clients_update', 'clients_import']::TEXT[]
    ) AS permission
    ORDER BY permission
  )
)
WHERE 'clients' = ANY(COALESCE(module_revokes, '{}'::TEXT[]));

-- Duty trainers can view and create clients for shift work, but should not
-- mass-import clients or edit existing client cards unless explicitly granted.
UPDATE users
SET module_revokes = (
  SELECT ARRAY(
    SELECT DISTINCT permission
    FROM unnest(
      COALESCE(module_revokes, '{}'::TEXT[]) ||
      ARRAY['clients_update', 'clients_import']::TEXT[]
    ) AS permission
    ORDER BY permission
  )
)
WHERE role != 'owner'
  AND role_title = 'Дежурный тренер';
