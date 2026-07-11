---
status: verified
source: backend/src/routes/telegram.js, backend/src/routes/staff.js, backend/src/services/telegram-*.js, frontend/components/telegram
date: 2026-07-11
---

# Аудит Telegram HardZone

## Контуры

### Staff

- Бот: `TELEGRAM_BOT_TOKEN`.
- Poller: `hardzone-telegram-poller`.
- Mini App: `/telegram/trainer`.
- Идентичность: `users.telegram_id`.
- Права: CRM role + `module_grants`/`module_revokes`.
- Карточка тренера: отдельная сущность `trainers`, связь `trainers.user_id` сама права не выдаёт.

### Client

- Бот: `TELEGRAM_CLIENT_BOT_TOKEN`.
- Poller: `hardzone-telegram-client-poller`.
- Mini App: `/telegram/client`.
- Идентичность: `clients.telegram_id`.
- Клиент видит только данные найденной по Telegram ID карточки.

## Авторизация

1. Telegram передаёт подписанный `initData`.
2. Backend проверяет HMAC, `auth_date`, допустимый возраст и наличие user ID.
3. Staff ищется в активных `users`; client — в активных `clients`.
4. Уже привязанный пользователь не подтверждает телефон повторно.
5. Новая привязка разрешена только через Telegram `request_contact`.
6. `contact.user_id` обязан совпадать с отправителем сообщения.
7. Ручные Mini App endpoints телефонной привязки возвращают `403` и не раскрывают наличие номера.

## Клиентский booking flow

```text
signed initData
  → client by telegram_id
  → active group slot
  → Asia/Vladivostok start boundary
  → expire stale subscriptions
  → find eligible subscription
  → check capacity and duplicate booking
  → create confirmed booking
  → pending coverage or explicit unpaid/no_subscription
```

Отмена разрешена только владельцу записи, до начала занятия и до отметки прихода. При отмене запись удаляется, `booked_count` уменьшается.

## Polling

- Webhook удаляется перед polling.
- Ошибка startup больше не завершает процесс: применяется retry.
- `429` использует Telegram `retry_after`, максимум 5 минут.
- Сетевые/502 ошибки используют fallback 5 секунд.
- Ошибка одного update логируется и не останавливает цикл.

## Производительность

- Telegram photo synchronization не блокирует client login.
- Client payload при login строится один раз.
- Исторически payload достигал примерно 128 КБ; дальнейшая декомпозиция ответа остаётся возможной оптимизацией.

## Покрытые регрессии

- HMAC, tampering, stale/future `initData`.
- Staff/client захват аккаунта ручным вводом известного телефона.
- Собственный и чужой Telegram contact.
- Вход уже привязанного клиента.
- Создание неоплаченной записи без абонемента.
- Изоляция отмены по клиентской идентичности.
- Восстановление вместимости после отмены.
- `429 retry_after` и malformed/502 fallback.
- Asia/Vladivostok conversion.

## Известные пробелы

- Legacy-клиенты с заполненным `phone`, но пустым `phone_normalized` могут породить дубль. Отдельная задача есть в `STABILIZATION_PLAN.md`.
- Нужны отдельные client integration tests профиля, athlete profile, отзывов и истёкшего абонемента при attendance.
- `routes/telegram.js` остаётся крупным; вынесены init-data, API error/retry и club-time, остальная декомпозиция продолжается постепенно.
- Нужна политика retention/маскирования Telegram ID в логах.

## Что изменит выводы аудита

Повторить аудит при изменении любого из файлов:

- `backend/src/routes/telegram.js`;
- `backend/src/routes/staff.js`;
- `backend/src/services/telegram-bot.js`;
- `backend/src/services/telegram-client-bot.js`;
- обоих poller-файлов;
- Telegram Mini App frontend;
- миграций `users.telegram_id`, `clients.telegram_id`, phone identity;
- booking/subscription access services.
