ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS marking_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marking_code TEXT;

CREATE INDEX IF NOT EXISTS idx_order_items_marking_code
  ON order_items(marking_code)
  WHERE marking_code IS NOT NULL;
