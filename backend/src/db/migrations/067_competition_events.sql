BEGIN;

CREATE TABLE competition_events (
  event_key TEXT PRIMARY KEY,
  settings JSONB NOT NULL DEFAULT '{}'::JSONB,
  legacy BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing registrations keep their identifiers, tokens, payments and timestamps.
INSERT INTO competition_events(event_key, legacy)
SELECT DISTINCT event_key, TRUE FROM competition_registrations;

ALTER TABLE competition_registrations
  ADD CONSTRAINT competition_registrations_event_fk
  FOREIGN KEY (event_key) REFERENCES competition_events(event_key);
ALTER TABLE competition_registrations DROP CONSTRAINT competition_registrations_category_check;

COMMIT;
