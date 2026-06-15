ALTER TABLE product_subscription_params
  ADD COLUMN IF NOT EXISTS allow_free_visit BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_group_training BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_personal_training BOOLEAN NOT NULL DEFAULT false;

UPDATE product_subscription_params psp
SET
  allow_free_visit = (
    lower(p.name) LIKE '%свобод%'
    OR lower(p.name) LIKE '%зал%'
    OR lower(p.name) LIKE '%open gym%'
  ),
  allow_personal_training = (
    lower(p.name) LIKE '%персон%'
    OR lower(p.name) LIKE '%сплит%'
  ),
  allow_group_training = NOT (
    lower(p.name) LIKE '%свобод%'
    OR lower(p.name) LIKE '%зал%'
    OR lower(p.name) LIKE '%open gym%'
    OR lower(p.name) LIKE '%персон%'
    OR lower(p.name) LIKE '%сплит%'
  )
FROM products p
WHERE p.id = psp.product_id;
