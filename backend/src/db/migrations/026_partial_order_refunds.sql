ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'partially_refunded';

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS refunded_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refunded_at TIMESTAMPTZ;

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_refunded_quantity_check;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_refunded_quantity_check
  CHECK (refunded_quantity >= 0 AND refunded_quantity <= quantity);

CREATE INDEX IF NOT EXISTS idx_order_items_refunded_quantity
  ON order_items(order_id, refunded_quantity);
