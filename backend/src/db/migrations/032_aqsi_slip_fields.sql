ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS aqsi_payment_operation_id VARCHAR,
  ADD COLUMN IF NOT EXISTS aqsi_payment_operation_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aqsi_slip_id VARCHAR,
  ADD COLUMN IF NOT EXISTS aqsi_receipt_operation_id VARCHAR;
