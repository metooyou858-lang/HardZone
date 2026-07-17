CREATE TABLE IF NOT EXISTS payroll_runs (
  id BIGSERIAL PRIMARY KEY,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  CHECK (date_to >= date_from)
);

CREATE TABLE IF NOT EXISTS payroll_run_employees (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  trainer_id BIGINT REFERENCES trainers(id) ON DELETE SET NULL,
  trainer_name TEXT NOT NULL,
  slots_count INTEGER NOT NULL DEFAULT 0,
  attended_count INTEGER NOT NULL DEFAULT 0,
  base_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  calculation_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  paid_date DATE,
  paid_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  UNIQUE (run_id, trainer_id),
  CHECK (
    (payment_status = 'pending' AND paid_date IS NULL AND paid_at IS NULL)
    OR (payment_status = 'paid' AND paid_date IS NOT NULL AND paid_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_period
  ON payroll_runs(date_from DESC, date_to DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_paid_date
  ON payroll_run_employees(paid_date DESC)
  WHERE payment_status = 'paid';