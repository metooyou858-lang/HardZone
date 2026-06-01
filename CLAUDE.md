# HardZone Claude Notes

This file is intentionally short. Long-lived project knowledge must live in `docs/` so Claude, Codex, and the human owner read the same source.

## Read First

- Project map: `docs/PROJECT_MAP.md`.
- Human command cheat sheet: `docs/COMMANDS.md`.
- Workflow, Git, checks, encodings: `docs/WORKFLOW.md`.
- Production, deploy, SSH, PM2, logs: `docs/OPERATIONS.md`.
- Business rules: `docs/BUSINESS_RULES.md`.
- Technical decisions: `docs/TECH_NOTES.md`.
- AQSI/payments: `docs/PAYMENTS.md`.
- Stabilization plan: `docs/STABILIZATION_PLAN.md`.

## Hard Rules

- Russian UI text must remain UTF-8.
- Do not save `.tsx`, `.ts`, `.js`, `.md`, `.json` through unsafe PowerShell redirection.
- Use the production server `79.137.162.55`; do not use old `80.66.87.178` unless explicitly requested.
- Deploy through `deploy.ps1` / `deploy.sh`; do not run app build or PM2 manually as root.
- Before AQSI changes, check `swagger (3).json` and `docs/PAYMENTS.md`.
