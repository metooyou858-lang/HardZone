$ErrorActionPreference = 'Stop'
$testArchive = Join-Path $env:TEMP 'hardzone-competition-tests.tgz'
tar -czf $testArchive backend/src backend/test backend/package.json
if ($LASTEXITCODE -ne 0) { throw 'Archive failed' }
scp -i "$HOME/.ssh/hardzone_deploy" $testArchive root@79.137.162.55:/tmp/hardzone-competition-tests.tgz
if ($LASTEXITCODE -ne 0) { throw 'Upload failed' }
$remote = @'
set -euo pipefail
run_id="$(date +%Y%m%d_%H%M%S)_$$"
workdir="/tmp/hardzone-competition-$run_id"
db_name="hz_comp_$run_id"
db_pass="$(openssl rand -hex 16)"
cleanup() {
  sudo -u postgres dropdb --if-exists "$db_name" >/dev/null
  sudo -u postgres dropuser --if-exists "$db_name" >/dev/null
}
trap cleanup EXIT
mkdir -p "$workdir"
tar -xzf /tmp/hardzone-competition-tests.tgz -C "$workdir"
ln -s /srv/HardZone/backend/node_modules "$workdir/backend/node_modules"
chown -R app:app "$workdir"
sudo -u postgres psql -v ON_ERROR_STOP=1 >/dev/null <<SQL
CREATE USER "$db_name" WITH PASSWORD '$db_pass';
CREATE DATABASE "$db_name" OWNER "$db_name";
SQL
export DATABASE_URL="postgres://$db_name:$db_pass@127.0.0.1:5432/$db_name"
export HARDZONE_SESSION_SECRET=isolated-test-secret
export BACKEND_API_TOKEN=isolated-test-token
export NODE_ENV=test
export COMPETITION_AUTOMATION_ENABLED=false
cd "$workdir/backend"
sudo -u app --preserve-env=DATABASE_URL,HARDZONE_SESSION_SECRET,BACKEND_API_TOKEN,NODE_ENV,COMPETITION_AUTOMATION_ENABLED timeout 90 node src/db/migrate.js > "$workdir/migrations.log" 2>&1 || { cat "$workdir/migrations.log"; exit 1; }
sudo -u app --preserve-env=DATABASE_URL,HARDZONE_SESSION_SECRET,BACKEND_API_TOKEN,NODE_ENV,COMPETITION_AUTOMATION_ENABLED timeout 120 node --test test/competition-registration.test.js test/tbank-competition.test.js test/competition-automation.test.js test/competition-events.test.js test/competition-schedule.test.js
echo "Evidence: $workdir"
'@
$remote | ssh -i "$HOME/.ssh/hardzone_deploy" root@79.137.162.55 "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
