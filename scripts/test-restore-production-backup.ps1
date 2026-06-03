param(
  [string]$SshKey = "$HOME\.ssh\hardzone_deploy",
  [string]$Target = "root@79.137.162.55",
  [string]$BackupDir = "/srv/backups/hardzone",
  [string]$BackupFile = "",
  [switch]$KeepDatabase
)

$ErrorActionPreference = "Stop"

function ConvertTo-ShellSingleQuoted {
  param([string]$Value)
  if ($Value.Contains("'")) {
    throw "Remote values with single quotes are not supported: $Value"
  }
  return "'$Value'"
}

$quotedBackupDir = ConvertTo-ShellSingleQuoted $BackupDir
$quotedBackupFile = ConvertTo-ShellSingleQuoted $BackupFile
$dropAfter = if ($KeepDatabase) { "false" } else { "true" }

$remoteScript = @'
set -euo pipefail

: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_FILE:=}"
: "${DROP_AFTER:=true}"

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE="$(ls -1t "$BACKUP_DIR"/hardzone_*.dump 2>/dev/null | head -n 1 || true)"
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: ${BACKUP_FILE:-<latest in $BACKUP_DIR>}" >&2
  exit 1
fi

restore_db="hardzone_restore_$(date +%Y%m%d_%H%M%S)"
restore_file="/tmp/${restore_db}.dump"

cleanup() {
  rm -f "$restore_file" >/dev/null 2>&1 || true
  if [ "$DROP_AFTER" = "true" ]; then
    sudo -u postgres dropdb --if-exists "$restore_db" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== restore target =="
echo "backup_file=$BACKUP_FILE"
echo "restore_db=$restore_db"

cp "$BACKUP_FILE" "$restore_file"
chmod 644 "$restore_file"

sudo -u postgres createdb "$restore_db"
sudo -u postgres pg_restore --no-owner --no-privileges --dbname "$restore_db" "$restore_file"

echo
echo "== table counts =="
sudo -u postgres psql -d "$restore_db" -Atc "SELECT 'users=' || COUNT(*) FROM users;"
sudo -u postgres psql -d "$restore_db" -Atc "SELECT 'clients=' || COUNT(*) FROM clients;"
sudo -u postgres psql -d "$restore_db" -Atc "SELECT 'orders=' || COUNT(*) FROM orders;"
sudo -u postgres psql -d "$restore_db" -Atc "SELECT 'schema_migrations=' || COUNT(*) FROM schema_migrations;"

echo
if [ "$DROP_AFTER" = "true" ]; then
  echo "restore_check=ok; temporary database will be dropped"
else
  echo "restore_check=ok; temporary database kept: $restore_db"
fi
'@

$remoteCommand = "tr -d '\r' | BACKUP_DIR=$quotedBackupDir BACKUP_FILE=$quotedBackupFile DROP_AFTER=$dropAfter bash -s"
$remoteScript | ssh -i $SshKey -o ConnectTimeout=10 $Target $remoteCommand
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
