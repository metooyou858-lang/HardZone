-- Adds a separate permission for manually creating legacy subscriptions
-- without sales, payments, receipts, or AQSI operations.

UPDATE users
SET module_revokes = (
  SELECT ARRAY(
    SELECT DISTINCT permission
    FROM unnest(
      COALESCE(module_revokes, '{}'::TEXT[]) ||
      ARRAY['clients_legacy_subscriptions']::TEXT[]
    ) AS permission
    ORDER BY permission
  )
)
WHERE role != 'owner'
  AND (
    'clients' = ANY(COALESCE(module_revokes, '{}'::TEXT[]))
    OR role_title = 'Дежурный тренер'
    OR role_title = 'Р”РµР¶СѓСЂРЅС‹Р№ С‚СЂРµРЅРµСЂ'
  );
