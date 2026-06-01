param(
  [switch]$SkipFrontendBuild,
  [switch]$SkipFrontendLint,
  [switch]$SkipBackendMigrate
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "== mojibake scan =="
& rg "Рџ|Ð|Ñ|�" "$repoRoot\frontend" "$repoRoot\backend"
if ($LASTEXITCODE -gt 1) { exit $LASTEXITCODE }
if ($LASTEXITCODE -eq 1) { $global:LASTEXITCODE = 0 }

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
