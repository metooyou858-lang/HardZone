ALTER TABLE payroll_rules
  ADD COLUMN IF NOT EXISTS percentage_rate NUMERIC(5,2) NOT NULL DEFAULT 0
  CHECK (percentage_rate >= 0 AND percentage_rate <= 100);

ALTER TABLE payroll_rules
  DROP CONSTRAINT IF EXISTS payroll_rules_calculation_type_check;

ALTER TABLE payroll_rules
  ADD CONSTRAINT payroll_rules_calculation_type_check
  CHECK (calculation_type IN ('fixed', 'per_attendee', 'tiered', 'percentage'));
