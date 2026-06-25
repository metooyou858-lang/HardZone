# HardZone Technical Notes

Этот файл хранит технические решения, которые нужны агентам при сопровождении проекта.

## Навигация

В `frontend/components/app-shell.tsx` для внутренних переходов используется Next.js `<Link>`, чтобы CRM не перезагружала весь документ при навигации между разделами. Для рабочих переходов есть fallback: если client-side переход не сменил route за короткое время, shell выполняет обычный document navigation. Это защищает от зависаний роутера и `ChunkLoadError` в открытых вкладках после frontend-деплоя. Гипотеза с `useSearchParams()` на `/sales` проверена и не решила проблему; query-параметры всё равно читаются в `frontend/app/sales/page.tsx` и передаются в `SalesPage` пропсами.

## Честный Знак / DataMatrix

Нормализация кода есть в двух местах:

- Frontend: `normalizeMarkingInput()` в `frontend/components/sales/sales-marking-utils.ts`.
- Backend: `normalizeMarkingCode()` / `parseMarkingCode()` в `backend/src/routes/orders.js`.

Функции вставляют GS (`0x1D`) перед крипто-хвостом `91`/`92`/`93`, конвертируют русскую раскладку, убирают AIM-префикс `]d2`, заменяют текстовые представления GS.

## Расписание и транзакции

Операции со списанием/возвратом посещений должны быть транзакционными:

- отмена слота: отмена записи + возврат `visits_left`;
- удаление визита зала: удаление + возврат `visits_left`;
- посещение без списания не должно увеличивать `visits_left` при откате.

Единая точка правил абонемента: `backend/src/services/subscription-access.js`.

- `assertSubscriptionAccess` проверяет актуальный статус, остаток посещений, право свободного посещения / групповых / персональных тренировок и ограничения по видам тренировок.
- `chargeSubscriptionVisit` списывает посещение через эти правила.
- `refundSubscriptionVisit` возвращает посещение и восстанавливает `active`, если абонемент был `exhausted` и срок ещё действителен.
- Новые маршруты расписания, CRM, staff и Telegram не должны писать собственный decrement/increment `visits_left`; они должны вызывать этот сервис.
- `expireActiveSubscriptions` закрывает активные абонементы не только по истекшему `expires_at`, но и по нулевому остатку занятий для `single` / `visits`.
- `POST /api/products/:id/subscription-params` нормализует связи с видами тренировок: свободное посещение не хранит `product_training_types`, групповой доступ принимает только `slot_type = group`, персональный - только `slot_type = personal`.
- `bookings`, `staff/bookings`, `schedule/open-gym/check-in`, Telegram staff/client и будущий MAX должны идти через общий backend-контур записи и посещений; UI может фильтровать список, но не является источником допуска.

### Единый контур записи и посещения

Запись, прибытие и покрытие оплаты должны храниться отдельно:

- `booking.status` отвечает за состояние записи: записан, пришел, не пришел, отменен;
- статус покрытия отвечает за оплату/абонемент: покрыто абонементом, к оплате, без списания, ошибка покрытия;
- причина покрытия должна объяснять оператору, почему нет списания: нет абонемента, истек срок, закончились посещения, не тот формат, не тот вид тренировки, ручной пропуск.

Новые и изменяемые маршруты не должны реализовывать собственные версии `createBooking`, `markBookingAsAttended`, списания, возврата или поиска подходящего абонемента. CRM, staff API, Telegram/MAX и свободное посещение обязаны вызывать один общий сервис.

Списание происходит только при подтверждении прибытия, а не при создании записи. Если клиент не пришел, абонемент не списывается.

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

## Профиль атлета клиента

Спортивные поля карточки клиента не добавляются отдельными колонками в `clients` и не хардкодятся в JSX.

- Описание полей хранится в `client_athlete_profile_fields`: раздел, название, тип, единица, порядок, видимость и права редактирования.
- Разделы профиля хранятся отдельно в `client_athlete_profile_sections`; поле выбирает раздел через `section_id`.
- Значения по клиентам хранятся в `client_athlete_profile_values`.
- Настройка полей находится в CRM: Настройки -> Профиль атлета.
- Карточка клиента читает `athlete_profile` из `GET /api/clients/:id` и сохраняет значения через `PATCH /api/clients/:id/athlete-profile`.
- `visible_to` и `editable_by` фильтруются backend по реальным ролям доступа: `admin` определяется административным клиентским доступом (`clients_update`, `users_manage`, owner), `trainer` — связанным активным профилем тренера или расписательными правами.
- Если поле временно не нужно, его лучше скрывать через `is_active = false`. Удаление поля доступно в настройках и каскадно удаляет сохраненные значения этого показателя у клиентов.

## Frontend load performance

Global layout must not load third-party runtime scripts that are only needed by a narrow route group.

- Telegram Web App SDK is loaded lazily by `frontend/components/telegram/telegram-web-app-script.ts`, only from Telegram Mini App pages.
- `frontend/app/layout.tsx` imports fontsource subsets explicitly instead of broad weight files: keep CRM fonts limited to the actually used `cyrillic` and `latin` subsets.
- After changing global layout imports, run `cd frontend; npm run build` and check `.next/static/media` / `.next/static/chunks` for accidental large global assets.
