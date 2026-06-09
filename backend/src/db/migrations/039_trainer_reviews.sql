CREATE TABLE IF NOT EXISTS trainer_reviews (
  id BIGSERIAL PRIMARY KEY,
  trainer_id BIGINT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trainer_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_trainer_reviews_trainer_visible
  ON trainer_reviews (trainer_id, is_visible, created_at DESC);

