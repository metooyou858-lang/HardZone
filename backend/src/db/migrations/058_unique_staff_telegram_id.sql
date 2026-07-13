BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id_unique
  ON users(telegram_id)
  WHERE telegram_id IS NOT NULL;

COMMIT;
