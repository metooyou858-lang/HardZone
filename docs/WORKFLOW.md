# HardZone Workflow

Node.js version: `24.14.1` (`.nvmrc`, `.node-version`). Check before installing dependencies:

```powershell
node --version
```

## Ежедневный цикл разработки

1. Проверить ветку и незакоммиченные изменения:

```powershell
git status --short --branch
```

2. Перед правкой понять затронутую область:

```powershell
rg "имя_функции|endpoint|текст_ошибки" backend frontend
```

3. Делать маленькие изменения: одна задача - один участок - одна проверка.

4. После правок фронтенда:

```powershell
cd frontend
npm run lint
npm run build
```

5. После правок backend:

```powershell
cd backend
npm run migrate
npm run start
```

Для локального backend нужен заполненный `backend/.env`.

## Кодировки

Проект использует русский интерфейс. Все текстовые файлы с кириллицей должны оставаться UTF-8.

Быстрая проверка:

```powershell
rg "Рџ|Ð|Ñ|�" frontend backend
```

Если найдены реальные mojibake-строки в UI/коде, сначала исправить текст и кодировку, потом пересобирать.

## Git

Минимальная целевая схема:

- `main` - состояние, которое можно деплоить.
- `fix/<short-name>` - багфикс.
- `feature/<short-name>` - новая возможность.
- Инфраструктурные правки коммитить отдельно от бизнес-логики.

Сейчас важно отдельно решить upstream: текущий `main` показывает `origin/main [gone]`. До нормальной командной работы нужно привязать репозиторий к живому remote или переименовать upstream.

## Миграции

Не менять production-схему руками без SQL-файла.

Новая миграция:

```text
backend/src/db/migrations/035_short_description.sql
```

Применение:

```powershell
cd backend
npm run migrate
```

На production миграции запускать через деплой:

```powershell
.\deploy.ps1 backend/src/db/migrations/035_short_description.sql --migrate --restart-backend
```

## Локальный запуск

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

По умолчанию frontend ожидает backend на `http://127.0.0.1:3000/api`.

## Перед передачей задачи другому агенту

Коротко записать:

- что менялось;
- какие файлы затронуты;
- какие команды проверены;
- что не проверено и почему;
- есть ли риск для AQSI, расписания, прав доступа или БД.

## Smoke-check scripts

Локально:

```powershell
.\scripts\smoke-local.ps1
```

Production после деплоя:

```powershell
.\scripts\smoke-production.ps1
```
