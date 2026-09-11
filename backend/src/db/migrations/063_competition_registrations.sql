BEGIN;

CREATE TABLE IF NOT EXISTS competition_registrations (
  id BIGSERIAL PRIMARY KEY,
  event_key TEXT NOT NULL,
  team_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('amateur', 'advanced')),
  male_name TEXT NOT NULL,
  male_phone TEXT NOT NULL,
  male_phone_normalized TEXT NOT NULL,
  female_name TEXT NOT NULL,
  female_phone TEXT NOT NULL,
  female_phone_normalized TEXT NOT NULL,
  regulations_version TEXT NOT NULL,
  regulations_accepted_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (male_phone_normalized <> female_phone_normalized)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_registrations_male_phone
  ON competition_registrations(event_key, male_phone_normalized)
  WHERE status = 'registered';

CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_registrations_female_phone
  ON competition_registrations(event_key, female_phone_normalized)
  WHERE status = 'registered';

CREATE INDEX IF NOT EXISTS idx_competition_registrations_event_status
  ON competition_registrations(event_key, status, created_at DESC);

-- Ограниченные сотрудники, которым был закрыт маркетинг, не должны
-- автоматически получить новый операционный раздел из admin defaults.
UPDATE users
SET module_revokes = (
  SELECT ARRAY(
    SELECT DISTINCT permission
    FROM unnest(
      COALESCE(module_revokes, '{}'::TEXT[]) || ARRAY['competitions']::TEXT[]
    ) AS permission
    ORDER BY permission
  )
)
WHERE role <> 'owner'
  AND 'marketing' = ANY(COALESCE(module_revokes, '{}'::TEXT[]));

COMMIT;
