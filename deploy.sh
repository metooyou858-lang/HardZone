#!/usr/bin/env bash
# deploy.sh — безопасный деплой файлов HardZone на production
#
# Использование:
#   ./deploy.sh [--build-frontend] [--full-frontend] [--restart-frontend]
#               [--restart-backend] [--migrate] [файл ...]
#
# Примеры:
#   ./deploy.sh frontend/app/competition/results/page.tsx --build-frontend --restart-frontend
#   ./deploy.sh --full-frontend --build-frontend --restart-frontend
#   ./deploy.sh --restart-backend
#   ./deploy.sh backend/src/db/migrations/031_foo.sql --migrate --restart-backend

set -euo pipefail

SSH_TARGET="${HARDZONE_SSH_TARGET:-hardzone}"
REMOTE_BASE="/srv/HardZone"
LOCAL_BASE="$(cd "$(dirname "$0")" && pwd)"
SSH_OPTIONS=(-o ConnectTimeout=10)

DO_BUILD_FRONTEND=false
DO_FULL_FRONTEND=false
DO_BUILD_BACKEND=false
DO_RESTART_FRONTEND=false
DO_RESTART_BACKEND=false
DO_MIGRATE=false

FILES=()
FRONTEND_FILES=()
OTHER_FILES=()

for arg in "$@"; do
  case "$arg" in
    --build-frontend)   DO_BUILD_FRONTEND=true ;;
    --full-frontend)    DO_FULL_FRONTEND=true ;;
    --build-backend)    DO_BUILD_BACKEND=true ;;
    --restart-frontend) DO_RESTART_FRONTEND=true ;;
    --restart-backend)  DO_RESTART_BACKEND=true ;;
    --migrate)          DO_MIGRATE=true ;;
    --*)                echo "Неизвестный флаг: $arg" >&2 && exit 1 ;;
    *)                  FILES+=("$arg") ;;
  esac
done

for file in "${FILES[@]}"; do
  if [[ "$file" == frontend/* ]]; then
    FRONTEND_FILES+=("$file")
  else
    OTHER_FILES+=("$file")
  fi
done

if [ "$DO_FULL_FRONTEND" = true ] && [ "$DO_BUILD_FRONTEND" = false ]; then
  echo "ERROR: --full-frontend используется только вместе с --build-frontend." >&2
  exit 2
fi

if [ "$DO_BUILD_FRONTEND" = true ] && [ "$DO_RESTART_FRONTEND" = false ]; then
  echo "ERROR: frontend-сборка должна завершаться атомарным переключением: добавьте --restart-frontend." >&2
  exit 2
fi

if [ "$DO_FULL_FRONTEND" = true ] && [ ${#FRONTEND_FILES[@]} -gt 0 ]; then
  echo "ERROR: не смешивайте --full-frontend с точечными frontend-файлами." >&2
  exit 2
fi

if [ "$DO_BUILD_FRONTEND" = true ] && [ "$DO_FULL_FRONTEND" = false ] && [ ${#FRONTEND_FILES[@]} -eq 0 ]; then
  cat >&2 <<'EOF'
ERROR: полный frontend-деплой больше не запускается неявно.

Для точечной правки перечислите frontend-файлы:
  ./deploy.sh frontend/path/file.tsx --build-frontend --restart-frontend

Для осознанной полной замены из канонического worktree добавьте --full-frontend:
  ./deploy.sh --full-frontend --build-frontend --restart-frontend
EOF
  exit 2
fi

if [ ${#FRONTEND_FILES[@]} -gt 0 ] && [ "$DO_BUILD_FRONTEND" = false ]; then
  echo "ERROR: frontend-файлы нельзя копировать без безопасной сборки; добавьте --build-frontend --restart-frontend." >&2
  exit 2
fi

for file in "${FILES[@]}"; do
  if [ ! -f "$LOCAL_BASE/$file" ]; then
    echo "ERROR: файл не найден: $file" >&2
    exit 2
  fi
done

ssh_cmd() {
  ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" "$@"
}

restart_frontend() {
  ssh_cmd "su - app -c 'cd $REMOTE_BASE/frontend && if pm2 describe hardzone-frontend >/dev/null 2>&1; then pm2 restart hardzone-frontend; else pm2 start npm --name hardzone-frontend -- start -- -p 3001 -H 127.0.0.1; fi'"
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
  shift
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
  scp "${SSH_OPTIONS[@]}" "$LOCAL_BASE/$local_path" "$SSH_TARGET:$remote_path"
}

prepare_frontend_release() {
  local release_path="$1"

  ssh_cmd "mkdir -p '$release_path'"
  if [ "$DO_FULL_FRONTEND" = true ]; then
    echo "=== Готовим полный frontend release ==="
    tar -C "$LOCAL_BASE/frontend" \
      --exclude="./.next*" \
      --exclude="./node_modules" \
      --exclude="./.env*" \
      -czf - . \
      | ssh "${SSH_OPTIONS[@]}" "$SSH_TARGET" "tar -C '$release_path' -xzf -"
  else
    echo "=== Готовим точечный frontend release поверх production ==="
    ssh_cmd "rsync -a --exclude='.next*/' --exclude='node_modules/' --exclude='.env*' '$REMOTE_BASE/frontend/' '$release_path/'"
    for file in "${FRONTEND_FILES[@]}"; do
      local relative_path="${file#frontend/}"
      local remote_path="$release_path/$relative_path"
      echo "→ $file"
      ssh_cmd "mkdir -p '$(dirname "$remote_path")'"
      scp "${SSH_OPTIONS[@]}" "$LOCAL_BASE/$file" "$SSH_TARGET:$remote_path"
    done
  fi

  ssh_cmd "if test -f '$REMOTE_BASE/frontend/.env.local'; then cp '$REMOTE_BASE/frontend/.env.local' '$release_path/.env.local'; fi; chown -R app:app '$release_path'"
}

build_frontend_release() {
  local release_path="$1"
  echo "=== Установка зависимостей frontend release ==="
  ssh_cmd "su - app -c 'cd $release_path && npm ci'"
  echo "=== Изолированная сборка frontend release ==="
  ssh_cmd "su - app -c 'cd $release_path && npm run build'"
  ssh_cmd "test -f '$release_path/.next/prerender-manifest.json'"
}

publish_frontend_release() {
  local release_path="$1"
  local release_id="$2"
  local rollback_path="$REMOTE_BASE/.releases/frontend-rollback-$release_id"
  local source_rollback_path="$REMOTE_BASE/.releases/frontend-source-rollback-$release_id"

  echo "=== Резервная копия и синхронизация проверенных frontend-исходников ==="
  ssh_cmd "mkdir -p '$source_rollback_path'; rsync -a --exclude='.next*/' --exclude='node_modules/' --exclude='.env*' '$REMOTE_BASE/frontend/' '$source_rollback_path/'; rsync -a --delete --exclude='.next*/' --exclude='node_modules/' --exclude='.env*' '$release_path/' '$REMOTE_BASE/frontend/'; chown -R app:app '$REMOTE_BASE/frontend'"

  echo "=== Атомарное переключение frontend-сборки ==="
  if ! ssh_cmd "set -e; test -f '$release_path/.next/prerender-manifest.json'; mv '$REMOTE_BASE/frontend/.next' '$rollback_path'; mv '$release_path/.next' '$REMOTE_BASE/frontend/.next'; chown -R app:app '$REMOTE_BASE/frontend/.next'"; then
    echo "ERROR: не удалось переключить frontend-сборку; возвращаем предыдущие исходники." >&2
    ssh_cmd "if test ! -d '$REMOTE_BASE/frontend/.next' && test -d '$rollback_path'; then mv '$rollback_path' '$REMOTE_BASE/frontend/.next'; chown -R app:app '$REMOTE_BASE/frontend/.next'; fi"
    ssh_cmd "rsync -a --delete --exclude='.next*/' --exclude='node_modules/' --exclude='.env*' '$source_rollback_path/' '$REMOTE_BASE/frontend/'"
    exit 30
  fi

  if ! restart_frontend; then
    echo "ERROR: frontend не перезапустился, возвращаем предыдущую сборку." >&2
    ssh_cmd "mv '$REMOTE_BASE/frontend/.next' '$release_path/.next.failed'; mv '$rollback_path' '$REMOTE_BASE/frontend/.next'; chown -R app:app '$REMOTE_BASE/frontend/.next'"
    ssh_cmd "rsync -a --delete --exclude='.next*/' --exclude='node_modules/' --exclude='.env*' '$source_rollback_path/' '$REMOTE_BASE/frontend/'"
    restart_frontend
    exit 31
  fi

  if ! ssh_cmd "for attempt in 1 2 3 4 5 6 7 8 9 10; do if curl -fsS -o /dev/null 'http://127.0.0.1:3001/login'; then exit 0; fi; sleep 1; done; exit 1"; then
    echo "ERROR: frontend не прошёл health-check, возвращаем предыдущую сборку." >&2
    ssh_cmd "mv '$REMOTE_BASE/frontend/.next' '$release_path/.next.failed'; mv '$rollback_path' '$REMOTE_BASE/frontend/.next'; chown -R app:app '$REMOTE_BASE/frontend/.next'"
    ssh_cmd "rsync -a --delete --exclude='.next*/' --exclude='node_modules/' --exclude='.env*' '$source_rollback_path/' '$REMOTE_BASE/frontend/'"
    restart_frontend
    exit 32
  fi

  ssh_cmd "su - app -c 'pm2 save'"
  echo "Предыдущая frontend-сборка сохранена: $rollback_path"
  echo "Предыдущие frontend-исходники сохранены: $source_rollback_path"

  if [[ "$release_path" == "$REMOTE_BASE/.releases/frontend-"* ]]; then
    ssh_cmd "rm -rf '$release_path'"
  else
    echo "ERROR: отказ от удаления неожиданного release-каталога: $release_path" >&2
    exit 33
  fi
}

# Отдельные не-frontend файлы (миграции, backend-конфигурация и прочее)
if [ ${#OTHER_FILES[@]} -gt 0 ]; then
  preflight_ssh
  echo "=== Копируем файлы ==="
  for file in "${OTHER_FILES[@]}"; do
    scp_file "$file"
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
  sync_dir "backend/src"
  if [ -d "$LOCAL_BASE/backend/certs" ]; then
    sync_dir "backend/certs"
  fi
  ssh_cmd "chown -R app:app '$REMOTE_BASE/backend/src'"
  ssh_cmd "chown -R root:app '$REMOTE_BASE/backend/certs' && chmod 755 '$REMOTE_BASE/backend/certs' && chmod 644 '$REMOTE_BASE/backend/certs/'*"
  if [ "$DO_BUILD_BACKEND" = true ]; then
    echo "=== Установка зависимостей бэкенда ==="
    ssh_cmd "su - app -c 'cd $REMOTE_BASE/backend && npm install --production'"
  fi
  echo "=== Рестарт бэкенда ==="
  if ssh_cmd "test -f '$REMOTE_BASE/backend/certs/russian_trusted_root_ca.pem'"; then
    ssh_cmd "su - app -c 'NODE_EXTRA_CA_CERTS=$REMOTE_BASE/backend/certs/russian_trusted_root_ca.pem pm2 restart inventory-backend --update-env && pm2 save'"
  else
    ssh_cmd "su - app -c 'pm2 restart inventory-backend'"
  fi
fi

if [ "$DO_BUILD_FRONTEND" = true ]; then
  preflight_ssh
  FRONTEND_RELEASE_ID="$(date +%Y%m%d%H%M%S)-$$"
  FRONTEND_RELEASE="$REMOTE_BASE/.releases/frontend-$FRONTEND_RELEASE_ID"
  prepare_frontend_release "$FRONTEND_RELEASE"
  build_frontend_release "$FRONTEND_RELEASE"
  publish_frontend_release "$FRONTEND_RELEASE" "$FRONTEND_RELEASE_ID"
elif [ "$DO_RESTART_FRONTEND" = true ]; then
  preflight_ssh
  echo "=== Рестарт текущего frontend ==="
  restart_frontend
  ssh_cmd "su - app -c 'pm2 save'"
fi

echo "=== Готово ==="
