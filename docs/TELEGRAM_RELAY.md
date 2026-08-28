# Telegram API relay

## Зачем нужен

Production VPS `79.137.162.55` периодически теряет прямой TCP-маршрут до сети Telegram. Relay в Cloudflare Workers используется только как исходящий транспорт Bot API; CRM, AQSI, PostgreSQL и пользовательский Mini App через него не направляются.

## Контракт

- Health: `GET /health` → `200 {"status":"ok"}`.
- Bot API: `POST /bot{token}/{method}`.
- Авторизация: заголовок `x-hardzone-telegram-relay` должен совпадать с Worker secret `RELAY_SECRET`.
- Разрешены только пути формата Telegram Bot API; произвольный upstream URL передать нельзя.
- Worker сначала полностью принимает тело запроса, затем передаёт его Telegram вместе с исходным `Content-Type`; это обязательно для стабильного long polling и поддерживает JSON и multipart-запросы.
- Ответ Telegram возвращается с исходным HTTP-статусом и `Content-Type`; кеширование запрещено.

## Production-переменные

```text
TELEGRAM_API_BASE=https://hardzone-telegram-relay.metooyou-858.workers.dev/bot
TELEGRAM_RELAY_SECRET=<strong-random-secret>
```

Тот же секрет хранится в Cloudflare Worker как encrypted secret `RELAY_SECRET`. Значения секретов не выводить в логи и не коммитить.

## Повторы и тайм-ауты

Worker сам не повторяет запросы, чтобы не дублировать отправку сообщений. Повторное подключение и long polling остаются ответственностью существующих Telegram poller-процессов.

Нельзя передавать `request.body` в Telegram как незавершённый поток. На production это приводило к тому, что пустой `getUpdates` не завершался после заданных 25 секунд и обрывался локальным тайм-аутом. Worker использует `await request.arrayBuffer()` перед upstream-запросом.

## Деплой Worker

```powershell
cd infrastructure/cloudflare/telegram-relay
npx wrangler deploy
npx wrangler secret put RELAY_SECRET
```

Для Wrangler достаточно OAuth-разрешений `account:read`, `user:read` и `workers_scripts:write`. Не выдавать ему доступ к DNS, D1, KV, Pages, AI и другим сервисам, которые relay не использует.

После изменения production env или кода Telegram-сервисов перезапускать все активные poller-процессы. Если изолированный тестовый бот развёрнут, он также должен подхватить relay-настройки:

```bash
sudo -u app env PM2_HOME=/home/app/.pm2 pm2 restart hardzone-telegram-poller hardzone-telegram-client-poller --update-env
sudo -u app env PM2_HOME=/home/app/.pm2 pm2 restart hardzone-test-client-bot --update-env
sudo -u app env PM2_HOME=/home/app/.pm2 pm2 save
```

## Привязка клиента

- Непривязанный клиент запускает бота командой `/start` и отправляет номер только системной кнопкой `request_contact`.
- Backend принимает контакт только при совпадении `contact.user_id` и `message.from.id`.
- Если в CRM есть ровно одна активная карточка с этим номером и она не занята другим Telegram, привязывается существующая карточка.
- Если карточки нет, создаётся новый активный клиент, после чего Mini App требует заполнить профиль.
- Дубликат номера или привязка карточки к другому Telegram блокируют автоматическое связывание.
- Ручной ввод телефона в Mini App не используется и endpoint привязки отвечает `410`.

## Проверка и откат

1. `GET /health` отвечает `200` с VPS.
2. `getMe` через relay успешно отвечает для обоих ботов.
3. Оба poller-процесса показывают `poller_started` без новых `poll_failed`.
4. В реальном чате проверены `/start`, reply-клавиатура и открытие Mini App.

Production-приёмка 24 августа 2026 года:

- Worker `hardzone-telegram-relay` развёрнут на `hardzone-telegram-relay.metooyou-858.workers.dev`;
- запрос без секретного заголовка получает `404`;
- `getMe` успешно выполнен для staff- и client-бота;
- оба poller-процесса выдержали полный цикл long polling без ошибок;
- техническое сообщение с reply-клавиатурой доставлено в реальный клиентский чат;
- контролируемое обнуление `clients.telegram_id` восстановилось через подтверждённый Telegram-контакт в ту же карточку, без создания дубля;
- production smoke сохранил работоспособность backend и frontend.

Для отката вернуть `TELEGRAM_API_BASE=https://api.telegram.org/bot`, удалить `TELEGRAM_RELAY_SECRET` из production env и перезапустить только два Telegram poller-процесса. Такой откат восстанавливает прямой маршрут, но не поможет, пока VPS не может соединиться с Telegram API.
