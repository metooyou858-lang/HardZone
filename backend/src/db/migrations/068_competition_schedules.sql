BEGIN;
CREATE TABLE competition_schedules (
  event_key TEXT PRIMARY KEY REFERENCES competition_events(event_key),
  config JSONB NOT NULL DEFAULT '{"categories":[]}'::JSONB,
  revision INTEGER NOT NULL DEFAULT 0,
  generated_grid JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
