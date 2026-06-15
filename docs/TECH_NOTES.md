# HardZone Technical Notes

Этот файл хранит технические решения, которые нужны агентам при сопровождении проекта.

## Навигация

В `frontend/components/app-shell.tsx` используется обычный `<a href="...">` вместо Next.js `<Link>`, потому что client-side router не завершал переход из `/sales`.

## Честный Знак / DataMatrix

Нормализация кода есть в двух местах:

- Frontend: `normalizeMarkingInput()` в `frontend/components/sales/sales-marking-utils.ts`.
- Backend: `normalizeMarkingCode()` / `parseMarkingCode()` в `backend/src/routes/orders.js`.

Функции вставляют GS (`0x1D`) перед крипто-хвостом `91`/`92`/`93`, конвертируют русскую раскладку, убирают AIM-префикс `]d2`, заменяют текстовые представления GS.

## Расписание и транзакции

Операции со списанием/возвратом посещений должны быть транзакционными:

- отмена слота: отмена записи + возврат `visits_left`;
- удаление визита зала: удаление + возврат `visits_left`;
- `skip_subscription` не должен увеличивать `visits_left`.

Единая точка правил абонемента: `backend/src/services/subscription-access.js`.

- `assertSubscriptionAccess` проверяет актуальный статус, остаток посещений, право свободного посещения / групповых / персональных тренировок и ограничения по видам тренировок.
- `chargeSubscriptionVisit` списывает посещение через эти правила.
- `refundSubscriptionVisit` возвращает посещение и восстанавливает `active`, если абонемент был `exhausted` и срок ещё действителен.
- Новые маршруты расписания, CRM, staff и Telegram не должны писать собственный decrement/increment `visits_left`; они должны вызывать этот сервис.

## Sub-permissions расписания

`schedule` дополнен sub-permissions:

- `schedule_edit_groups`
- `schedule_edit_personal`
- `schedule_cancel`
- `schedule_clients`
- `schedule_attendance`
- `schedule_gym`

Миграция: `028_schedule_sub_permissions.sql`.

## Логи

`pm2-logrotate` установлен на сервере под пользователем `app`:

- ротация при 10 MB и каждую ночь в 00:00;
- сжатие в `.gz`;
- хранить 14 файлов.

## Мониторинг системы в CRM

Вкладка: Настройки -> Система, только owner/admin.

- Frontend: `frontend/components/settings/system-status-panel.tsx`.
- Backend: `GET /api/system/status` в `backend/src/routes/system.js`.
- Показывает uptime backend, статус БД, проблемные заказы, последние ERROR-события.
- Буфер ошибок живет в памяти backend (`logger.js -> recentErrors[]`) и сбрасывается при рестарте.

## URL и штрихкоды

Символ `%` в URL ломает barcode lookup. Перед запросом к API штрихкод нужно нормализовать/кодировать.

## Frontend load performance

Global layout must not load third-party runtime scripts that are only needed by a narrow route group.

- Telegram Web App SDK is loaded lazily by `frontend/components/telegram/telegram-web-app-script.ts`, only from Telegram Mini App pages.
- `frontend/app/layout.tsx` imports fontsource subsets explicitly instead of broad weight files: keep CRM fonts limited to the actually used `cyrillic` and `latin` subsets.
- After changing global layout imports, run `cd frontend; npm run build` and check `.next/static/media` / `.next/static/chunks` for accidental large global assets.
