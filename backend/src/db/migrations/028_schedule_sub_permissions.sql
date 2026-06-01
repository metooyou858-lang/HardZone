BEGIN;

-- Пользователям у которых schedule отозван — отзываем и все суб-права расписания,
-- чтобы они не получили их по умолчанию после добавления в ALL_MODULES.
UPDATE users
SET module_revokes = (
  SELECT ARRAY(
    SELECT DISTINCT unnest
    FROM unnest(
      module_revokes || ARRAY[
        'schedule_edit_groups',
        'schedule_edit_personal',
        'schedule_cancel',
        'schedule_clients',
        'schedule_attendance',
        'schedule_gym'
      ]::TEXT[]
    )
    ORDER BY 1
  )
)
WHERE 'schedule' = ANY(module_revokes);

COMMIT;
