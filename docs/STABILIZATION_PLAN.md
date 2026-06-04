# HardZone Stabilization Plan

Цель: превратить проект из набора ручных операций в повторяемую систему, понятную человеку, Codex и Claude.

## Статус

| Этап | Статус | Результат |
| --- | --- | --- |
| 1. Карта проекта | Done | `docs/PROJECT_MAP.md` |
| 2. Единый workflow | Done | `docs/WORKFLOW.md` |
| 3. Operations/deploy notes | Done | `docs/OPERATIONS.md` |
| 4. AQSI safety notes | Done | `docs/PAYMENTS.md` |
| 5. Env examples | Done | `backend/.env.example`, `frontend/.env.example` |
| 6. UTF-8/editor rules | Done | `.editorconfig`, mojibake scan |
| 7. Удаление дублей docs | Done | Старые дубли сведены к указателям или архивным документам |
| 8. Smoke-check automation | Done | `scripts/smoke-local.ps1`, `scripts/smoke-production.ps1`, `scripts/smoke-staging.ps1` |
| 9. Git remote/upstream | Done | GitHub `origin`; production `server` не использовать случайно |
| 10. AQSI Swagger in Git | Done | `swagger (3).json` хранится в репозитории |
| 11. CI | Done | GitHub Actions: frontend lint/build, backend migrate/test, mojibake scan |
| 12. Backup/restore procedure | Done | `docs/BACKUP_RESTORE.md`, `scripts/backup-production.ps1`, `scripts/test-restore-production-backup.ps1`; latest production backup restored successfully: `/srv/backups/hardzone/hardzone_20260603_044731.dump` |
| 13. Staging contour | Done | `/srv/HardZone-staging`, DB `hardzone_staging`, ports `3100/3101`, separate PM2 processes |
| 14. Auth/access test coverage | Done | `backend/test/auth.test.js`, runs in CI |
| 15. Production error hygiene | Done | 500 responses no longer expose raw errors in covered backend routes |
| 16. SSH hardening | Done | Host key must be in `known_hosts`; password login disabled |
| 17. Node version policy | Done | `.nvmrc`, `.node-version`, Node `24.14.1` |
| 18. Domain migration | Done | DNS, nginx and Let's Encrypt are configured for `hardzone.space` and `www.hardzone.space`; certificate expires on `2026-09-01` |
| 19. Access model | In progress | Backend guards and access presets implemented for sales, schedule and clients; frontend/session tests and Telegram API pending |

## Current Safety Gates

Before production work:

1. GitHub Actions must be green.
2. For DB/payment/schedule/access changes, create or confirm a recent production backup.
3. Test risky changes on staging first.
4. Deploy production through `.\deploy.ps1`, not direct `git push server main`.
5. Run `.\scripts\smoke-production.ps1` after deploy.

## Remaining Work

1. Continue cleaning older archive docs mojibake gradually if they are still needed.
2. Review `npm audit` findings.
3. Extend auth tests to frontend cookie/session route flow.
4. Design Telegram staff API contracts from `docs/ACCESS_MODEL.md`.

## Stop Rule

If a task touches AQSI, database schema, schedule/attendance, subscriptions, or access rights, first define:

- affected tables/migrations;
- affected endpoints;
- smoke-check or test proving the path still works;
- whether staging is enough or production deploy is required;
- whether a fresh backup is needed before the change.
