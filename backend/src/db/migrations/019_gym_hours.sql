CREATE TABLE IF NOT EXISTS gym_hours (
  day_of_week SMALLINT PRIMARY KEY CHECK (day_of_week BETWEEN 1 AND 7),
  is_open BOOLEAN NOT NULL DEFAULT true,
  open_time TIME,
  close_time TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (is_open = false AND open_time IS NULL AND close_time IS NULL)
    OR (
      is_open = true
      AND open_time IS NOT NULL
      AND close_time IS NOT NULL
      AND open_time < close_time
    )
  )
);

INSERT INTO gym_hours (day_of_week, is_open, open_time, close_time)
VALUES
  (1, true, '06:00', '22:00'),
  (2, true, '06:00', '22:00'),
  (3, true, '06:00', '22:00'),
  (4, true, '06:00', '22:00'),
  (5, true, '06:00', '22:00'),
  (6, true, '06:00', '22:00'),
  (7, true, '06:00', '22:00')
ON CONFLICT (day_of_week) DO NOTHING;
