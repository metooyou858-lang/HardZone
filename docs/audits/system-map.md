---
status: partial
source: backend/src, frontend, docs
date: 2026-07-11
---

# Карта систем HardZone CRM

## Главный принцип

```text
PostgreSQL
    ↑
Express backend — бизнес-правила и авторизация
    ↑
├─ Next.js CRM
├─ Telegram staff bot / Mini App
├─ Telegram client bot / Mini App
└─ будущий MAX-клиент
```

CRM/backend является источником правды. Telegram и frontend не должны иметь отдельные правила абонементов, посещений, расписания или клиентов.

## Основные разделы

| Раздел | Backend | Frontend | Ключевые данные | Риск |
| --- | --- | --- | --- | --- |
| Авторизация и доступ | `auth.js`, `authz.js`, middleware | login, session proxy, admin users | `users`, grants/revokes | высокий |
| Клиенты | `routes/clients.js` | clients, client card | `clients`, duplicate resolutions | высокий |
| Расписание | `routes/schedule.js`, `routes/bookings.js` | schedule | slots, bookings, gym hours | высокий |
| Абонементы/посещения | subscription/attendance services | client card, schedule | subscriptions, visits, freezes | высокий |
| Telegram | `routes/telegram.js`, `routes/staff.js`, bot services, pollers | two Mini Apps | users/clients + schedule | высокий |
| Продажи/AQSI | orders, sales, AQSI services | sales | orders, operations, receipts | критический |
| Услуги | products, training types | services/settings | products and access rules | высокий |
| Аналитика | analytics route | analytics | orders, expenses, payroll | средний |
| Склад | products/inventories | warehouse | products, inventory | средний |
| Operations | deploy/smoke/backup scripts | — | PM2, PostgreSQL, nginx | критический |

## Сквозные зависимости

- Клиентская запись зависит от клиента, слота, вместимости, клубного времени и правил абонемента.
- Посещение зависит от существующей записи и повторной проверки абонемента в момент прихода.
- Telegram staff наследует права `users`; связь с `trainers` не выдаёт доступ.
- Telegram client использует отдельную идентичность `clients.telegram_id` и не входит в CRM.
- Продажа абонемента связывает AQSI/заказ, клиента, услугу и последующее право посещения.
- Аналитика должна читать операционные данные, но не становиться вторым источником финансовых правил.

## Текущий приоритет аудитов

1. Telegram — проведён.
2. Клиенты/дубли — следующий из-за legacy `phone_normalized`.
3. Расписание/абонементы — высокий риск реальных списаний и вместимости.
4. Продажи/AQSI — отдельный аудит только со Swagger и `docs/PAYMENTS.md`.
5. Доступы — повторная проверка frontend cookie/session flow.
