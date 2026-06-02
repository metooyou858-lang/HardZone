# HardZone Operations

## Production-РґРѕСЃС‚СѓРї

РўРµРєСѓС‰РёР№ production:

- IP: `79.137.162.55`.
- SSH user: `root`.
- SSH key: `~/.ssh/hardzone_deploy`.
- SSH password login РѕС‚РєР»СЋС‡РµРЅ; `root` РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РїРѕ РєР»СЋС‡Сѓ.
- РћС‚РєСЂС‹С‚С‹Рµ РІРЅРµС€РЅРёРµ РїРѕСЂС‚С‹: `22`, `80`, `443`.
- `3001` frontend, `3000` backend Рё `5432` PostgreSQL РґРѕР»Р¶РЅС‹ Р±С‹С‚СЊ РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ Р»РѕРєР°Р»СЊРЅРѕ РЅР° СЃРµСЂРІРµСЂРµ.
- `ufw` Рё `fail2ban` РІРєР»СЋС‡РµРЅС‹.
- HTTPS СЃРµР№С‡Р°СЃ РІСЂРµРјРµРЅРЅРѕ РІС‹РїСѓС‰РµРЅ РЅР° IP. РЎРµСЂС‚РёС„РёРєР°С‚ РґРµР№СЃС‚РІРёС‚РµР»РµРЅ РґРѕ `2026-06-06`; РїРѕСЃР»Рµ РїРѕСЏРІР»РµРЅРёСЏ РґРѕРјРµРЅР° РЅСѓР¶РЅРѕ РїРµСЂРµРІС‹РїСѓСЃС‚РёС‚СЊ СЃРµСЂС‚РёС„РёРєР°С‚ РЅР° РґРѕРјРµРЅ.

РџСЂРѕРІРµСЂРєР° SSH СЃ Windows:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "echo ok"
```

Перед первым подключением host key сервера должен быть в `~/.ssh/known_hosts`.
Проверить:

```powershell
ssh-keygen -F 79.137.162.55
```

Если ключа нет, подключиться вручную и подтвердить fingerprint только после сверки с администратором сервера:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "echo ok"
```

Р•СЃР»Рё РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ `deploy.sh`, РЅСѓР¶РµРЅ SSH alias:

```sshconfig
Host hardzone
    HostName 79.137.162.55
    User root
    IdentityFile ~/.ssh/hardzone_deploy
    IdentitiesOnly yes
```

Р•СЃР»Рё SSH РЅРµ РїРѕРґРєР»СЋС‡Р°РµС‚СЃСЏ, СЃРЅР°С‡Р°Р»Р° РїСЂРѕРІРµСЂСЏС‚СЊ СЃРµС‚СЊ Рё РїРѕСЂС‚:

```powershell
Test-NetConnection 79.137.162.55 -Port 22
ssh -i "$HOME\.ssh\hardzone_deploy" -o ConnectTimeout=10 root@79.137.162.55 "echo ok"
```

## Р”РµРїР»РѕР№

РћСЃРЅРѕРІРЅРѕР№ СЃРїРѕСЃРѕР± production-РґРµРїР»РѕСЏ СЃ Windows - `deploy.ps1`. РћРЅ РїРѕРґРєР»СЋС‡Р°РµС‚СЃСЏ РїРѕ SSH Рё РІС‹РїРѕР»РЅСЏРµС‚ РґРµР№СЃС‚РІРёСЏ РїРѕРґ РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј `app`, РіРґРµ СЌС‚Рѕ РЅСѓР¶РЅРѕ.

```powershell
.\deploy.ps1 --build-frontend --restart-frontend
.\deploy.ps1 --restart-backend
.\deploy.ps1 --build-frontend --restart-frontend --restart-backend
```

Backend РЅРµ СЃРѕР±РёСЂР°РµС‚СЃСЏ: РґРѕСЃС‚Р°С‚РѕС‡РЅРѕ СЃРёРЅС…СЂРѕРЅРёР·РёСЂРѕРІР°С‚СЊ `backend/src` Рё РїРµСЂРµР·Р°РїСѓСЃС‚РёС‚СЊ `inventory-backend`.

Frontend РїРѕСЃР»Рµ РїСЂР°РІРѕРє РЅСѓР¶РЅРѕ СЃРѕР±СЂР°С‚СЊ Рё РїРµСЂРµР·Р°РїСѓСЃС‚РёС‚СЊ `hardzone-frontend`. РЎРєСЂРёРїС‚ РґРµРїР»РѕСЏ РїРµСЂРµСЃРѕР·РґР°РµС‚ frontend PM2-РїСЂРѕС†РµСЃСЃ РєР°Рє `next start -p 3001 -H 127.0.0.1`, С‡С‚РѕР±С‹ РїРѕСЂС‚ `3001` РЅРµ Р±С‹Р» РѕС‚РєСЂС‹С‚ РЅР°СЂСѓР¶Сѓ.

РќР° СЃРµСЂРІРµСЂРµ РЅРµ Р·Р°РїСѓСЃРєР°С‚СЊ `npm`, СЃР±РѕСЂРєСѓ РёР»Рё `pm2` РїРѕРґ root РІСЂСѓС‡РЅСѓСЋ. РСЃРїРѕР»СЊР·РѕРІР°С‚СЊ:

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

## Р”РѕРјРµРЅ Рё СЃРµСЂС‚РёС„РёРєР°С‚

РџРѕРєР° РґРѕРјРµРЅР° РЅРµС‚, nginx РѕР±СЃР»СѓР¶РёРІР°РµС‚ `https://79.137.162.55/` Рё СЂРµРґРёСЂРµРєС‚РёС‚ HTTP РЅР° HTTPS.

РљРѕРіРґР° РїРѕСЏРІРёС‚СЃСЏ РґРѕРјРµРЅ:

1. РЎРѕР·РґР°С‚СЊ DNS `A` record РЅР° `79.137.162.55`.
2. Р”РѕР±Р°РІРёС‚СЊ РґРѕРјРµРЅ РІ `server_name` nginx.
3. Р’С‹РїСѓСЃС‚РёС‚СЊ Let's Encrypt СЃРµСЂС‚РёС„РёРєР°С‚ РЅР° РґРѕРјРµРЅ.
4. РџСЂРѕРІРµСЂРёС‚СЊ HTTPS, login, `/health`, PM2 Рё AQSI/payment flow.
5. РћСЃС‚Р°РІРёС‚СЊ IP РєР°Рє redirect РЅР° РґРѕРјРµРЅ РёР»Рё Р·Р°РєСЂС‹С‚СЊ РѕС‚РґРµР»СЊРЅС‹Рј default server.

Р”Рѕ РїРѕСЏРІР»РµРЅРёСЏ РґРѕРјРµРЅР° СЃР»РµРґРёС‚СЊ Р·Р° IP-СЃРµСЂС‚РёС„РёРєР°С‚РѕРј: С‚РµРєСѓС‰РёР№ РёСЃС‚РµРєР°РµС‚ `2026-06-06`.

## Р›РѕРіРё

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 logs inventory-backend --lines 200 --nostream'"
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 logs hardzone-frontend --lines 200 --nostream'"
```

## Health checks

Backend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "curl -fsS http://127.0.0.1:3000/health"
```

Frontend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "curl -I -fsS http://127.0.0.1:3001"
```

Р•СЃР»Рё frontend РїРѕСЂС‚ РѕС‚Р»РёС‡Р°РµС‚СЃСЏ РІ PM2/nginx, СЃРЅР°С‡Р°Р»Р° СЃРјРѕС‚СЂРµС‚СЊ PM2:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 status'"
```

## Post-deploy checklist

1. PM2 РїСЂРѕС†РµСЃСЃС‹ `online`.
2. Backend `/health` РѕС‚РІРµС‡Р°РµС‚.
3. Frontend РѕС‚РґР°РµС‚ СЃС‚СЂР°РЅРёС†Сѓ.
4. Р’ Р»РѕРіР°С… РЅРµС‚ РЅРѕРІС‹С… `ERROR`.
5. РџРѕСЃР»Рµ frontend-РїСЂР°РІРѕРє РЅРµС‚ mojibake:

```powershell
rg "Р Сџ|Гђ|Г‘|пїЅ" frontend
```

6. Р•СЃР»Рё РјРµРЅСЏР»РёСЃСЊ РѕРїР»Р°С‚С‹, РїСЂРѕРІРµСЂРёС‚СЊ СЃС†РµРЅР°СЂРёР№ РІ CRM Р±РµР· СЂСѓС‡РЅРѕРіРѕ СЃРѕР·РґР°РЅРёСЏ С‡РµРєРѕРІ РјРёРјРѕ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРіРѕ flow.

РђРІС‚РѕРјР°С‚РёР·РёСЂРѕРІР°РЅРЅР°СЏ С‡Р°СЃС‚СЊ:

```powershell
.\scripts\smoke-production.ps1
```
