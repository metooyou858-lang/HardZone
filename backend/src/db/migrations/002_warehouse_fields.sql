BEGIN;

DO $$
BEGIN
  CREATE TYPE writeoff_reason AS ENUM ('damage', 'expired', 'own_use', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE receipt_method AS ENUM ('barcode', 'datamatrix', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE sale_status AS ENUM ('pending', 'confirmed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE payment_type AS ENUM ('cash', 'card');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('owner', 'senior_admin', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'admin',
  telegram_id TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS datamatrix_code TEXT,
  ADD COLUMN IF NOT EXISTS is_marked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2);

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS method receipt_method NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_price_at_receipt NUMERIC(12,2);

ALTER TABLE writeoffs
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reason_type writeoff_reason NOT NULL DEFAULT 'other';

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_type payment_type,
  ADD COLUMN IF NOT EXISTS aqsi_receipt_id TEXT,
  ADD COLUMN IF NOT EXISTS status sale_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sale_price_at_sale NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales (status);
CREATE INDEX IF NOT EXISTS idx_sales_aqsi ON sales (aqsi_receipt_id);

COMMIT;
