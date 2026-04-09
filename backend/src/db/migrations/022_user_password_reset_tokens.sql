BEGIN;

CREATE TABLE IF NOT EXISTS user_password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_password_reset_tokens_user
  ON user_password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_user_password_reset_tokens_expires
  ON user_password_reset_tokens(expires_at)
  WHERE used_at IS NULL;

COMMIT;
