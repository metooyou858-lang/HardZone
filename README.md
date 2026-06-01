# HardZone

CRM для CrossFit-клуба HardZone: `frontend/` (Next.js) + `backend/` (Express/PostgreSQL).

## Быстрый вход

- Карта проекта: `docs/PROJECT_MAP.md`.
- Рабочий процесс: `docs/WORKFLOW.md`.
- Production, деплой, логи: `docs/OPERATIONS.md`.
- Бизнес-правила: `docs/BUSINESS_RULES.md`.
- Технические решения: `docs/TECH_NOTES.md`.
- AQSI и оплаты: `docs/PAYMENTS.md`.
- План стабилизации: `docs/STABILIZATION_PLAN.md`.
- Правила для Codex: `AGENTS.md`.
- Правила/память для Claude: `CLAUDE.md`.

## Локальный запуск

Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run migrate
npm run dev
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Секреты и рабочие `.env` файлы в репозиторий не включены.

## Минимальные проверки

```bash
cd frontend && npm run lint && npm run build
cd ../backend && npm run migrate
```

Для файлов с кириллицей сохранять UTF-8. Быстрая проверка mojibake:

```bash
rg "Рџ|Ð|Ñ|�" frontend backend
```
