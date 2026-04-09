BEGIN;

CREATE TYPE product_type AS ENUM ('product', 'service');

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS type product_type NOT NULL DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_archived ON products(is_archived);

COMMIT;
