BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'inventory_status'
  ) THEN
    CREATE TYPE inventory_status AS ENUM ('draft', 'confirmed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventories (
  id BIGSERIAL PRIMARY KEY,
  status inventory_status NOT NULL DEFAULT 'draft',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGSERIAL PRIMARY KEY,
  inventory_id BIGINT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_qty INTEGER NOT NULL,
  actual_qty INTEGER,
  difference INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN actual_qty IS NOT NULL THEN actual_qty - expected_qty
      ELSE NULL
    END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (inventory_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_inventory
  ON inventory_items(inventory_id);

CREATE INDEX IF NOT EXISTS idx_inventory_items_product
  ON inventory_items(product_id);

COMMIT;
