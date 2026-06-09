CREATE TABLE IF NOT EXISTS client_miniapp_auth_audit (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('login', 'link_phone')),
  status TEXT NOT NULL,
  telegram_id TEXT,
  telegram_username TEXT,
  phone_normalized TEXT,
  matched_client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_miniapp_auth_audit_created_at
  ON client_miniapp_auth_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_miniapp_auth_audit_telegram_id
  ON client_miniapp_auth_audit (telegram_id, created_at DESC)
  WHERE telegram_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_miniapp_auth_audit_phone
  ON client_miniapp_auth_audit (phone_normalized, created_at DESC)
  WHERE phone_normalized IS NOT NULL;

