# HardZone Workflow

Node.js version: `24.14.1` (`.nvmrc`, `.node-version`). Check before installing dependencies:

```powershell
node --version
```

## Daily Development

1. Check branch and working tree:

```powershell
git status --short --branch
```

2. Read the relevant docs before editing:

```text
docs/PROJECT_MAP.md
docs/COMMANDS.md
docs/OPERATIONS.md
docs/PAYMENTS.md
docs/BACKUP_RESTORE.md
```

3. Search the affected area before changing code:

```powershell
rg "functionName|endpoint|error text" backend frontend
```

4. Keep changes small: one task, one area, one verification path.

## Local Run

Локальный запуск нужен для технической проверки разработчиком. Не использовать `localhost` как пользовательский контур просмотра UI-задач HardZone, если пользователь явно этого не попросил. Для демонстрации изменений пользователю использовать production/staging домен после деплоя по `docs/OPERATIONS.md`.

Backend:

```powershell
cd backend
npm install
copy .env.example .env
npm run migrate
npm run dev
```

Frontend:

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

By default, frontend expects backend at `http://127.0.0.1:3000/api`.

## Checks

Fast local smoke:

```powershell
.\scripts\smoke-local.ps1 -SkipBackendMigrate
```

Only mojibake scan:

```powershell
.\scripts\smoke-local.ps1 -SkipFrontendLint -SkipFrontendBuild -SkipBackendMigrate
```

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Backend syntax:

```powershell
Get-ChildItem backend\src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Backend tests:

Backend/integration tests must be reproducible remotely, not tied to the current local workstation. Run them in CI or on server `79.137.162.55` with an isolated temporary PostgreSQL database. Do not require local Docker or local PostgreSQL for the HardZone verification path.

```powershell
.\scripts\test-backend-remote.ps1
```

## Encoding

The project has a Russian-language interface. Text files with Cyrillic must stay UTF-8.

If mojibake appears in UI/code/docs, fix the text first, then rebuild or rerun smoke.

## Git

Work in branches by meaning, not by accident. Before committing, compare the current task with the current branch name. If they do not match, create or switch to a semantic branch first, then commit there. Do not keep unrelated feature, audit, stabilization, hotfix, or UI work in the same branch just because it is already checked out.

Safe routine flow:

```powershell
git switch -c fix/short-name
git add .
git commit -m "Short clear message"
git push -u origin fix/short-name
```

`origin` is GitHub. Pushing to `origin` does not deploy production.

`server` is the production bare repo and may trigger a deploy through an old hook. Do not use `git push server main` for routine work.

## Migrations

Do not change production schema manually without a SQL migration.

New migration format:

```text
backend/src/db/migrations/035_short_description.sql
```

Apply locally:

```powershell
cd backend
npm run migrate
```

Production migration through deploy:

```powershell
.\deploy.ps1 backend/src/db/migrations/035_short_description.sql --migrate --restart-backend
```

Before production migrations, run:

```powershell
.\scripts\backup-production.ps1
.\scripts\test-restore-production-backup.ps1
```

## Handoff Checklist

Record briefly:

- what changed;
- which files changed;
- which commands passed;
- what was not checked and why;
- whether there is risk for AQSI, schedule, access rights, or database.

## Product UI Rules

- CRM - источник правды. Новые клиентские, тренерские, дневниковые и расписательные сценарии сначала появляются в CRM/backend-модели, затем отображаются в Telegram/MAX.
- Telegram Mini App не должен содержать отдельную бизнес-логику, моковые состояния или demo-данные для продуктового сценария без явной просьбы. Он показывает backend-данные и отправляет действия в backend.
- Не добавлять preview/demo-роуты для обсуждения реального продукта, если пользователь просит смотреть "по живому". Вносить изменения в существующий рабочий экран на отдельной ветке, деплоить через `.\deploy.ps1`, затем проверять на `https://hardzone.space`.
- Можно предлагать альтернативные UX/процессные решения, но нельзя перепроектировать или заменять уже согласованные и готовые решения без явного подтверждения пользователя. Если новое требование конфликтует с готовым решением, сначала обсудить точечное расширение, а не молча перестраивать существующий сценарий.
- После frontend-деплоя запускать `.\scripts\smoke-production.ps1` и сообщать пользователю именно доменный URL, а не локальный адрес.

## Smoke Scripts

```powershell
.\scripts\smoke-local.ps1
.\scripts\smoke-staging.ps1
.\scripts\smoke-production.ps1
```
