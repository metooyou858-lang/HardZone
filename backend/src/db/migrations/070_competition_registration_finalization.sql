BEGIN;

ALTER TABLE competition_events
  ADD COLUMN online_registration_closed_at TIMESTAMPTZ,
  ADD COLUMN onsite_registration_closed_at TIMESTAMPTZ;

ALTER TABLE competition_registrations
  ADD COLUMN onsite_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (onsite_status IN ('pending', 'arrived', 'no_show')),
  ADD COLUMN onsite_updated_at TIMESTAMPTZ;

CREATE INDEX idx_competition_registrations_onsite
  ON competition_registrations(event_key, onsite_status)
  WHERE status = 'registered' AND payment_status = 'paid';

COMMIT;
