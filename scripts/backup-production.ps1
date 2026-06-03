param(
  [string]$SshKey = "$HOME\.ssh\hardzone_deploy",
  [string]$Target = "root@79.137.162.55",
  [string]$AppPath = "/srv/HardZone",
  [string]$BackupDir = "/srv/backups/hardzone"
)

$ErrorActionPreference = "Stop"

function ConvertTo-ShellSingleQuoted {
  param([string]$Value)
  if ($Value.Contains("'")) {
    throw "Remote paths with single quotes are not supported: $Value"
  }
  return "'$Value'"
}

$quotedAppPath = ConvertTo-ShellSingleQuoted $AppPath
$quotedBackupDir = ConvertTo-ShellSingleQuoted $BackupDir

$remoteScript = @'
set -euo pipefail

: "${APP_PATH:?APP_PATH is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"

mkdir -p "$BACKUP_DIR"
chown app:app "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

cd "$APP_PATH/backend"
backup_file="$BACKUP_DIR/hardzone_$(date +%Y%m%d_%H%M%S).dump"
database_url="$(sed -n "s/^DATABASE_URL=//p" .env | tail -n 1)"

if [ -n "$database_url" ]; then
  pg_dump --format=custom --no-owner --no-privileges --file="$backup_file" "$database_url"
else
  db_host="$(sed -n "s/^DB_HOST=//p" .env | tail -n 1)"
  db_port="$(sed -n "s/^DB_PORT=//p" .env | tail -n 1)"
  db_name="$(sed -n "s/^DB_NAME=//p" .env | tail -n 1)"
  db_user="$(sed -n "s/^DB_USER=//p" .env | tail -n 1)"
  db_password="$(sed -n "s/^DB_PASSWORD=//p" .env | tail -n 1)"

  PGPASSWORD="$db_password" pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file="$backup_file" \
    -h "${db_host:-127.0.0.1}" \
    -p "${db_port:-5432}" \
    -U "$db_user" \
    -d "$db_name"
fi

echo "Created backup:"
ls -lh "$backup_file"
chown app:app "$backup_file"
chmod 640 "$backup_file"

echo
echo "Recent backups:"
ls -lh "$BACKUP_DIR" | tail -n 10
'@

$remoteCommand = "tr -d '\r' | APP_PATH=$quotedAppPath BACKUP_DIR=$quotedBackupDir bash -s"
$remoteScript | ssh -i $SshKey -o ConnectTimeout=10 $Target $remoteCommand
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
