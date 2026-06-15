ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS legacy_import_batch_id UUID,
  ADD COLUMN IF NOT EXISTS legacy_source TEXT,
  ADD COLUMN IF NOT EXISTS legacy_note TEXT;

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_legacy_batch
  ON client_subscriptions(legacy_import_batch_id)
  WHERE legacy_import_batch_id IS NOT NULL;
