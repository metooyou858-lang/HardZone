# HardZone Operations

## Production

- Server: `79.137.162.55`.
- SSH user: `root`.
- SSH key: `~/.ssh/hardzone_deploy`.
- App user on server: `app`.
- App path: `/srv/HardZone`.
- Backend PM2: `inventory-backend`, local port `3000`.
- Frontend PM2: `hardzone-frontend`, local port `3001`.
- PostgreSQL must not be exposed publicly.
- Public ports: `22`, `80`, `443`.
- Internal-only ports: `3000`, `3001`, `5432`.
- Old server `80.66.87.178` must not be used unless explicitly requested.

SSH password login is disabled. Access is by key only.

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o ConnectTimeout=10 root@79.137.162.55 "echo ok"
```

## Deploy

Main production deploy from Windows:

```powershell
.\deploy.ps1 --build-frontend --restart-frontend
.\deploy.ps1 --restart-backend
.\deploy.ps1 --build-frontend --restart-frontend --restart-backend
```

Migration + backend restart:

```powershell
.\deploy.ps1 backend/src/db/migrations/035_short_description.sql --migrate --restart-backend
```

Do not run `npm`, frontend builds, or `pm2` manually as `root`. If manual server work is unavoidable, run app commands as `app`:

```bash
su - app -c '...'
```

## Git Remotes

- `origin` is GitHub. Push to `origin` does not deploy production.
- `server` points to production bare repo `/srv/HardZone.git`.
- Pushing to `server` can trigger production deploy through the old post-receive hook.

Routine production deploy should use `deploy.ps1`, not `git push server main`.

## Backup

Before production migrations or risky changes:

```powershell
.\scripts\backup-production.ps1
```

Backup and restore procedure: `docs/BACKUP_RESTORE.md`.

Minimum rule: if a task touches AQSI, DB schema, schedule, subscriptions, attendance, access rights, or users, create or confirm a recent production backup first.

## Domain And HTTPS

Current domain:

```text
hardzone.space
www.hardzone.space
```

DNS records should point to production:

```text
@      A      79.137.162.55
www    A      79.137.162.55
```

Domain setup is complete:

1. `hardzone.space` and `www.hardzone.space` resolve to `79.137.162.55`.
2. Nginx serves both names.
3. Let's Encrypt certificate `hardzone.space` covers both names and expires on `2026-09-01`.
4. HTTP redirects to HTTPS; HTTPS serves the CRM and `/health`.

## Health Checks

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

## Telegram Bots

The staff bot can be served by the production backend webhook:

```text
/api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>
```

Production env variables live in `/srv/HardZone/backend/.env` and must not be committed:

```text
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CLIENT_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
```

If Telegram cannot reach the server webhook or the server cannot use the DNS-selected Telegram API address, run the bots as server-side polling processes:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'cd /srv/HardZone/backend && pm2 start src/telegram-poller.js --name hardzone-telegram-poller && pm2 save'"
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'cd /srv/HardZone/backend && pm2 start src/telegram-client-poller.js --name hardzone-telegram-client-poller && pm2 save'"
```

Polling requires:

```text
TELEGRAM_ENABLED=true
TELEGRAM_POLLING_ENABLED=true
```

The client bot opens the Mini App at `/telegram/client`.

After changing Telegram env values, restart backend with updated PM2 env:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 restart inventory-backend --update-env'"
```

Staff access is controlled by `users.telegram_id` plus the existing CRM modules:

- `schedule` for today's schedule and slot lists;
- `clients` for client search;
- `schedule_clients` for booking a client;
- `schedule_attendance` for attendance actions.

Logs:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 logs inventory-backend --lines 200 --nostream'"
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 logs hardzone-frontend --lines 200 --nostream'"
```

## Smoke Checks

Local:

```powershell
.\scripts\smoke-local.ps1
```

Production:

```powershell
.\scripts\smoke-production.ps1
```

Staging:

```powershell
.\scripts\smoke-staging.ps1
```

## Post-Deploy Checklist

1. Production backup exists if migrations or risky data paths changed.
2. PM2 processes are `online`.
3. Backend `/health` responds.
4. Frontend serves a page.
5. No new `ERROR` entries in recent backend/frontend logs.
6. `.\scripts\smoke-production.ps1` passes.
7. If payments changed, verify the CRM flow without creating manual receipts outside the existing AQSI flow.

## Staging

Staging notes: `docs/STAGING.md`.

Use staging before risky AQSI, DB, schedule, subscriptions, attendance, access-rights, and restore work.
