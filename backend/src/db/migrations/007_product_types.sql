BEGIN;

CREATE TABLE IF NOT EXISTS product_types (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  has_barcode BOOLEAN NOT NULL DEFAULT true,
  has_sku BOOLEAN NOT NULL DEFAULT true,
  has_cost_price BOOLEAN NOT NULL DEFAULT true,
  has_sale_price BOOLEAN NOT NULL DEFAULT true,
  has_stock BOOLEAN NOT NULL DEFAULT true,
  has_min_stock BOOLEAN NOT NULL DEFAULT true,
  has_marking BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO product_types
  (name, has_barcode, has_sku, has_cost_price, has_sale_price,
   has_stock, has_min_stock, has_marking, is_system, sort_order)
VALUES
  ('Товар', true, true, true, true, true, true, true, true, 1),
  ('Услуга', false, false, false, true, false, false, false, true, 2),
  ('Расходник', true, true, true, false, true, true, false, true, 3)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type_id BIGINT REFERENCES product_types(id) ON DELETE SET NULL;

UPDATE products
SET product_type_id = (
  SELECT id
  FROM product_types
  WHERE name = CASE
    WHEN products.type::TEXT = 'product' THEN 'Товар'
    WHEN products.type::TEXT = 'service' THEN 'Услуга'
    WHEN products.type::TEXT = 'consumable' THEN 'Расходник'
    ELSE 'Товар'
  END
);

CREATE INDEX IF NOT EXISTS idx_products_type_id ON products(product_type_id);

COMMIT;
