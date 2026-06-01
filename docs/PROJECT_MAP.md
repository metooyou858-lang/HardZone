# HardZone Project Map

Этот файл - общий вход для Codex, Claude и человека. Перед крупными правками сначала прочитать его, затем профильный документ из `docs/`.

## Текущее состояние

HardZone - monorepo CRM для CrossFit-клуба:

- `frontend/` - Next.js App Router, TypeScript, Tailwind CSS.
- `backend/` - Node.js, Express, PostgreSQL.
- `backend/src/db/migrations/` - SQL-миграции, применяются через `npm run migrate`.
- `deploy.ps1` - Windows wrapper для `deploy.sh`.
- `deploy.sh` - деплой на production `79.137.162.55:/srv/HardZone`.
- `swagger (3).json` - каноничная локальная Swagger-документация AQSI по кассе и кассовым операциям.
- `docs/STABILIZATION_PLAN.md` - план стабилизации проекта.
- `docs/COMMANDS.md` - короткая шпаргалка команд для человека.
- `HardZone_CRM_Документ_v4.1.md` - каноничный проектный документ. Копии из `frontend/` и `backend/` удалены, чтобы агенты не читали устаревшие дубли.

## Production

- Сервер: `79.137.162.55`.
- SSH user: `root`.
- SSH key: `~/.ssh/hardzone_deploy`.
- App user на сервере: `app`.
- Путь: `/srv/HardZone`.
- Backend PM2: `inventory-backend`.
- Frontend PM2: `hardzone-frontend`.

Старый адрес `80.66.87.178` не использовать без прямой просьбы.

## Фактическое сравнение с целевой схемой

| Слой | Что уже есть | Что не хватает / риск | Следующий шаг |
| --- | --- | --- | --- |
| Git | Репозиторий есть, `.gitignore` закрывает `.env`, `node_modules`, `.next` | `main` сейчас указывает на исчезнувший `origin/main`; много незакоммиченных файлов | Настроить живой remote/upstream и зафиксировать инфраструктурный слой отдельным коммитом |
| Структура | Frontend/backend разделены, монорепа понятная | README был слишком короткий | Держать карту проекта в `docs/PROJECT_MAP.md` |
| Env | Реальные `.env` исключены из Git | Не было `.env.example` | Поддерживать `backend/.env.example` и `frontend/.env.example` |
| Деплой | Есть `deploy.ps1` и `deploy.sh`, PM2-процессы известны | Скрипты были не зафиксированы в Git; нет единого post-deploy checklist | См. `docs/OPERATIONS.md` |
| БД | Есть SQL-миграции и `schema_migrations` | Нужно не делать ручных ALTER в production без миграции | Любое изменение схемы - новый SQL в `backend/src/db/migrations/` |
| Проверки | Есть `npm run build`, `npm run lint`, backend `/health`, проверка mojibake через `rg` | Нет единого smoke-check скрипта | Пока использовать команды из `docs/WORKFLOW.md` |
| Оплаты | AQSI flow вынесен в `docs/PAYMENTS.md`, код разнесен по service/routes/UI | Высокий риск регрессий при точечных изменениях | Перед правками читать `docs/PAYMENTS.md` и сверять Swagger |
| Документы | Общие docs вынесены в `docs/`; `AGENTS.md` и `CLAUDE.md` стали короткими указателями | Исторические `HardZone_CRM_Документ_v3.1.md` и `v4.md` пока оставлены как архив | Не добавлять новые дубли, обновлять каноничные docs |

## Критичные области

- AQSI/оплаты: `backend/src/services/aqsi.js`, `backend/src/services/aqsi-v4-flow.js`, `backend/src/routes/aqsi-v4.js`, `backend/src/routes/orders.js`, `frontend/components/sales/`.
- Расписание и списание посещений: `backend/src/routes/schedule.js`, `frontend/components/schedule/`.
- Права доступа: `backend/src/authz.js`, `frontend/lib/access.ts`, настройки пользователей.
- Кодировки русского текста: любые `.md`, `.ts`, `.tsx`, `.js`, `.json` с кириллицей.

## Правило для агентов

1. Не переписывать большие участки без явной задачи.
2. Перед изменением оплаты сверять payload/endpoint с `swagger (3).json`.
3. Для ручных правок использовать `apply_patch`, не PowerShell redirection.
4. После фронтенд-правок проверять `rg "Рџ|Ð|Ñ|�" frontend`.
5. Если нужно деплоить с Windows, запускать `deploy.ps1`, а не ручные `npm`/`pm2` под root.
6. Долгосрочные улучшения вести через `docs/STABILIZATION_PLAN.md`.
7. Push в GitHub `origin` не деплоит production. Push в remote `server` запускает production hook, поэтому не использовать его случайно.
