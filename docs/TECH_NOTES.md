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

## Sub-permissions расписания

`canManageSchedule` разбит на sub-permissions:

- `schedule_view`
- `schedule_edit`
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
