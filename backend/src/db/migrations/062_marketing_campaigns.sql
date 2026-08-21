CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL DEFAULT 'referral',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  banner_url TEXT,
  public_rules TEXT NOT NULL DEFAULT '',
  reward_rules JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(reward_rules) = 'array'),
  starts_at DATE,
  ends_at DATE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS marketing_referrals (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  referrer_client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  referred_client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'completed', 'cancelled')),
  note TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, referred_client_id),
  CHECK (referrer_client_id <> referred_client_id)
);

CREATE TABLE IF NOT EXISTS marketing_referral_rewards (
  id BIGSERIAL PRIMARY KEY,
  referral_id BIGINT NOT NULL REFERENCES marketing_referrals(id) ON DELETE CASCADE,
  rule_index INTEGER NOT NULL CHECK (rule_index >= 0),
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('referrer', 'referred')),
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('discount_percent', 'free_visit')),
  reward_value NUMERIC(12,2) NOT NULL CHECK (reward_value > 0),
  reward_snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'cancelled')),
  issued_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referral_id, rule_index),
  CHECK (
    (status = 'issued' AND issued_at IS NOT NULL)
    OR (status <> 'issued' AND issued_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status
  ON marketing_campaigns(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_referrals_campaign
  ON marketing_referrals(campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_rewards_referral
  ON marketing_referral_rewards(referral_id, rule_index);
