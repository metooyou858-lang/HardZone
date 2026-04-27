ALTER TABLE bookings
  ADD COLUMN covered_by_booking_id BIGINT REFERENCES bookings(id) ON DELETE SET NULL;
