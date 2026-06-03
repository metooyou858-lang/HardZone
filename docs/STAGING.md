# HardZone Staging

Цель: проверять изменения CRM до production на отдельной базе, отдельных портах и отдельных PM2-процессах.

## Target Shape

- Server: `79.137.162.55`.
- Path: `/srv/HardZone-staging`.
- Backend port: `3100`.
- Frontend port: `3101`.
- PostgreSQL DB: `hardzone_staging`.
- Backend PM2: `hardzone-staging-backend`.
- Frontend PM2: `hardzone-staging-frontend`.
- Production DB and production PM2 processes must not be touched by staging work.

## Create Staging DB

Run on server as `root`:

```bash
sudo -u postgres psql -c "CREATE DATABASE hardzone_staging;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE hardzone_staging TO hardzone;"
```

If production uses a different DB user, first check `/srv/HardZone/backend/.env`.

## First Checkout

```bash
mkdir -p /srv/HardZone-staging
chown -R app:app /srv/HardZone-staging
su - app
cd /srv/HardZone-staging
git clone /srv/HardZone.git .
git checkout stabilize/worktree-audit
```

If staging should use GitHub instead of the local bare repo, configure `origin`, but do not push staging changes to `server`.

## Backend Env

Create `/srv/HardZone-staging/backend/.env`:

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

For staging, avoid real AQSI keys until a separate safe payment-test flow is defined.

## Frontend Env

Create `/srv/HardZone-staging/frontend/.env.local`:

```env
BACKEND_API_URL=http://127.0.0.1:3100/api
INTERNAL_API_URL=http://127.0.0.1:3100/api
HARDZONE_SESSION_SECRET=replace-with-staging-secret
BACKEND_API_TOKEN=replace-with-staging-token
SESSION_COOKIE_SECURE=false
```

`HARDZONE_SESSION_SECRET` and `BACKEND_API_TOKEN` must match backend staging.

## Install And Build

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

## Health Checks

From local Windows:

```powershell
.\scripts\smoke-staging.ps1
```

Manual checks:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "curl -fsS http://127.0.0.1:3100/health"
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "curl -I -fsS http://127.0.0.1:3101"
```

## Rules

- Do not use production DB for staging.
- Do not use production PM2 names.
- Do not expose ports `3100`, `3101`, `5432` publicly.
- Before restoring a production dump into staging, read `docs/BACKUP_RESTORE.md`.
- Before payment changes on staging, decide separately which AQSI keys/devices are allowed.
