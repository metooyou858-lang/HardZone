BEGIN;

UPDATE bookings
SET places_count = 1
WHERE places_count IS DISTINCT FROM 1;

UPDATE schedule_slots s
SET booked_count = counts.booked_count,
    updated_at = NOW()
FROM (
  SELECT
    s2.id,
    COUNT(b.id) FILTER (WHERE b.status IN ('confirmed', 'attended'))::INT AS booked_count
  FROM schedule_slots s2
  LEFT JOIN bookings b ON b.slot_id = s2.id
  GROUP BY s2.id
) counts
WHERE counts.id = s.id
  AND s.booked_count IS DISTINCT FROM counts.booked_count;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_single_place_only;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_single_place_only CHECK (places_count = 1);

ALTER TABLE client_subscriptions
  DROP COLUMN IF EXISTS is_family;

ALTER TABLE product_subscription_params
  DROP COLUMN IF EXISTS is_family;

COMMIT;
