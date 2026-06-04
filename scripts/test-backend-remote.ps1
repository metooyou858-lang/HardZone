param(
  [string]$SshKey = "$HOME\.ssh\hardzone_deploy",
  [string]$Target = "root@79.137.162.55",
  [string]$Branch = "",
  [string]$RepoUrl = "https://github.com/metooyou858-lang/HardZone.git"
)

$ErrorActionPreference = "Stop"

function ConvertTo-ShellSingleQuoted {
  param([string]$Value)
  if ($Value.Contains("'")) {
    throw "Shell single quotes are not supported in this value: $Value"
  }
  return "'$Value'"
}

if (-not $Branch) {
  $Branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if (-not $Branch) {
    throw "Cannot determine current Git branch. Pass -Branch explicitly."
  }
}

$quotedBranch = ConvertTo-ShellSingleQuoted $Branch
$quotedRepoUrl = ConvertTo-ShellSingleQuoted $RepoUrl

$remoteScript = @'
set -euo pipefail

: "${BRANCH:?BRANCH is required}"
: "${REPO_URL:?REPO_URL is required}"

run_id="$(date +%Y%m%d_%H%M%S)_$$"
workdir="/tmp/hardzone-ci-$run_id"
db_name="hardzone_test_$run_id"
db_user="hardzone_test_$run_id"
db_pass="$(openssl rand -hex 16)"

cleanup() {
  set +e
  rm -rf "$workdir"
  sudo -u postgres dropdb --if-exists "$db_name" >/dev/null 2>&1
  sudo -u postgres dropuser --if-exists "$db_user" >/dev/null 2>&1
}
trap cleanup EXIT

echo "== remote backend test suite =="
echo "branch: $BRANCH"
echo "workspace: $workdir"
echo "database: $db_name"

echo "== create isolated postgres database =="
sudo -u postgres psql -v ON_ERROR_STOP=1 >/dev/null <<SQL
CREATE USER "$db_user" WITH PASSWORD '$db_pass';
CREATE DATABASE "$db_name" OWNER "$db_user";
SQL

echo "== clone branch =="
su - app -c "git clone --depth 1 --branch '$BRANCH' '$REPO_URL' '$workdir'"

echo "== install backend dependencies =="
su - app -c "cd '$workdir/backend' && npm ci"

database_url="postgres://$db_user:$db_pass@127.0.0.1:5432/$db_name"
session_secret="remote-ci-session-secret"
api_token="remote-ci-api-token"

echo "== run migrations =="
su - app -c "cd '$workdir/backend' && DATABASE_URL='$database_url' HARDZONE_SESSION_SECRET='$session_secret' BACKEND_API_TOKEN='$api_token' NODE_ENV='test' npm run migrate"

echo "== run backend tests =="
su - app -c "cd '$workdir/backend' && DATABASE_URL='$database_url' HARDZONE_SESSION_SECRET='$session_secret' BACKEND_API_TOKEN='$api_token' NODE_ENV='test' npm test"

echo "== remote backend test suite passed =="
'@

$remoteCommand = "tr -d '\r' | BRANCH=$quotedBranch REPO_URL=$quotedRepoUrl bash -s"
$remoteScript | ssh -i $SshKey -o ConnectTimeout=10 $Target $remoteCommand
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
