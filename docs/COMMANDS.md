# HardZone Commands

Шпаргалка команд для обычной работы. Production меняется только командами из раздела "Деплой".

## Начать работу

```powershell
git switch main
git pull
git switch -c fix/short-name
```

Проверить состояние:

```powershell
git status --short --branch
```

## Сохранить код в GitHub

Безопасно: это не деплой. Обычный commit flow идет через GitHub `origin`, а production меняется отдельным запуском `deploy.ps1`.

```powershell
git add .
git commit -m "Short clear message"
git push -u origin fix/short-name
```

Для уже опубликованной ветки:

```powershell
git push
```

## Проверки перед коммитом

Кодировка:

```powershell
rg "Рџ|Ð|Ñ|�" frontend backend
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

Все локальные быстрые проверки:

```powershell
.\scripts\smoke-local.ps1 -SkipBackendMigrate
```

## Деплой

Основной production-деплой:

Frontend:

```powershell
.\deploy.ps1 --build-frontend --restart-frontend
```

Backend:

```powershell
.\deploy.ps1 --restart-backend
```

Frontend + backend:

```powershell
.\deploy.ps1 --build-frontend --restart-frontend --restart-backend
```

Миграция + backend:

```powershell
.\deploy.ps1 backend/src/db/migrations/035_short_description.sql --migrate --restart-backend
```

## Проверка production после деплоя

```powershell
.\scripts\smoke-production.ps1
```

Health вручную:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "curl -fsS http://127.0.0.1:3000/health"
```

PM2 status:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "su - app -c 'pm2 status'"
```

## Логи production

Backend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "su - app -c 'pm2 logs inventory-backend --lines 200 --nostream'"
```

Frontend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "su - app -c 'pm2 logs hardzone-frontend --lines 200 --nostream'"
```

## SSH

После hardening доступ по паролю отключен. Подключение только по ключу `~/.ssh/hardzone_deploy`.

Проверить доступ:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@79.137.162.55 "echo ok"
```

Если не подключается:

```powershell
Test-NetConnection 79.137.162.55 -Port 22
```

## Важно

Безопасно:

```powershell
git push origin branch-name
```

Опасно: это production deploy через серверный Git hook.

```powershell
git push server main
```

Обычно не использовать `git push server main`. Для production использовать `deploy.ps1`.

## Сеть production

Должны быть открыты снаружи только:

```text
22/tcp  SSH
80/tcp  HTTP redirect
443/tcp HTTPS
```

Порты `3001`, `3000`, `5432` должны быть закрыты снаружи. Frontend PM2 должен стартовать как `next start -p 3001 -H 127.0.0.1`.

Текущий временный HTTPS-сертификат на IP `79.137.162.55` истекает `2026-06-06`. После покупки домена перевыпустить сертификат на домен и обновить nginx `server_name`.
