BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS aqsi_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aqsi_sync_attempted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_aqsi_pending_sync
  ON orders (aqsi_sent_at)
  WHERE status = 'open'
    AND aqsi_receipt_id IS NOT NULL
    AND aqsi_sent_at IS NOT NULL
    AND aqsi_sync_attempted_at IS NULL;

COMMIT;
