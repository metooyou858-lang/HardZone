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
| 6. UTF-8/editor rules | Done | `.editorconfig`, frontend mojibake scan in CI |
| 7. Удаление дублей docs | Done | Старые дубли убраны/сведены к указателям |
| 8. Smoke-check automation | Done | `scripts/smoke-local.ps1`, `scripts/smoke-production.ps1`, `scripts/smoke-staging.ps1` |
| 9. Git remote/upstream | Done | Ветка работает через GitHub `origin`; production `server` не использовать случайно |
| 10. AQSI Swagger in Git | Done | `swagger (3).json` хранится в репозитории |
| 11. CI | Done | GitHub Actions: frontend lint/build, backend migrate/test, frontend mojibake scan |
| 12. Backup/restore procedure | Done | `docs/BACKUP_RESTORE.md`; production backup: `/srv/backups/hardzone/hardzone_20260602_023608.dump` |
| 13. Staging contour | Done | `/srv/HardZone-staging`, DB `hardzone_staging`, ports `3100/3101`, separate PM2 processes |
| 14. Auth/access test coverage | Done | `backend/test/auth.test.js`, runs in CI |
| 15. Production error hygiene | Done | 500 responses no longer expose raw errors in covered backend routes; temporary password hidden in production |
| 16. SSH hardening | Done | Removed `StrictHostKeyChecking=no`; host key must be in `known_hosts` |
| 17. Node version policy | Done | `.nvmrc`, `.node-version`, Node `24.14.1` |

## Current Safety Gates

Before production work:

1. GitHub Actions must be green.
2. For DB/payment/schedule/access changes, create or confirm a recent production backup.
3. Test risky changes on staging first.
4. Deploy production through `.\deploy.ps1`, not direct `git push server main`.
5. Run `.\scripts\smoke-production.ps1` after deploy.

## Remaining Non-Blocking Work

1. Review `npm audit` findings:
   - backend currently reports 6 vulnerabilities;
   - frontend currently reports 3 vulnerabilities.
2. Clean backend/docs mojibake gradually.
3. Extend auth tests to frontend cookie/session route flow.
4. Consider a dedicated staging domain/nginx route if external staging access is needed.

## Stop Rule

If a task touches AQSI, database schema, schedule/attendance, subscriptions, or access rights, first define:

- affected tables/migrations;
- affected endpoints;
- smoke-check or test proving the path still works;
- whether staging is enough or production deploy is required;
- whether a fresh backup is needed before the change.
