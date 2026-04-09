-- Тип занятия
CREATE TYPE slot_type AS ENUM ('group', 'personal', 'rental');

-- Статус занятия
CREATE TYPE slot_status AS ENUM ('active', 'cancelled', 'completed');

-- Статус записи клиента
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled', 'attended', 'missed');

-- Тренеры
CREATE TABLE trainers (
  id            BIGSERIAL PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  bio           TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Привязка тренера к видам тренировок
CREATE TABLE trainer_training_types (
  trainer_id        BIGINT NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  training_type_id  BIGINT NOT NULL REFERENCES training_types(id) ON DELETE CASCADE,
  PRIMARY KEY (trainer_id, training_type_id)
);

-- Шаблоны регулярных занятий
CREATE TABLE schedule_templates (
  id                    BIGSERIAL PRIMARY KEY,
  slot_type             slot_type NOT NULL DEFAULT 'group',
  training_type_id      BIGINT REFERENCES training_types(id),
  trainer_id            BIGINT REFERENCES trainers(id),
  product_id            BIGINT REFERENCES products(id),
  day_of_week           SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time            TIME NOT NULL,
  duration_minutes      INTEGER NOT NULL DEFAULT 60,
  capacity              INTEGER NOT NULL DEFAULT 20,
  block_if_empty_hours  INTEGER,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Конкретные занятия (слоты)
CREATE TABLE schedule_slots (
  id                    BIGSERIAL PRIMARY KEY,
  template_id           BIGINT REFERENCES schedule_templates(id),
  slot_type             slot_type NOT NULL DEFAULT 'group',
  training_type_id      BIGINT REFERENCES training_types(id),
  trainer_id            BIGINT REFERENCES trainers(id),
  product_id            BIGINT REFERENCES products(id),
  date                  DATE NOT NULL,
  start_time            TIME NOT NULL,
  duration_minutes      INTEGER NOT NULL DEFAULT 60,
  capacity              INTEGER NOT NULL DEFAULT 20,
  booked_count          INTEGER NOT NULL DEFAULT 0,
  status                slot_status NOT NULL DEFAULT 'active',
  is_free               BOOLEAN NOT NULL DEFAULT false,
  block_if_empty_hours  INTEGER,
  comment               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Записи клиентов на занятия
CREATE TABLE bookings (
  id                BIGSERIAL PRIMARY KEY,
  slot_id           BIGINT NOT NULL REFERENCES schedule_slots(id),
  client_id         BIGINT NOT NULL REFERENCES clients(id),
  subscription_id   BIGINT REFERENCES client_subscriptions(id),
  places_count      INTEGER NOT NULL DEFAULT 1,
  status            booking_status NOT NULL DEFAULT 'confirmed',
  booked_by         TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slot_id, client_id)
);

-- Индексы
CREATE INDEX idx_schedule_slots_date ON schedule_slots(date);
CREATE INDEX idx_schedule_slots_template ON schedule_slots(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX idx_schedule_slots_trainer ON schedule_slots(trainer_id) WHERE trainer_id IS NOT NULL;
CREATE INDEX idx_schedule_slots_status ON schedule_slots(status);
CREATE INDEX idx_bookings_slot ON bookings(slot_id);
CREATE INDEX idx_bookings_client ON bookings(client_id);
CREATE INDEX idx_bookings_subscription ON bookings(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_trainers_active ON trainers(is_active);

-- Обновляем client_visits — добавляем FK на slot
ALTER TABLE client_visits
  ADD COLUMN IF NOT EXISTS slot_id BIGINT REFERENCES schedule_slots(id);
