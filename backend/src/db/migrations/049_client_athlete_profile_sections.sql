CREATE TABLE IF NOT EXISTS client_athlete_profile_sections (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO client_athlete_profile_sections (name, sort_order)
SELECT section, MIN(sort_order)
FROM client_athlete_profile_fields
GROUP BY section
ON CONFLICT (name) DO NOTHING;

ALTER TABLE client_athlete_profile_fields
  ADD COLUMN IF NOT EXISTS section_id BIGINT REFERENCES client_athlete_profile_sections(id) ON DELETE RESTRICT;

UPDATE client_athlete_profile_fields f
SET section_id = s.id
FROM client_athlete_profile_sections s
WHERE f.section_id IS NULL
  AND s.name = f.section;

ALTER TABLE client_athlete_profile_fields
  ALTER COLUMN section_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_athlete_profile_sections_active_order
  ON client_athlete_profile_sections (is_active, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_client_athlete_profile_fields_section
  ON client_athlete_profile_fields (section_id, sort_order, id);
