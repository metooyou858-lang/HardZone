CREATE TABLE aqsi_receipt_recovery_attempts (
  id BIGSERIAL PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_operation_id TEXT NOT NULL,
  operation_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'rejected', 'uncertain')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX aqsi_receipt_recovery_active_attempt
  ON aqsi_receipt_recovery_attempts (order_id, previous_operation_id)
  WHERE status <> 'rejected';
