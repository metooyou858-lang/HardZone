BEGIN;

CREATE OR REPLACE FUNCTION normalize_ru_phone(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT CASE
    WHEN regexp_replace(value, '\D', '', 'g') = '' THEN NULL
    WHEN length(regexp_replace(value, '\D', '', 'g')) = 10
      THEN '7' || regexp_replace(value, '\D', '', 'g')
    WHEN length(regexp_replace(value, '\D', '', 'g')) = 11
      AND regexp_replace(value, '\D', '', 'g') LIKE '8%'
      THEN '7' || substring(regexp_replace(value, '\D', '', 'g') FROM 2)
    ELSE regexp_replace(value, '\D', '', 'g')
  END;
$$;

CREATE OR REPLACE FUNCTION set_client_phone_normalized()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone_normalized := normalize_ru_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_normalize_phone ON clients;
CREATE TRIGGER trg_clients_normalize_phone
BEFORE INSERT OR UPDATE OF phone ON clients
FOR EACH ROW
EXECUTE FUNCTION set_client_phone_normalized();

UPDATE clients
SET phone_normalized = normalize_ru_phone(phone)
WHERE phone_normalized IS DISTINCT FROM normalize_ru_phone(phone);

COMMIT;
