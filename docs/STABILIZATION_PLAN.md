# HardZone Stabilization Plan

Цель: превратить проект из "держится на памяти и ручных действиях" в повторяемую систему, понятную человеку, Codex и Claude.

## Статус

| Этап | Статус | Результат |
| --- | --- | --- |
| 1. Общая карта проекта | Done | `docs/PROJECT_MAP.md` |
| 2. Единый workflow | Done | `docs/WORKFLOW.md` |
| 3. Operations/deploy notes | Done | `docs/OPERATIONS.md` |
| 4. AQSI safety notes | Done | `docs/PAYMENTS.md` |
| 5. Env examples | Done | `backend/.env.example`, `frontend/.env.example` |
| 6. UTF-8/editor rules | Done | `.editorconfig`, mojibake checks in docs |
| 7. Удаление дублей docs | Done | `DEPLOYMENT.md`, копии проектного документа в `frontend/` и `backend/`; `AGENTS.md`/`CLAUDE.md` стали указателями |
| 8. Smoke-check automation | Done | `scripts/smoke-local.ps1`, `scripts/smoke-production.ps1` |
| 9. Git remote/upstream | Todo | `main` сейчас показывает `origin/main [gone]` |
| 10. Staging contour | Todo | Отдельный тестовый сервер или хотя бы staging env на production |
| 11. Backup/restore procedure | Todo | Документированная проверка бэкапа PostgreSQL |

## Ближайшие практические шаги

1. Настроить живой Git remote и upstream для `main`.
2. Зафиксировать инфраструктурный слой отдельным коммитом: docs, env examples, deploy notes, `.editorconfig`.
3. Документировать backup/restore:

```text
docs/BACKUP_RESTORE.md
```

4. После этого переходить к стабилизации конкретных зон: оплаты, расписание, права доступа.

## Правило остановки

Если задача касается AQSI, БД или прав доступа, сначала определить:

- какие таблицы/миграции затронуты;
- какие endpoint меняются;
- какой smoke-check доказывает, что сценарий жив;
- нужен ли деплой сразу или можно оставить локально.
