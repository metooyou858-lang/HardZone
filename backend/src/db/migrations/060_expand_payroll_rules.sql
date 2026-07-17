ALTER TABLE payroll_rules
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS all_trainers BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS all_activities BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS salary_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (salary_amount >= 0),
  ADD COLUMN IF NOT EXISTS calculation_type TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS per_attendee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (per_attendee_amount >= 0),
  ADD COLUMN IF NOT EXISTS tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE payroll_rules
SET name = COALESCE(NULLIF(BTRIM(comment), ''), 'Правило #' || id)
WHERE name IS NULL;

ALTER TABLE payroll_rules
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE payroll_rules
  DROP CONSTRAINT IF EXISTS payroll_rules_calculation_type_check;

ALTER TABLE payroll_rules
  ADD CONSTRAINT payroll_rules_calculation_type_check
  CHECK (calculation_type IN ('fixed', 'per_attendee', 'tiered'));

CREATE TABLE IF NOT EXISTS payroll_rule_trainers (
  rule_id BIGINT NOT NULL REFERENCES payroll_rules(id) ON DELETE CASCADE,
  trainer_id BIGINT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, trainer_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_rule_trainers_trainer
  ON payroll_rule_trainers(trainer_id, rule_id);
