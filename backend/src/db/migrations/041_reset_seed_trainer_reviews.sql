UPDATE trainer_reviews
SET is_visible = false,
    updated_at = NOW()
WHERE is_visible = true;

ALTER TABLE trainers
  ALTER COLUMN rating SET DEFAULT 0;

UPDATE trainers
SET rating = 0,
    reviews_count = 0,
    updated_at = NOW()
WHERE rating <> 0
   OR reviews_count <> 0;
