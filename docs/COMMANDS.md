# HardZone Commands

Короткая шпаргалка команд для обычной работы. Production менять только командами из разделов deploy/backup, не через случайный push в `server`.

## Начать работу

```powershell
git status --short --branch
git pull
git switch -c fix/short-name
```

## Проверки перед коммитом

Mojibake:

```powershell
.\scripts\smoke-local.ps1 -SkipFrontendLint -SkipFrontendBuild -SkipBackendMigrate
```

Backend syntax:

```powershell
Get-ChildItem backend\src -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Backend/integration tests:

Run in CI or remotely on server `79.137.162.55` with an isolated temporary PostgreSQL database. Do not depend on local Docker/PostgreSQL on the current Windows machine.

```powershell
.\scripts\test-backend-remote.ps1
.\scripts\test-backend-remote.ps1 -Branch stabilize/worktree-audit
```

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Все быстрые локальные проверки:

```powershell
.\scripts\smoke-local.ps1 -SkipBackendMigrate
```

## Backup production

Перед миграциями, оплатами, расписанием, правами доступа и restore:

```powershell
.\scripts\backup-production.ps1
```

Проверить, что последний backup восстанавливается:

```powershell
.\scripts\test-restore-production-backup.ps1
```

Подробности: `docs/BACKUP_RESTORE.md`.

## Deploy

Основной production deploy с Windows:

```powershell
.\deploy.ps1 --build-frontend --restart-frontend
.\deploy.ps1 --restart-backend
.\deploy.ps1 --build-frontend --restart-frontend --restart-backend
```

Миграция + backend:

```powershell
.\deploy.ps1 backend/src/db/migrations/035_short_description.sql --migrate --restart-backend
```

После deploy:

```powershell
.\scripts\smoke-production.ps1
```

## Production health

Backend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "curl -fsS http://127.0.0.1:3000/health"
```

Frontend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "curl -I -fsS http://127.0.0.1:3001"
```

PM2:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 status'"
```

Logs:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 logs inventory-backend --lines 200 --nostream'"
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 logs hardzone-frontend --lines 200 --nostream'"
```

## Staging

```powershell
.\scripts\smoke-staging.ps1
```

Подробности: `docs/STAGING.md`.

## Git

Обычный безопасный push в GitHub:

```powershell
git push origin branch-name
```

Опасно: это production deploy через серверный hook. Для routine work не использовать:

```powershell
git push server main
```

## SSH

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o ConnectTimeout=10 root@79.137.162.55 "echo ok"
Test-NetConnection 79.137.162.55 -Port 22
```

После hardening доступ по паролю отключён. Подключение только по ключу `~/.ssh/hardzone_deploy`.

## Production network

Снаружи должны быть открыты только:

```text
22/tcp  SSH
80/tcp  HTTP redirect
443/tcp HTTPS
```

Порты `3001`, `3000`, `5432` должны быть закрыты снаружи. Frontend PM2 должен стартовать как `next start -p 3001 -H 127.0.0.1`.
