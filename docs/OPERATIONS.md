# HardZone Operations

## Production-доступ

Текущий production:

- IP: `79.137.162.55`.
- SSH user: `root`.
- SSH key: `~/.ssh/hardzone_deploy`.
- SSH password login отключен; `root` доступен только по ключу.
- Открытые внешние порты: `22`, `80`, `443`.
- `3001` frontend, `3000` backend и `5432` PostgreSQL должны быть доступны только локально на сервере.
- `ufw` и `fail2ban` включены.
- HTTPS сейчас временно выпущен на IP. Сертификат действителен до `2026-06-06`; после появления домена нужно перевыпустить сертификат на домен.

Проверка SSH с Windows:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "echo ok"
```

Если используется `deploy.sh`, нужен SSH alias:

```sshconfig
Host hardzone
    HostName 79.137.162.55
    User root
    IdentityFile ~/.ssh/hardzone_deploy
    IdentitiesOnly yes
```

Если SSH не подключается, сначала проверять сеть и порт:

```powershell
Test-NetConnection 79.137.162.55 -Port 22
ssh -i "$HOME\.ssh\hardzone_deploy" -o ConnectTimeout=10 -o StrictHostKeyChecking=no root@79.137.162.55 "echo ok"
```

## Деплой

Основной способ production-деплоя с Windows - `deploy.ps1`. Он подключается по SSH и выполняет действия под пользователем `app`, где это нужно.

```powershell
.\deploy.ps1 --build-frontend --restart-frontend
.\deploy.ps1 --restart-backend
.\deploy.ps1 --build-frontend --restart-frontend --restart-backend
```

Backend не собирается: достаточно синхронизировать `backend/src` и перезапустить `inventory-backend`.

Frontend после правок нужно собрать и перезапустить `hardzone-frontend`. Скрипт деплоя пересоздает frontend PM2-процесс как `next start -p 3001 -H 127.0.0.1`, чтобы порт `3001` не был открыт наружу.

На сервере не запускать `npm`, сборку или `pm2` под root вручную. Использовать:

```bash
su - app -c '...'
```

## Git remotes and production risk

`origin` - GitHub repository. Push to `origin/main` only updates GitHub and does not deploy by itself.

`server` points to `/srv/HardZone.git` on production. That bare repository has a `post-receive` hook which checks out `main` into `/srv/HardZone`, runs backend migrations, installs dependencies, builds frontend, and restarts PM2.

Do not push to `server` unless the intent is a production deploy. Prefer `deploy.ps1` / `deploy.sh`, because they are explicit and easier to reason about from Windows.

Recommended commit/deploy flow:

1. Commit locally on a feature/fix branch.
2. Push to GitHub `origin`.
3. Run checks locally.
4. Deploy explicitly through `deploy.ps1`.

Avoid `git push server main` for routine work. It is an old production hook path, not the normal commit flow.

## Домен и сертификат

Пока домена нет, nginx обслуживает `https://79.137.162.55/` и редиректит HTTP на HTTPS.

Когда появится домен:

1. Создать DNS `A` record на `79.137.162.55`.
2. Добавить домен в `server_name` nginx.
3. Выпустить Let's Encrypt сертификат на домен.
4. Проверить HTTPS, login, `/health`, PM2 и AQSI/payment flow.
5. Оставить IP как redirect на домен или закрыть отдельным default server.

До появления домена следить за IP-сертификатом: текущий истекает `2026-06-06`.

## Логи

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "su - app -c 'pm2 logs inventory-backend --lines 200 --nostream'"
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "su - app -c 'pm2 logs hardzone-frontend --lines 200 --nostream'"
```

## Health checks

Backend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "curl -fsS http://127.0.0.1:3000/health"
```

Frontend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "curl -I -fsS http://127.0.0.1:3001"
```

Если frontend порт отличается в PM2/nginx, сначала смотреть PM2:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o StrictHostKeyChecking=no root@79.137.162.55 "su - app -c 'pm2 status'"
```

## Post-deploy checklist

1. PM2 процессы `online`.
2. Backend `/health` отвечает.
3. Frontend отдает страницу.
4. В логах нет новых `ERROR`.
5. После frontend-правок нет mojibake:

```powershell
rg "Рџ|Ð|Ñ|�" frontend
```

6. Если менялись оплаты, проверить сценарий в CRM без ручного создания чеков мимо существующего flow.

Автоматизированная часть:

```powershell
.\scripts\smoke-production.ps1
```
