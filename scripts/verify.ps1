param(
  [ValidateSet("Quick", "Full")]
  [string]$Profile = "Quick"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-Step {
  param([string]$Name, [scriptblock]$Command)
  Write-Host "[$Name] RUN"
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
  Write-Host "[$Name] PASS"
}

Push-Location $repoRoot
try {
  Invoke-Step "git-diff" { git diff --check }
  Invoke-Step "mojibake" { & "$PSScriptRoot\smoke-local.ps1" -SkipFrontendLint -SkipFrontendBuild -SkipBackendMigrate }
  Invoke-Step "backend-syntax" {
    Get-ChildItem "$repoRoot\backend\src" -Recurse -Filter *.js | ForEach-Object {
      node --check $_.FullName
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
  }
  Invoke-Step "frontend-lint" {
    Push-Location "$repoRoot\frontend"
    try { npm run lint } finally { Pop-Location }
  }

  if ($Profile -eq "Full") {
    Invoke-Step "frontend-build" {
      Push-Location "$repoRoot\frontend"
      try { npm run build } finally { Pop-Location }
    }
    Invoke-Step "remote-backend-tests" { & "$PSScriptRoot\test-backend-remote.ps1" }
  }

  Write-Host "[verify] PASS profile=$Profile"
} finally {
  Pop-Location
}
