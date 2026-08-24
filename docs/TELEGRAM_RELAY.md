# Telegram API relay

## Зачем нужен

Production VPS `79.137.162.55` периодически теряет прямой TCP-маршрут до сети Telegram. Relay в Cloudflare Workers используется только как исходящий транспорт Bot API; CRM, AQSI, PostgreSQL и пользовательский Mini App через него не направляются.

## Контракт

- Health: `GET /health` → `200 {"status":"ok"}`.
- Bot API: `POST /bot{token}/{method}`.
- Авторизация: заголовок `x-hardzone-telegram-relay` должен совпадать с Worker secret `RELAY_SECRET`.
- Разрешены только пути формата Telegram Bot API; произвольный upstream URL передать нельзя.
- Тело и `Content-Type` передаются Telegram без преобразования, поэтому поддерживаются JSON и multipart-запросы.
- Ответ Telegram возвращается с исходным HTTP-статусом и `Content-Type`; кеширование запрещено.

## Production-переменные

```text
TELEGRAM_API_BASE=https://hardzone-telegram-relay.metooyou-858.workers.dev/bot
TELEGRAM_RELAY_SECRET=<strong-random-secret>
```

Тот же секрет хранится в Cloudflare Worker как encrypted secret `RELAY_SECRET`. Значения секретов не выводить в логи и не коммитить.

## Повторы и тайм-ауты

Worker сам не повторяет запросы, чтобы не дублировать отправку сообщений. Повторное подключение и long polling остаются ответственностью существующих Telegram poller-процессов.

## Проверка и откат

1. `GET /health` отвечает `200` с VPS.
2. `getMe` через relay успешно отвечает для обоих ботов.
3. Оба poller-процесса показывают `poller_started` без новых `poll_failed`.
4. В реальном чате проверены `/start`, reply-клавиатура и открытие Mini App.

Для отката удалить `TELEGRAM_API_BASE` и `TELEGRAM_RELAY_SECRET` из production env и перезапустить только два Telegram poller-процесса.
