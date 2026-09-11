BEGIN;

ALTER TABLE competition_registrations
  ADD COLUMN terms_version TEXT,
  ADD COLUMN terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN privacy_version TEXT,
  ADD COLUMN privacy_accepted_at TIMESTAMPTZ;

UPDATE competition_registrations
SET terms_version = regulations_version,
    terms_accepted_at = regulations_accepted_at
WHERE terms_version IS NULL;

ALTER TABLE competition_registrations
  ALTER COLUMN terms_version SET NOT NULL,
  ALTER COLUMN terms_accepted_at SET NOT NULL,
  ALTER COLUMN regulations_version DROP NOT NULL,
  ALTER COLUMN regulations_accepted_at DROP NOT NULL;

COMMIT;
