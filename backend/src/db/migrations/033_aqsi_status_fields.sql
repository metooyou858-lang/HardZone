ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS aqsi_payment_status TEXT,
  ADD COLUMN IF NOT EXISTS aqsi_receipt_status TEXT,
  ADD COLUMN IF NOT EXISTS aqsi_error         TEXT;
