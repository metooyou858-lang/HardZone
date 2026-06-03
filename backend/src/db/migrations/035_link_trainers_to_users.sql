BEGIN;

ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trainers_user_id_unique
  ON trainers(user_id)
  WHERE user_id IS NOT NULL;

COMMIT;
