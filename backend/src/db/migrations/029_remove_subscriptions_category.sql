-- Убираем категорию "Абонементы": продукты переходят в null (отображаются в "Услуги")
UPDATE products
SET category_id = NULL
WHERE category_id = (SELECT id FROM categories WHERE name = 'Абонементы');

DELETE FROM categories WHERE name = 'Абонементы';
