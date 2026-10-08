BEGIN;
ALTER TABLE competition_results ADD COLUMN final_published_at TIMESTAMPTZ;
COMMIT;
