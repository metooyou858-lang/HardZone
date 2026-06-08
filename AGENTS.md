# HardZone Agent Notes

Этот файл - короткий вход для Codex. Не держать здесь длинную проектную память: общий источник правды лежит в `docs/`.

## Читать перед работой

- Карта проекта: `docs/PROJECT_MAP.md`.
- Команды для пользователя: `docs/COMMANDS.md`.
- Workflow, Git, проверки, кодировки: `docs/WORKFLOW.md`.
- Production, деплой, SSH, PM2, логи: `docs/OPERATIONS.md`.
- Backup/restore: `docs/BACKUP_RESTORE.md`.
- Staging: `docs/STAGING.md`.
- Роли и доступы: `docs/ACCESS_MODEL.md`.
- Бизнес-правила: `docs/BUSINESS_RULES.md`.
- Технические решения: `docs/TECH_NOTES.md`.
- AQSI/оплаты: `docs/PAYMENTS.md`.
- План стабилизации: `docs/STABILIZATION_PLAN.md`.

## Короткие правила

- Проект использует русскоязычный интерфейс; файлы с кириллицей сохранять в UTF-8.
- Для ручных правок использовать `apply_patch`, не PowerShell redirection и не `Set-Content` без явного контроля кодировки.
- Коммитить в ветках по смыслу задачи, а не в случайно активной ветке; перед коммитом сверять текущую задачу с названием ветки.
- После frontend/backend-правок проверять mojibake или запускать `.\scripts\smoke-local.ps1 -SkipFrontendLint -SkipFrontendBuild -SkipBackendMigrate`.
- Backend/integration-проверки HardZone выполнять удалённо на сервере `79.137.162.55` или в CI. Не завязывать тестовый процесс на локальный компьютер, локальный Docker или локальный PostgreSQL.
- Production-сервер: `79.137.162.55`; старый `80.66.87.178` не использовать без явной просьбы.
- Домен в настройке: `hardzone.space`, `www.hardzone.space`.
- Деплой с Windows запускать через `.\deploy.ps1`, подробности в `docs/OPERATIONS.md`.
- Перед risky production work запускать `.\scripts\backup-production.ps1` и проверять restore через `.\scripts\test-restore-production-backup.ps1`.
- Перед изменением AQSI сверять `swagger (3).json` и `docs/PAYMENTS.md`.
