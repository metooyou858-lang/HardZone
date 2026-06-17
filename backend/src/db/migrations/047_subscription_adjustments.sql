ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'cancelled';

CREATE TABLE IF NOT EXISTS subscription_adjustments (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES client_subscriptions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('manual_update', 'sync_product_params')),
  reason TEXT NOT NULL,
  before_data JSONB NOT NULL,
  after_data JSONB NOT NULL,
  changed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_adjustments_subscription
  ON subscription_adjustments(subscription_id, created_at DESC);
