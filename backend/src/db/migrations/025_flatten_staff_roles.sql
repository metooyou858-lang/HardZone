BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_title TEXT;

WITH all_modules AS (
  SELECT ARRAY[
    'warehouse',
    'services',
    'sales',
    'clients',
    'schedule',
    'analytics',
    'users_manage'
  ]::TEXT[] AS items
),
legacy_defaults AS (
  SELECT
    u.id,
    u.role,
    COALESCE(u.module_grants, '{}'::TEXT[]) AS module_grants,
    COALESCE(u.module_revokes, '{}'::TEXT[]) AS module_revokes,
    CASE
      WHEN u.role::TEXT IN ('owner', 'senior_admin') THEN (SELECT items FROM all_modules)
      WHEN u.role::TEXT = 'admin' THEN ARRAY['warehouse', 'sales', 'clients', 'schedule']::TEXT[]
      WHEN u.role::TEXT = 'trainer' THEN ARRAY['sales', 'schedule']::TEXT[]
      ELSE '{}'::TEXT[]
    END AS default_modules
  FROM users u
),
effective_modules AS (
  SELECT
    ld.id,
    ld.role,
    COALESCE(
      ARRAY(
        SELECT DISTINCT module
        FROM unnest(ld.default_modules || ld.module_grants) AS module
        WHERE module = ANY(ARRAY[
          'warehouse',
          'services',
          'sales',
          'clients',
          'schedule',
          'analytics',
          'users_manage'
        ]::TEXT[])
          AND NOT (module = ANY(ld.module_revokes))
        ORDER BY module
      ),
      '{}'::TEXT[]
    ) AS items
  FROM legacy_defaults ld
)
UPDATE users u
SET
  role = CASE
    WHEN u.role::TEXT = 'owner' THEN 'owner'::user_role
    ELSE 'admin'::user_role
  END,
  role_title = CASE
    WHEN u.role::TEXT = 'owner' THEN 'Владелец'
    ELSE 'Главный администратор'
  END,
  module_grants = CASE
    WHEN u.role::TEXT = 'owner' THEN COALESCE(u.module_grants, '{}'::TEXT[])
    ELSE '{}'::TEXT[]
  END,
  module_revokes = CASE
    WHEN u.role::TEXT = 'owner' THEN COALESCE(u.module_revokes, '{}'::TEXT[])
    ELSE COALESCE(
      ARRAY(
        SELECT module
        FROM unnest((SELECT items FROM all_modules)) AS module
        WHERE NOT (module = ANY(em.items))
        ORDER BY module
      ),
      '{}'::TEXT[]
    )
  END,
  updated_at = NOW()
FROM effective_modules em
WHERE u.id = em.id;

COMMIT;
