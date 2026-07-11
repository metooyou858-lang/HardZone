CREATE TABLE IF NOT EXISTS payroll_rules (
  id BIGSERIAL PRIMARY KEY,
  base_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  bonus_threshold INTEGER CHECK (bonus_threshold IS NULL OR bonus_threshold >= 0),
  bonus_per_person NUMERIC(12,2) CHECK (bonus_per_person IS NULL OR bonus_per_person >= 0),
  effective_from DATE NOT NULL,
  comment TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_rule_items (
  id BIGSERIAL PRIMARY KEY,
  rule_id BIGINT NOT NULL REFERENCES payroll_rules(id) ON DELETE CASCADE,
  training_type_id BIGINT REFERENCES training_types(id) ON DELETE CASCADE,
  product_id BIGINT REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (training_type_id IS NOT NULL AND product_id IS NULL)
    OR (training_type_id IS NULL AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payroll_rules_effective_from
  ON payroll_rules(effective_from DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_payroll_rule_items_training_type
  ON payroll_rule_items(training_type_id)
  WHERE training_type_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payroll_rule_items_product
  ON payroll_rule_items(product_id)
  WHERE product_id IS NOT NULL;
