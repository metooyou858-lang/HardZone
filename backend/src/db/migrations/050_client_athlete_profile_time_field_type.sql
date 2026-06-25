ALTER TABLE client_athlete_profile_fields
  DROP CONSTRAINT IF EXISTS client_athlete_profile_fields_field_type_check;

ALTER TABLE client_athlete_profile_fields
  ADD CONSTRAINT client_athlete_profile_fields_field_type_check
  CHECK (field_type IN ('text', 'textarea', 'number', 'time', 'date', 'boolean', 'select', 'multiselect'));

UPDATE client_athlete_profile_fields
SET field_type = 'time',
    updated_at = NOW()
WHERE field_key IN ('row_1k', 'run_5k', 'run_10k')
  AND field_type = 'text';
