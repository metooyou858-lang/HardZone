CREATE TABLE IF NOT EXISTS client_athlete_profile_fields (
  id            BIGSERIAL PRIMARY KEY,
  section       TEXT NOT NULL,
  label         TEXT NOT NULL,
  field_key     TEXT NOT NULL UNIQUE,
  field_type    TEXT NOT NULL CHECK (field_type IN ('text', 'textarea', 'number', 'date', 'boolean', 'select', 'multiselect')),
  unit          TEXT,
  options       JSONB NOT NULL DEFAULT '[]'::JSONB,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  visible_to    TEXT[] NOT NULL DEFAULT ARRAY['admin', 'trainer']::TEXT[],
  editable_by   TEXT[] NOT NULL DEFAULT ARRAY['admin', 'trainer']::TEXT[],
  is_required   BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_athlete_profile_values (
  id            BIGSERIAL PRIMARY KEY,
  client_id     BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  field_id      BIGINT NOT NULL REFERENCES client_athlete_profile_fields(id) ON DELETE CASCADE,
  value         JSONB,
  updated_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_client_athlete_profile_fields_active_order
  ON client_athlete_profile_fields (is_active, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_client_athlete_profile_values_client
  ON client_athlete_profile_values (client_id);

INSERT INTO client_athlete_profile_fields
  (section, label, field_key, field_type, unit, sort_order, visible_to, editable_by)
VALUES
  ('Силовые показатели и 1ПМ', 'Присед со штангой на спине', 'back_squat_1rm', 'number', 'кг', 10, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Силовые показатели и 1ПМ', 'Фронтальный присед', 'front_squat_1rm', 'number', 'кг', 20, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Силовые показатели и 1ПМ', 'Присед со штангой над головой', 'overhead_squat_1rm', 'number', 'кг', 30, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Силовые показатели и 1ПМ', 'Рывок', 'snatch_1rm', 'number', 'кг', 40, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Силовые показатели и 1ПМ', 'Взятие + толчок', 'clean_and_jerk_1rm', 'number', 'кг', 50, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Силовые показатели и 1ПМ', 'Взятие на грудь', 'clean_1rm', 'number', 'кг', 60, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Силовые показатели и 1ПМ', 'Становая тяга', 'deadlift_1rm', 'number', 'кг', 70, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Силовые показатели и 1ПМ', 'Жим лёжа', 'bench_press_1rm', 'number', 'кг', 80, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Силовые показатели и 1ПМ', 'Строгий жим стоя', 'strict_press_1rm', 'number', 'кг', 90, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Силовые показатели и 1ПМ', 'Толчковый швунг', 'push_jerk_1rm', 'number', 'кг', 100, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Гимнастика и выносливость', 'Максимум строгих подтягиваний', 'strict_pullups_max', 'number', 'раз', 110, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Гимнастика и выносливость', 'Гребля 1 км', 'row_1k', 'text', NULL, 120, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Гимнастика и выносливость', 'Бег 5 км', 'run_5k', 'text', NULL, 130, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Гимнастика и выносливость', 'Бег 10 км', 'run_10k', 'text', NULL, 140, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer']::TEXT[]),
  ('Навыки и ограничения', 'Цель атлета', 'athlete_goal', 'textarea', NULL, 150, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer','client']::TEXT[]),
  ('Навыки и ограничения', 'Травмы и ограничения', 'injuries_and_limits', 'textarea', NULL, 160, ARRAY['admin','trainer','client']::TEXT[], ARRAY['admin','trainer','client']::TEXT[]),
  ('Навыки и ограничения', 'Заметка тренера', 'trainer_note', 'textarea', NULL, 170, ARRAY['admin','trainer']::TEXT[], ARRAY['admin','trainer']::TEXT[])
ON CONFLICT (field_key) DO NOTHING;
