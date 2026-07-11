---
status: partial
source: backend/test
date: 2026-07-11
---

# Матрица критических тестов HardZone

## Запуск

Источник правды для backend/integration:

```powershell
.\scripts\test-backend-remote.ps1
```

Тесты используют временную PostgreSQL на сервере/CI, применяют все миграции и удаляют БД после выполнения.

## Telegram

| Критический путь | Покрытие | Файл |
| --- | --- | --- |
| Staff login с подписанным initData | covered | `backend/test/auth.test.js` |
| Подмена initData | covered | `auth.test.js`, `telegram-init-data.test.js` |
| Старый/будущий initData | covered | `telegram-init-data.test.js` |
| Ручной захват staff по телефону | covered | `auth.test.js` |
| Ручной захват client по телефону | covered | `auth.test.js` |
| Собственный/чужой Telegram contact | covered | `auth.test.js` |
| Вход привязанного клиента | covered | `auth.test.js` |
| Client booking без абонемента | covered | `auth.test.js` |
| Чужая отмена записи | covered | `auth.test.js` |
| Отмена и возврат вместимости | covered | `auth.test.js` |
| Telegram 429/502 retry | covered | `telegram-api-error.test.js` |
| Владивостокское время | covered | `club-time.test.js` |
| Client profile update | missing | proposed: `telegram-client-profile.test.js` |
| Athlete profile visibility/update | missing | proposed: `telegram-client-profile.test.js` |
| Trainer reviews | missing | proposed: `telegram-client-reviews.test.js` |
| Истёкший абонемент при attendance | partial | staff coverage exists; client-origin booking edge missing |
| Карточки/кнопки классического бота | partial | contact handler covered; render snapshots missing |

## Другие существующие области

| Раздел | Тесты | Состояние |
| --- | --- | --- |
| Access model и staff API | `access-model.test.js`, `auth.test.js` | good backend coverage |
| Поиск клиентов | `client-search.test.js` | focused unit coverage |
| AQSI recovery/sync | `order-sync.test.js` | focused regression coverage |
| Тренеры | `trainers.test.js` | CRUD/link coverage |
| Frontend cookie/session | — | missing |
| Клиенты/дубли | — | missing |
| Аналитика/payroll | — | missing |
| Backup/restore | scripts | operational smoke, not unit test |

## Правило актуализации

Каждый исправленный production-баг должен получить тест, который падает на старом поведении. Если автоматизация невозможна, добавить ручной сценарий и причину в аудит соответствующего раздела.
