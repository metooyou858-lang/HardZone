# Тестовый клиентский Telegram-бот

## Назначение

Тестовый бот используется для безопасной разработки и приёмки клиентского Telegram Mini App до переноса изменений в основной бот. Он работает на отдельном тестовом токене и открывает отдельный frontend-маршрут, поэтому пользователи основного бота не видят незавершённый интерфейс.

Сам токен не хранится в Git, документации или исходном коде. Он задаётся только через переменные окружения тестового PM2-процесса.

## Границы контура

- Бот: отдельный токен в процессе `hardzone-test-client-bot`.
- Mini App: `https://hardzone.space/telegram/test-client`.
- Frontend: `/srv/HardZone-test-client/frontend`, PM2 `hardzone-test-client-frontend`, локальный порт `3003`.
- API: `/srv/HardZone-test-client/backend`, PM2 `hardzone-test-client-api`, локальный порт `3002`.
- Статические файлы тестовой сборки: `/telegram-test-assets/_next/` и `/telegram-test-assets/media/`.
- Основной frontend `hardzone-frontend`, основной клиентский бот и маршрут `/telegram/client` тестовым деплоем не перезапускаются.

## Данные

Тестовый контур намеренно использует реальную CRM как источник правды. Авторизация, карточки клиентов, абонементы, расписание, записи, посещения, тренеры и штрихкоды читаются через существующий backend-контракт.

Это не песочница данных: запись, отмена записи и отзыв из тестового Mini App изменяют реальные данные CRM. Автоматическая визуальная приёмка должна ограничиваться чтением и безопасными переходами. Изменяющие действия выполняются только на заранее согласованных карточках владельца и сотрудников.

## Переменные окружения

Тестовый бот:

```env
TELEGRAM_CLIENT_BOT_TOKEN=<test-token>
TELEGRAM_CLIENT_MINIAPP_URL=https://hardzone.space/telegram/test-client
TELEGRAM_ENABLED=true
TELEGRAM_POLLING_ENABLED=true
```

Тестовый API и frontend:

```env
TELEGRAM_TEST_API_PORT=3002
TELEGRAM_TEST_BACKEND_API_URL=http://127.0.0.1:3002/api
TELEGRAM_TEST_ASSET_PREFIX=/telegram-test-assets
```

Тестовый токен нельзя подставлять в основной процесс, а основной токен — в тестовый процесс.

## Серверные процессы

```text
hardzone-test-client-bot       отдельный Telegram polling-процесс
hardzone-test-client-api       Telegram client API на 127.0.0.1:3002
hardzone-test-client-frontend  Next.js Mini App на 127.0.0.1:3003
```

Nginx-маршруты тестового контура описаны в `infrastructure/nginx/hardzone-test-client.locations.conf`.

## Проверка после изменений

1. Собрать frontend от пользователя `app` в `/srv/HardZone-test-client/frontend`.
2. Перезапустить только `hardzone-test-client-frontend`.
3. Проверить HTTP 200 для `/telegram/test-client` и тестовых статических файлов.
4. Открыть Mini App через тестового бота и проверить авторизацию на согласованной реальной карточке.
5. Прокликать главную, расписание, тренеров, профиль, пропуск, прогресс и реферальный экран без создания записи.
6. Убедиться, что `hardzone-frontend` и основной бот не перезапускались.

## Перенос в основной бот

Перенос выполняется отдельно после приёмки. Сначала изменения Mini App синхронизируются с основным клиентским маршрутом и проходят сборку, затем обновляется основной frontend. Токены не копируются между процессами: основной бот продолжает использовать свой существующий токен.
