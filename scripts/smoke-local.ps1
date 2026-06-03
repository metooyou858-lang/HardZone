param(
  [switch]$SkipFrontendBuild,
  [switch]$SkipFrontendLint,
  [switch]$SkipBackendMigrate
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "== mojibake scan =="
$mojibakePattern = "\x{0420}\x{045F}|\x{00D0}|\x{00D1}|\x{FFFD}"
& rg --line-number $mojibakePattern "$repoRoot\frontend" "$repoRoot\backend"
$mojibakeExitCode = $LASTEXITCODE
if ($mojibakeExitCode -gt 1) { exit $mojibakeExitCode }
if ($mojibakeExitCode -eq 0) {
  Write-Error "Mojibake markers found"
  exit 1
}
$global:LASTEXITCODE = 0

if (-not $SkipFrontendLint) {
  Write-Host "== frontend lint =="
  Push-Location "$repoRoot\frontend"
  try {
    npm run lint
  } finally {
    Pop-Location
  }
}

if (-not $SkipFrontendBuild) {
  Write-Host "== frontend build =="
  Push-Location "$repoRoot\frontend"
  try {
    npm run build
  } finally {
    Pop-Location
  }
}

if (-not $SkipBackendMigrate) {
  Write-Host "== backend migrate =="
  Push-Location "$repoRoot\backend"
  try {
    npm run migrate
  } finally {
    Pop-Location
  }
}

Write-Host "== ok =="
exit 0
