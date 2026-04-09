ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_id BIGINT REFERENCES clients(id);

CREATE INDEX IF NOT EXISTS idx_orders_client
  ON orders(client_id)
  WHERE client_id IS NOT NULL;
