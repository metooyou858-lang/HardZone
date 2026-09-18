BEGIN;
CREATE TABLE competition_results (
  event_key TEXT PRIMARY KEY REFERENCES competition_events(event_key) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{"workouts":{}}'::JSONB,
  revision INTEGER NOT NULL DEFAULT 0,
  hidden_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
