BEGIN;

ALTER TABLE competition_registrations
  ADD COLUMN public_token TEXT,
  ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
  ADD COLUMN paid_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_registrations_public_token
  ON competition_registrations(public_token)
  WHERE public_token IS NOT NULL;

CREATE TABLE competition_payments (
  id BIGSERIAL PRIMARY KEY,
  registration_id BIGINT NOT NULL REFERENCES competition_registrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'tbank' CHECK (provider = 'tbank'),
  order_id TEXT NOT NULL UNIQUE,
  payment_id TEXT UNIQUE,
  amount_kopecks BIGINT NOT NULL CHECK (amount_kopecks > 0),
  status TEXT NOT NULL DEFAULT 'NEW',
  payment_url TEXT,
  error_code TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_competition_payments_registration
  ON competition_payments(registration_id, created_at DESC);

COMMIT;
