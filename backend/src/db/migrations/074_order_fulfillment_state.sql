ALTER TABLE orders
  ADD COLUMN fulfillment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'completed', 'error')),
  ADD COLUMN fulfillment_error TEXT,
  ADD COLUMN fulfilled_at TIMESTAMPTZ;

-- Existing closed orders used the old atomic settlement path, so their fulfillment already ran.
UPDATE orders
SET fulfillment_status = 'completed',
    fulfilled_at = COALESCE(fulfilled_at, confirmed_at, created_at)
WHERE status <> 'open';
