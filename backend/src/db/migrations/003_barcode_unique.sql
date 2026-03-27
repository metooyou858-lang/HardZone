BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_barcode_key'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_barcode_key UNIQUE (barcode);
  END IF;
END
$$;

COMMIT;
