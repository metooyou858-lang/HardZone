-- Provider identifiers are accounting identities. A value may belong to only one order.
CREATE UNIQUE INDEX IF NOT EXISTS orders_aqsi_slip_id_unique
  ON orders(aqsi_slip_id)
  WHERE aqsi_slip_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_aqsi_payment_operation_id_unique
  ON orders(aqsi_payment_operation_id)
  WHERE aqsi_payment_operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_aqsi_receipt_operation_id_unique
  ON orders(aqsi_receipt_operation_id)
  WHERE aqsi_receipt_operation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_aqsi_receipt_id_unique
  ON orders(aqsi_receipt_id)
  WHERE aqsi_receipt_id IS NOT NULL;

-- Repeated attendance requests must not spend the same booking twice.
CREATE UNIQUE INDEX IF NOT EXISTS client_visits_booking_id_unique
  ON client_visits(booking_id)
  WHERE booking_id IS NOT NULL;
