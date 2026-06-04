BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS phone_normalized TEXT,
  ADD COLUMN IF NOT EXISTS telegram_id TEXT;

UPDATE users u
SET phone = COALESCE(NULLIF(u.phone, ''), NULLIF(t.phone, ''))
FROM trainers t
WHERE t.user_id = u.id
  AND NULLIF(t.phone, '') IS NOT NULL
  AND NULLIF(u.phone, '') IS NULL;

UPDATE users
SET phone_normalized = CASE
  WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = '' THEN NULL
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 10
    THEN '7' || regexp_replace(phone, '\D', '', 'g')
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 11
    AND regexp_replace(phone, '\D', '', 'g') LIKE '8%'
    THEN '7' || substring(regexp_replace(phone, '\D', '', 'g') from 2)
  ELSE regexp_replace(phone, '\D', '', 'g')
END
WHERE phone IS NOT NULL;

UPDATE clients
SET phone_normalized = CASE
  WHEN regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = '' THEN NULL
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 10
    THEN '7' || regexp_replace(phone, '\D', '', 'g')
  WHEN length(regexp_replace(phone, '\D', '', 'g')) = 11
    AND regexp_replace(phone, '\D', '', 'g') LIKE '8%'
    THEN '7' || substring(regexp_replace(phone, '\D', '', 'g') from 2)
  ELSE regexp_replace(phone, '\D', '', 'g')
END
WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_phone_normalized
  ON users(phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_phone_normalized
  ON clients(phone_normalized)
  WHERE phone_normalized IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_telegram_id_unique
  ON clients(telegram_id)
  WHERE telegram_id IS NOT NULL;

COMMIT;
