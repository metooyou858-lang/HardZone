-- Tracks AQSI operations that block terminal but are not linked to any CRM order.
-- Populated when initiate-payment returns OperationInProgress and the conflicting
-- operation_id is not found in our orders table (orphaned or external operation).
CREATE TABLE IF NOT EXISTS aqsi_terminal_blockers (
  id SERIAL PRIMARY KEY,
  device_id BIGINT NOT NULL,
  operation_id TEXT NOT NULL,
  op_status TEXT,
  is_cancellation_requested BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'orphaned',  -- 'orphaned' | 'external' | 'stale_order'
  order_id UUID REFERENCES orders(id),      -- set if the blocker belonged to a now-cleared order
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_status TEXT,                     -- final AQSI status when resolved

  CONSTRAINT aqsi_terminal_blockers_operation_id_unique UNIQUE (operation_id)
);

CREATE INDEX IF NOT EXISTS idx_aqsi_terminal_blockers_unresolved
  ON aqsi_terminal_blockers (device_id, resolved_at)
  WHERE resolved_at IS NULL;
