#!/usr/bin/env bash
# deploy.sh — деплой файлов HardZone на продовый сервер
#
# Использование:
#   ./deploy.sh [--build-frontend] [--restart-frontend] [--restart-backend] [--migrate] [файл ...]
#
# Примеры:
#   ./deploy.sh --restart-backend
#   ./deploy.sh --build-frontend --restart-frontend
#   ./deploy.sh --build-frontend --restart-frontend --restart-backend
#   ./deploy.sh backend/src/db/migrations/031_foo.sql --migrate --restart-backend

set -euo pipefail

SSH_TARGET="${HARDZONE_SSH_TARGET:-hardzone}"
REMOTE_BASE="/srv/HardZone"
LOCAL_BASE="$(cd "$(dirname "$0")" && pwd)"
SSH_OPTIONS=(-o ConnectTimeout=10)

DO_BUILD_FRONTEND=false
DO_BUILD_BACKEND=false
DO_RESTART_FRONTEND=false
DO_RESTART_BACKEND=false
DO_MIGRATE=false

FILES=()

for arg in "$@"; do
  case "$arg" in
    --build-frontend)   DO_BUILD_FRONTEND=true ;;
    --build-backend)    DO_BUILD_BACKEND=true ;;
    --restart-frontend) DO_RESTART_FRONTEND=true ;;
    --restart-backend)  DO_RESTART_BACKEND=true ;;
    --migrate)          DO_MIGRATE=true ;;
    --*)                echo "Неизвестный флаг: $arg" && exit 1 ;;
    *)                  FILES+=("$arg") ;;
  esac
done

ssh_cmd() {
  ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" "$@"
}

restart_frontend() {
  ssh_cmd "su - app -c 'cd $REMOTE_BASE/frontend && pm2 delete hardzone-frontend >/dev/null 2>&1 || true; cd $REMOTE_BASE/frontend && pm2 start npm --name hardzone-frontend -- start -- -p 3001 -H 127.0.0.1; pm2 save'"
}

preflight_ssh() {
  echo "=== SSH preflight: $SSH_TARGET ==="
  if ! ssh -o BatchMode=yes "${SSH_OPTIONS[@]}" "$SSH_TARGET" "echo ok" >/dev/null; then
    cat >&2 <<'EOF'
ERROR: cannot connect to the HardZone server over SSH.

Expected local SSH config:
  Host hardzone
    HostName 79.137.162.55
    User root
    IdentityFile ~/.ssh/hardzone_deploy
    IdentitiesOnly yes

If this times out, the problem is network/firewall/provider access to TCP 22,
not the deploy script or app code. Open SSH in the VPS firewall/security group
or connect from the allowed network/VPN, then rerun the same deploy command.
EOF
    exit 20
  fi
}

sync_dir() {
  local local_dir="$1"
  local remote_dir="$2"
  shift 2
  # tar excludes passed as remaining args, e.g. --exclude='frontend/.next'
  echo "→ $local_dir/"
  tar -C "$LOCAL_BASE" "$@" -czf - "$local_dir" \
    | ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" \
        "tar -C '$REMOTE_BASE' -xzf -"
}

scp_file() {
  local local_path="$1"
  local remote_path="$REMOTE_BASE/$local_path"
  echo "→ $local_path"
  ssh_cmd "mkdir -p '$(dirname "$remote_path")'"
  scp "${SSH_OPTIONS[@]}" \
    "$LOCAL_BASE/$local_path" \
    "$SSH_TARGET:$remote_path"
}

# Отдельные файлы (для миграций и прочего)
if [ ${#FILES[@]} -gt 0 ]; then
  preflight_ssh
  echo "=== Копируем файлы ==="
  for f in "${FILES[@]}"; do
    scp_file "$f"
  done
fi

# Миграции
if [ "$DO_MIGRATE" = true ]; then
  preflight_ssh
  echo "=== Миграции ==="
  ssh_cmd "su - app -c 'cd $REMOTE_BASE/backend && node src/db/migrate.js'"
fi

# Бэкенд: sync src/ → рестарт
if [ "$DO_RESTART_BACKEND" = true ]; then
  preflight_ssh
  echo "=== Синхронизация бэкенда ==="
  sync_dir "backend/src" "backend"
  ssh_cmd "chown -R app:app '$REMOTE_BASE/backend/src'"
  if [ "$DO_BUILD_BACKEND" = true ]; then
    echo "=== Установка зависимостей бэкенда ==="
    ssh_cmd "su - app -c 'cd $REMOTE_BASE/backend && npm install --production'"
  fi
  echo "=== Рестарт бэкенда ==="
  ssh_cmd "su - app -c 'pm2 restart inventory-backend'"
fi

# Фронтенд: sync исходников → сборка → рестарт
if [ "$DO_BUILD_FRONTEND" = true ]; then
  preflight_ssh
  echo "=== Синхронизация фронтенда ==="
  sync_dir "frontend" "." \
    --exclude="frontend/.next" \
    --exclude="frontend/node_modules" \
    --exclude="frontend/.env*"
  ssh_cmd "chown -R app:app '$REMOTE_BASE/frontend'"
  echo "=== Сборка фронтенда ==="
  ssh_cmd "su - app -c 'cd $REMOTE_BASE/frontend && npm run build'"
fi

if [ "$DO_RESTART_FRONTEND" = true ]; then
  preflight_ssh
  echo "=== Рестарт фронтенда ==="
  restart_frontend
fi

echo "=== Готово ==="
