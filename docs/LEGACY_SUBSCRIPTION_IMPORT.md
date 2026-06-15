# Legacy Subscription Import

Purpose: move active/remaining subscriptions from the old CRM into HardZone without creating orders, payments, receipts, or AQSI operations.

For one client at a time, use the client card action `Старый абонемент`. It requires the separate permission `clients_legacy_subscriptions`.

## Safety Rules

- Import writes directly to `client_subscriptions`.
- Manual legacy creation from a client card also writes directly to `client_subscriptions`.
- Imported rows are marked with:
  - `legacy_import_batch_id`
  - `legacy_source = legacy_crm`
  - `legacy_note`
- Manually created legacy subscriptions are marked with `legacy_source = manual_legacy`.
- The import UI must run preview first. Preview does not mutate data.
- Confirm imports only rows without errors.
- If a client already has an actually valid active subscription, an active legacy row is blocked as a conflict.
- A batch can be rolled back through `DELETE /api/subscriptions/legacy-import/:batchId` only while imported subscriptions have no visits.

## CSV Columns

Supported client match columns:

- `client_id` / `ID клиента`
- `phone` / `Телефон`
- `email` / `Email`
- `last_name` + `first_name` / `Фамилия` + `Имя`

Supported subscription columns:

- `type` / `Тип` / `Тип абонемента`
  - supported values: `single`, `visits`, `period`, `unlimited`
  - Russian text is also inferred: разовый, посещения, период, месяц, безлимит
- `visits_total` / `Всего посещений`
- `visits_left` / `Остаток` / `Осталось посещений`
- `started_at` / `Дата начала`
- `expires_at` / `Дата окончания` / `Действует до`
- `status` / `Статус`
  - supported values: `active`, `frozen`, `expired`, `exhausted`
  - if omitted, status is inferred from date and remaining visits
- `is_family` / `Семейный`
- `product_id` / `ID услуги`
- `product_name` / `Услуга` / `Название абонемента`
- `note` / `Комментарий` / `Примечание`

Dates may be `YYYY-MM-DD` or `DD.MM.YYYY`.
