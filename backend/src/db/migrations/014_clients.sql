CREATE TYPE client_status AS ENUM (
  'active',
  'away',
  'frozen',
  'inactive'
);

CREATE TYPE subscription_type AS ENUM (
  'single',
  'visits',
  'period',
  'unlimited'
);

CREATE TYPE subscription_status AS ENUM (
  'active',
  'frozen',
  'expired',
  'exhausted'
);

CREATE TABLE clients (
  id              BIGSERIAL PRIMARY KEY,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  middle_name     TEXT,
  phone           TEXT,
  email           TEXT,
  birth_date      DATE,
  barcode         TEXT UNIQUE,
  discount        NUMERIC(5,2) DEFAULT 0,
  status          client_status NOT NULL DEFAULT 'active',
  status_comment  TEXT,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_subscriptions (
  id              BIGSERIAL PRIMARY KEY,
  client_id       BIGINT NOT NULL REFERENCES clients(id),
  type            subscription_type NOT NULL,
  visits_total    INTEGER,
  visits_left     INTEGER,
  started_at      DATE,
  expires_at      DATE,
  is_family       BOOLEAN NOT NULL DEFAULT false,
  status          subscription_status NOT NULL DEFAULT 'active',
  order_id        UUID REFERENCES orders(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscription_freezes (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES client_subscriptions(id),
  frozen_at       DATE NOT NULL,
  unfrozen_at     DATE,
  days_frozen     INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN unfrozen_at IS NULL THEN NULL
      ELSE unfrozen_at - frozen_at
    END
  ) STORED,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_visits (
  id              BIGSERIAL PRIMARY KEY,
  client_id       BIGINT NOT NULL REFERENCES clients(id),
  subscription_id BIGINT REFERENCES client_subscriptions(id),
  visit_type      TEXT NOT NULL CHECK (visit_type IN ('group', 'open_gym')),
  visited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schedule_id     BIGINT,
  created_by      TEXT
);

CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_clients_barcode ON clients(barcode);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_subscriptions_client ON client_subscriptions(client_id);
CREATE INDEX idx_subscriptions_status ON client_subscriptions(status);
CREATE INDEX idx_visits_client ON client_visits(client_id);
CREATE INDEX idx_visits_date ON client_visits(visited_at DESC);
