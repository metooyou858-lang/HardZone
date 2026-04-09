-- Виды тренировок
CREATE TABLE training_types (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT DEFAULT '#00BCD4',
  duration    INTEGER,
  capacity    INTEGER,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Параметры абонемента — привязаны к позиции в каталоге (products)
CREATE TABLE product_subscription_params (
  id                  BIGSERIAL PRIMARY KEY,
  product_id          BIGINT NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
  subscription_type   subscription_type NOT NULL DEFAULT 'visits',
  visits_total        INTEGER,
  validity_days       INTEGER,
  activation_type     TEXT NOT NULL DEFAULT 'purchase'
                      CHECK (activation_type IN ('purchase', 'first_visit')),
  freeze_days_allowed INTEGER DEFAULT 0,
  freeze_min_days     INTEGER DEFAULT 1,
  freeze_max_count    INTEGER,
  is_family           BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Привязка абонемента к видам тренировок
-- Если записей нет — абонемент действует на все виды
CREATE TABLE product_training_types (
  product_id       BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  training_type_id BIGINT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, training_type_id)
);

-- Обновляем client_subscriptions — добавляем FK на продукт
ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id);

-- Индексы
CREATE INDEX idx_product_sub_params_product ON product_subscription_params(product_id);
CREATE INDEX idx_product_training_types_product ON product_training_types(product_id);
CREATE INDEX idx_product_training_types_type ON product_training_types(training_type_id);
CREATE INDEX idx_training_types_active ON training_types(is_active);
