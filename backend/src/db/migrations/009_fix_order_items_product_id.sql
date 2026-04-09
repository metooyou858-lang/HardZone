ALTER TABLE order_items
  ALTER COLUMN product_id TYPE BIGINT USING product_id::text::bigint;
