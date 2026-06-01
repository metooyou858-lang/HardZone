# HardZone Agent Notes

Этот файл - короткий вход для Codex. Не держать здесь длинную проектную память: общий источник правды лежит в `docs/`.

## Читать перед работой

- Карта проекта: `docs/PROJECT_MAP.md`.
- Workflow, Git, проверки, кодировки: `docs/WORKFLOW.md`.
- Production, деплой, SSH, PM2, логи: `docs/OPERATIONS.md`.
- Бизнес-правила: `docs/BUSINESS_RULES.md`.
- Технические решения: `docs/TECH_NOTES.md`.
- AQSI/оплаты: `docs/PAYMENTS.md`.
- План стабилизации: `docs/STABILIZATION_PLAN.md`.

## Короткие правила

- Проект использует русскоязычный интерфейс; файлы с кириллицей сохранять в UTF-8.
- Для ручных правок использовать `apply_patch`, не PowerShell redirection и не `Set-Content` без явного контроля кодировки.
- После frontend-правок проверять mojibake: `rg "Рџ|Ð|Ñ|�" frontend`.
- Production-сервер: `79.137.162.55`; старый `80.66.87.178` не использовать без явной просьбы.
- Деплой с Windows запускать через `.\deploy.ps1`, подробности в `docs/OPERATIONS.md`.
- Перед изменением AQSI сверять `swagger (3).json` и `docs/PAYMENTS.md`.
