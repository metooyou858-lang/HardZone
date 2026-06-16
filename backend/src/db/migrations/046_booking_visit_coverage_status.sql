DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'coverage_status') THEN
    CREATE TYPE coverage_status AS ENUM (
      'pending',
      'covered',
      'unpaid',
      'comped',
      'not_required'
    );
  END IF;
END $$;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS coverage_status coverage_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS coverage_reason TEXT,
  ADD COLUMN IF NOT EXISTS coverage_note TEXT;

ALTER TABLE client_visits
  ADD COLUMN IF NOT EXISTS booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coverage_status coverage_status NOT NULL DEFAULT 'covered',
  ADD COLUMN IF NOT EXISTS coverage_reason TEXT,
  ADD COLUMN IF NOT EXISTS coverage_note TEXT;

UPDATE bookings
SET
  coverage_status = CASE
    WHEN covered_by_booking_id IS NOT NULL THEN 'not_required'::coverage_status
    WHEN status = 'attended' AND subscription_id IS NOT NULL THEN 'covered'::coverage_status
    WHEN status = 'attended' AND subscription_id IS NULL THEN 'unpaid'::coverage_status
    WHEN subscription_id IS NOT NULL THEN 'pending'::coverage_status
    ELSE 'unpaid'::coverage_status
  END,
  coverage_reason = CASE
    WHEN covered_by_booking_id IS NOT NULL THEN 'covered_by_partner'
    WHEN status = 'attended' AND subscription_id IS NOT NULL THEN 'subscription_charged'
    WHEN status = 'attended' AND subscription_id IS NULL THEN 'manual_without_subscription'
    WHEN subscription_id IS NOT NULL THEN 'subscription_planned'
    ELSE 'no_subscription'
  END
WHERE coverage_reason IS NULL;

UPDATE client_visits
SET
  coverage_status = CASE
    WHEN subscription_id IS NOT NULL THEN 'covered'::coverage_status
    ELSE 'unpaid'::coverage_status
  END,
  coverage_reason = CASE
    WHEN subscription_id IS NOT NULL THEN 'subscription_charged'
    ELSE 'manual_without_subscription'
  END
WHERE coverage_reason IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_coverage_status
  ON bookings(coverage_status);

CREATE INDEX IF NOT EXISTS idx_visits_coverage_status
  ON client_visits(coverage_status);

CREATE INDEX IF NOT EXISTS idx_visits_booking
  ON client_visits(booking_id)
  WHERE booking_id IS NOT NULL;
