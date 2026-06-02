# HardZone Commands

РЁРїР°СЂРіР°Р»РєР° РєРѕРјР°РЅРґ РґР»СЏ РѕР±С‹С‡РЅРѕР№ СЂР°Р±РѕС‚С‹. Production РјРµРЅСЏРµС‚СЃСЏ С‚РѕР»СЊРєРѕ РєРѕРјР°РЅРґР°РјРё РёР· СЂР°Р·РґРµР»Р° "Р”РµРїР»РѕР№".

## РќР°С‡Р°С‚СЊ СЂР°Р±РѕС‚Сѓ

```powershell
git switch main
git pull
git switch -c fix/short-name
```

РџСЂРѕРІРµСЂРёС‚СЊ СЃРѕСЃС‚РѕСЏРЅРёРµ:

```powershell
git status --short --branch
```

## РЎРѕС…СЂР°РЅРёС‚СЊ РєРѕРґ РІ GitHub

Р‘РµР·РѕРїР°СЃРЅРѕ: СЌС‚Рѕ РЅРµ РґРµРїР»РѕР№. РћР±С‹С‡РЅС‹Р№ commit flow РёРґРµС‚ С‡РµСЂРµР· GitHub `origin`, Р° production РјРµРЅСЏРµС‚СЃСЏ РѕС‚РґРµР»СЊРЅС‹Рј Р·Р°РїСѓСЃРєРѕРј `deploy.ps1`.

```powershell
git add .
git commit -m "Short clear message"
git push -u origin fix/short-name
```

Р”Р»СЏ СѓР¶Рµ РѕРїСѓР±Р»РёРєРѕРІР°РЅРЅРѕР№ РІРµС‚РєРё:

```powershell
git push
```

## РџСЂРѕРІРµСЂРєРё РїРµСЂРµРґ РєРѕРјРјРёС‚РѕРј

РљРѕРґРёСЂРѕРІРєР°:

```powershell
rg "Р Сџ|Гђ|Г‘|пїЅ" frontend backend
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

Р’СЃРµ Р»РѕРєР°Р»СЊРЅС‹Рµ Р±С‹СЃС‚СЂС‹Рµ РїСЂРѕРІРµСЂРєРё:

```powershell
.\scripts\smoke-local.ps1 -SkipBackendMigrate
```

## Р”РµРїР»РѕР№

РћСЃРЅРѕРІРЅРѕР№ production-РґРµРїР»РѕР№:

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

РњРёРіСЂР°С†РёСЏ + backend:

```powershell
.\deploy.ps1 backend/src/db/migrations/035_short_description.sql --migrate --restart-backend
```

## РџСЂРѕРІРµСЂРєР° production РїРѕСЃР»Рµ РґРµРїР»РѕСЏ

```powershell
.\scripts\smoke-production.ps1
```

Health РІСЂСѓС‡РЅСѓСЋ:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "curl -fsS http://127.0.0.1:3000/health"
```

PM2 status:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 status'"
```

## Р›РѕРіРё production

Backend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 logs inventory-backend --lines 200 --nostream'"
```

Frontend:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" root@79.137.162.55 "su - app -c 'pm2 logs hardzone-frontend --lines 200 --nostream'"
```

## SSH

РџРѕСЃР»Рµ hardening РґРѕСЃС‚СѓРї РїРѕ РїР°СЂРѕР»СЋ РѕС‚РєР»СЋС‡РµРЅ. РџРѕРґРєР»СЋС‡РµРЅРёРµ С‚РѕР»СЊРєРѕ РїРѕ РєР»СЋС‡Сѓ `~/.ssh/hardzone_deploy`.

РџСЂРѕРІРµСЂРёС‚СЊ РґРѕСЃС‚СѓРї:

```powershell
ssh -i "$HOME\.ssh\hardzone_deploy" -o ConnectTimeout=10 root@79.137.162.55 "echo ok"
```

Р•СЃР»Рё РЅРµ РїРѕРґРєР»СЋС‡Р°РµС‚СЃСЏ:

```powershell
Test-NetConnection 79.137.162.55 -Port 22
```

## Р’Р°Р¶РЅРѕ

Р‘РµР·РѕРїР°СЃРЅРѕ:

```powershell
git push origin branch-name
```

РћРїР°СЃРЅРѕ: СЌС‚Рѕ production deploy С‡РµСЂРµР· СЃРµСЂРІРµСЂРЅС‹Р№ Git hook.

```powershell
git push server main
```

РћР±С‹С‡РЅРѕ РЅРµ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ `git push server main`. Р”Р»СЏ production РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ `deploy.ps1`.

## РЎРµС‚СЊ production

Р”РѕР»Р¶РЅС‹ Р±С‹С‚СЊ РѕС‚РєСЂС‹С‚С‹ СЃРЅР°СЂСѓР¶Рё С‚РѕР»СЊРєРѕ:

```text
22/tcp  SSH
80/tcp  HTTP redirect
443/tcp HTTPS
```

РџРѕСЂС‚С‹ `3001`, `3000`, `5432` РґРѕР»Р¶РЅС‹ Р±С‹С‚СЊ Р·Р°РєСЂС‹С‚С‹ СЃРЅР°СЂСѓР¶Рё. Frontend PM2 РґРѕР»Р¶РµРЅ СЃС‚Р°СЂС‚РѕРІР°С‚СЊ РєР°Рє `next start -p 3001 -H 127.0.0.1`.

РўРµРєСѓС‰РёР№ РІСЂРµРјРµРЅРЅС‹Р№ HTTPS-СЃРµСЂС‚РёС„РёРєР°С‚ РЅР° IP `79.137.162.55` РёСЃС‚РµРєР°РµС‚ `2026-06-06`. РџРѕСЃР»Рµ РїРѕРєСѓРїРєРё РґРѕРјРµРЅР° РїРµСЂРµРІС‹РїСѓСЃС‚РёС‚СЊ СЃРµСЂС‚РёС„РёРєР°С‚ РЅР° РґРѕРјРµРЅ Рё РѕР±РЅРѕРІРёС‚СЊ nginx `server_name`.
