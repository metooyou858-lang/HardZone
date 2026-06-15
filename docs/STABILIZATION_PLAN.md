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
| 12. Backup/restore procedure | Done | `docs/BACKUP_RESTORE.md`, `scripts/backup-production.ps1`, `scripts/test-restore-production-backup.ps1`; latest production backup restored successfully before Telegram phone migration: `/srv/backups/hardzone/hardzone_20260604_061113.dump` |
| 13. Staging contour | Done | `/srv/HardZone-staging`, DB `hardzone_staging`, ports `3100/3101`, separate PM2 processes |
| 14. Auth/access test coverage | Done | `backend/test/auth.test.js`, runs in CI |
| 15. Production error hygiene | Done | 500 responses no longer expose raw errors in covered backend routes |
| 16. SSH hardening | Done | Host key must be in `known_hosts`; password login disabled |
| 17. Node version policy | Done | `.nvmrc`, `.node-version`, Node `24.14.1` |
| 18. Domain migration | Done | DNS, nginx and Let's Encrypt are configured for `hardzone.space` and `www.hardzone.space`; certificate expires on `2026-09-01` |
| 19. Access model | In progress | Backend guards, access presets, staff API and Telegram staff bot implemented; frontend/session tests still pending |
| 20. Telegram staff bot | Done | Phone-based staff linking, schedule/client/booking/attendance actions, production polling process `hardzone-telegram-poller` |

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
4. Extend Telegram staff bot UX after live staff feedback.
5. Fix effective subscription validity: expired `active` subscriptions must not appear usable in CRM, Telegram Mini Apps, or booking flows.
6. Replace raw `<img>` tags in Telegram Mini Apps with `next/image` or explicitly document why plain images are kept for Telegram runtime stability.
7. Continue client card work from a clean product branch, not from older hotfix branches. Current direction: `feature/client-photo` adds CRM client photo storage/display first, then client-side upload and legacy subscription import in separate follow-up branches.
8. Legacy subscription import is tracked in `feature/legacy-subscription-import`; rules and CSV format live in `docs/LEGACY_SUBSCRIPTION_IMPORT.md`.
9. Manual legacy subscriptions are controlled by `clients_legacy_subscriptions`; only users with this permission can add old subscriptions from a client card.

## Next Product Work: Athlete Diary

Agreed direction:

1. Add a separate CRM module `Тренировки`.
   - Trainer creates a workout/program of the day.
   - Trainer links the workout to schedule slots or training types.
   - The workout is not created inside an individual client card.
2. Keep the client card focused on the client and athlete profile.
   - Client data: name, birth date, phone, email, discount, comment, barcode.
   - Membership data: active subscriptions and subscription history.
   - Attendance data: visited classes.
   - Athlete profile: strength metrics, skills, goals, limitations.
3. Athlete profile metrics to model first:
   - 1RM back squat;
   - 1RM front squat;
   - 1RM overhead squat;
   - 1RM snatch;
   - 1RM clean and jerk;
   - 1RM clean;
   - 1RM deadlift;
   - 1RM bench press;
   - 1RM strict press;
   - 1RM push jerk;
   - max strict pull-ups;
   - 1 km row;
   - 5 km run;
   - 10 km run.
4. Telegram client cabinet should be treated as `Дневник атлета`.
   - Preserve existing agreed tabs and flows.
   - Show backend/CRM data only; no separate mock/demo product logic.
   - Do not show staff-only financial/administrative details to the athlete.
5. REST Client can be added as a helper for manual API checks.
   - Suggested files: `docs/api-requests/clients.http`, `schedule.http`, `telegram.http`, `workouts.http`.
   - Do not commit real tokens, cookies, AQSI keys, or dangerous production write requests.
   - REST Client is not a replacement for CI, remote backend tests, or production smoke checks.

## Current Production Notes

- Production backend: `inventory-backend`, PM2, port `3000`.
- Production frontend: `hardzone-frontend`, PM2, port `3001`.
- Telegram bot runs by polling process `hardzone-telegram-poller`; webhook is intentionally not active because Telegram delivery to the server timed out.
- Server `/etc/hosts` pins `api.telegram.org` to a working Telegram API IP after DNS-selected Telegram IP timed out from `79.137.162.55`.
- Telegram staff auth links by shared phone contact against `users.phone_normalized`; forwarded/other contacts are rejected.
- Remote backend tests are the source of truth for backend/integration checks: `.\scripts\test-backend-remote.ps1`.

## Stop Rule

If a task touches AQSI, database schema, schedule/attendance, subscriptions, or access rights, first define:

- affected tables/migrations;
- affected endpoints;
- smoke-check or test proving the path still works;
- whether staging is enough or production deploy is required;
- whether a fresh backup is needed before the change.
