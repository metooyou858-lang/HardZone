ALTER TABLE training_types
  ADD COLUMN IF NOT EXISTS slot_type slot_type NOT NULL DEFAULT 'group';

CREATE INDEX IF NOT EXISTS idx_training_types_slot_type ON training_types(slot_type);
