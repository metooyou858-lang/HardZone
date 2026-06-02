# HardZone Staging

Цель: проверять изменения CRM до production на отдельной базе, отдельных портах и отдельных PM2-процессах.

## Целевая схема

- Сервер: `79.137.162.55`.
- Путь: `/srv/HardZone-staging`.
- Backend port: `3100`.
- Frontend port: `3101`.
- PostgreSQL DB: `hardzone_staging`.
- Backend PM2: `hardzone-staging-backend`.
- Frontend PM2: `hardzone-staging-frontend`.
- Production DB и production PM2-процессы не трогать.

## Создание staging DB

Выполнять на сервере под `root`:

```bash
sudo -u postgres psql -c "CREATE DATABASE hardzone_staging;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE hardzone_staging TO hardzone;"
```

Если используется другой production DB user, сначала сверить `/srv/HardZone/backend/.env`.

## Первый checkout

```bash
mkdir -p /srv/HardZone-staging
chown -R app:app /srv/HardZone-staging
su - app
cd /srv/HardZone-staging
git clone /srv/HardZone.git .
git checkout stabilize/worktree-audit
```

Если staging будет брать код из GitHub, вместо локального bare repo можно использовать `origin`, но не пушить staging в `server`.

## Backend env

Создать `/srv/HardZone-staging/backend/.env`:

```env
HOST=127.0.0.1
PORT=3100
APP_TIMEZONE=Asia/Vladivostok
APP_BASE_URL=http://127.0.0.1:3101
FRONTEND_BASE_URL=http://127.0.0.1:3101

DATABASE_URL=postgres://hardzone:hardzone@127.0.0.1:5432/hardzone_staging

HARDZONE_SESSION_SECRET=replace-with-staging-secret
BACKEND_API_TOKEN=replace-with-staging-token
NODE_ENV=staging

AUTH_BOOTSTRAP_USERNAME=
AUTH_BOOTSTRAP_PASSWORD=
AUTH_BOOTSTRAP_NAME=Главный администратор
AUTH_BOOTSTRAP_ROLE=owner
AUTH_BOOTSTRAP_EMAIL=

AQSI_BASE_URL=
AQSI_API_KEY=
AQSI_SHOP_ID=
AQSI_DEVICE_ID=
AQSI_WEBHOOK_LOG_DIR=/srv/HardZone-staging/logs

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
SMTP_SECURE=false

LOG_DIR=/srv/HardZone-staging/logs
```

Для staging лучше не подключать реальные AQSI-ключи, пока отдельно не решён безопасный тестовый flow оплат.

## Frontend env

Создать `/srv/HardZone-staging/frontend/.env.local`:

```env
BACKEND_API_URL=http://127.0.0.1:3100/api
INTERNAL_API_URL=http://127.0.0.1:3100/api
HARDZONE_SESSION_SECRET=replace-with-staging-secret
BACKEND_API_TOKEN=replace-with-staging-token
SESSION_COOKIE_SECURE=false
```

`HARDZONE_SESSION_SECRET` и `BACKEND_API_TOKEN` должны совпадать с backend staging.

## Установка и миграции

```bash
su - app
cd /srv/HardZone-staging/backend
npm ci
npm run migrate

cd /srv/HardZone-staging/frontend
npm ci
npm run build
```

## PM2

Backend:

```bash
su - app
cd /srv/HardZone-staging/backend
pm2 delete hardzone-staging-backend >/dev/null 2>&1 || true
pm2 start npm --name hardzone-staging-backend -- start
```

Frontend:

```bash
su - app
cd /srv/HardZone-staging/frontend
pm2 delete hardzone-staging-frontend >/dev/null 2>&1 || true
pm2 start npm --name hardzone-staging-frontend -- start -- -p 3101 -H 127.0.0.1
pm2 save
```

## Health checks

С локальной машины:

```powershell
.\scripts\smoke-staging.ps1
```

Вручную:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "curl -fsS http://127.0.0.1:3100/health"
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "curl -I -fsS http://127.0.0.1:3101"
```

## Правила

- Не использовать production DB для staging.
- Не использовать production PM2 names.
- Не открывать порты `3100`, `3101`, `5432` наружу.
- Перед restore production dump в staging прочитать `docs/BACKUP_RESTORE.md`.
- Перед изменениями оплат на staging отдельно решить, какие AQSI ключи и устройства допустимы.
