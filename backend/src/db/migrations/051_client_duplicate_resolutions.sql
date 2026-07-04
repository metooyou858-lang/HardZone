CREATE TABLE IF NOT EXISTS client_duplicate_resolutions (
  id BIGSERIAL PRIMARY KEY,
  group_key TEXT NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('phone', 'name')),
  master_client_id BIGINT NOT NULL REFERENCES clients(id),
  duplicate_client_id BIGINT NOT NULL REFERENCES clients(id),
  resolution TEXT NOT NULL DEFAULT 'master_selected' CHECK (resolution IN ('master_selected', 'not_duplicate')),
  note TEXT,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (master_client_id <> duplicate_client_id),
  UNIQUE (duplicate_client_id)
);

CREATE INDEX IF NOT EXISTS idx_client_duplicate_resolutions_master
  ON client_duplicate_resolutions(master_client_id);

CREATE INDEX IF NOT EXISTS idx_client_duplicate_resolutions_group
  ON client_duplicate_resolutions(group_key, group_type);
