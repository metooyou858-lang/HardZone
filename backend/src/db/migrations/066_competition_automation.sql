BEGIN;

-- NULL deadline deliberately keeps every pre-migration registration outside automation.
ALTER TABLE competition_registrations
  ADD COLUMN team_email TEXT,
  ADD COLUMN payment_deadline TIMESTAMPTZ,
  ADD COLUMN fee_kopecks BIGINT,
  ADD COLUMN expired_at TIMESTAMPTZ,
  ADD COLUMN next_payment_check_at TIMESTAMPTZ,
  ADD COLUMN automation_error TEXT;

CREATE TABLE competition_email_jobs (
  id BIGSERIAL PRIMARY KEY,
  registration_id BIGINT NOT NULL REFERENCES competition_registrations(id),
  kind TEXT NOT NULL CHECK (kind IN ('registration', 'reminder', 'expired', 'paid')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'sending', 'sent', 'skipped', 'uncertain')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (registration_id, kind)
);
CREATE INDEX competition_email_jobs_pending ON competition_email_jobs(available_at) WHERE state = 'pending';
CREATE INDEX competition_registrations_check ON competition_registrations(next_payment_check_at)
  WHERE payment_deadline IS NOT NULL AND status = 'registered' AND paid_at IS NULL;

COMMIT;
