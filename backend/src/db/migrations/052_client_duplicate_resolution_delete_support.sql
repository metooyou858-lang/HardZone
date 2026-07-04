DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT tc.constraint_name
    INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON kcu.constraint_name = tc.constraint_name
   AND kcu.table_schema = tc.table_schema
   AND kcu.table_name = tc.table_name
  WHERE tc.table_name = 'client_duplicate_resolutions'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'duplicate_client_id'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE client_duplicate_resolutions DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;
