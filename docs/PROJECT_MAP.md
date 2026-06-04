# HardZone Project Map

Этот файл - общий вход для Codex, Claude и человека. Перед крупными правками сначала прочитать его, затем профильный документ из `docs/`.

## Текущее состояние

HardZone - monorepo CRM для CrossFit-клуба:

- `frontend/` - Next.js App Router, TypeScript, Tailwind CSS.
- `backend/` - Node.js, Express, PostgreSQL.
- `backend/src/db/migrations/` - SQL-миграции, применяются через `npm run migrate`.
- `deploy.ps1` - Windows wrapper для `deploy.sh`.
- `deploy.sh` - production deploy на `79.137.162.55:/srv/HardZone`.
- `scripts/smoke-local.ps1` - локальный smoke-check.
- `scripts/smoke-production.ps1` - production smoke-check.
- `scripts/smoke-staging.ps1` - staging smoke-check.
- `scripts/backup-production.ps1` - production PostgreSQL backup.
- `scripts/test-restore-production-backup.ps1` - проверка восстановления production backup во временную БД.
- `swagger (3).json` - каноничная локальная Swagger-документация AQSI по кассе и кассовым операциям.
- `docs/STABILIZATION_PLAN.md` - план стабилизации.
- `docs/COMMANDS.md` - короткая шпаргалка команд.
- `docs/OPERATIONS.md` - production, deploy, домен, smoke, backup.
- `docs/BACKUP_RESTORE.md` - backup/restore PostgreSQL.
- `docs/PAYMENTS.md` - AQSI/оплаты.
- `docs/ACCESS_MODEL.md` - роли, права, staff/client модель для CRM, Telegram и MAX.
- `docs/STAGING.md` - staging-контур.

## Production

- Server: `79.137.162.55`.
- Domain in progress: `hardzone.space`, `www.hardzone.space`.
- SSH user: `root`.
- SSH key: `~/.ssh/hardzone_deploy`.
- App user: `app`.
- Path: `/srv/HardZone`.
- Backend PM2: `inventory-backend`, local port `3000`.
- Frontend PM2: `hardzone-frontend`, local port `3001`.
- Public ports: `22`, `80`, `443`.
- Internal-only ports: `3000`, `3001`, `5432`.
- Old server `80.66.87.178` must not be used unless explicitly requested.

## Current Stabilization

| Layer | Current state | Gate / next action |
| --- | --- | --- |
| Git | GitHub `origin`; production `server` remote exists | Routine deploy through `deploy.ps1`, not `git push server main` |
| Env | Real `.env` files excluded from Git; examples exist | Keep `backend/.env.example` and `frontend/.env.example` current |
| Database | SQL migrations and `schema_migrations` exist | Schema changes require a new SQL migration |
| Backup | Production backup script and restore-smoke exist | Run backup before risky production work |
| Checks | Smoke scripts exist for local, staging, production | Run the relevant smoke-check before handoff |
| Payments | AQSI flow documented in `docs/PAYMENTS.md` | Compare endpoint/payload changes with `swagger (3).json` |
| Domain | DNS, nginx and Let's Encrypt are configured for `hardzone.space` and `www.hardzone.space` | Monitor certificate renewal |

## Critical Areas

- AQSI/payments: `backend/src/services/aqsi.js`, `backend/src/services/aqsi-v4-flow.js`, `backend/src/routes/aqsi-v4.js`, `backend/src/routes/orders.js`, `frontend/components/sales/`.
- Schedule/attendance: `backend/src/routes/schedule.js`, `frontend/components/schedule/`.
- Access rights: `backend/src/authz.js`, `frontend/lib/access.ts`, user settings.
- Access model: `docs/ACCESS_MODEL.md`.
- Database migrations: `backend/src/db/migrations/`.
- Russian text encoding: any `.md`, `.ts`, `.tsx`, `.js`, `.json` with Cyrillic.

## Agent Rules

1. Do not rewrite large areas without a clear task.
2. Before AQSI changes, compare payload/endpoints with `swagger (3).json` and `docs/PAYMENTS.md`.
3. Use `apply_patch` for manual edits.
4. After frontend/backend text changes, run a mojibake check or `.\scripts\smoke-local.ps1 -SkipFrontendLint -SkipFrontendBuild -SkipBackendMigrate`.
5. If production deploy is needed from Windows, use `deploy.ps1`.
6. Before risky production work, create or confirm a recent backup and restore evidence.
7. Long-term stabilization changes go through `docs/STABILIZATION_PLAN.md`.
