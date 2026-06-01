$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$bashCandidates = @(
  "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe",
  "$env:LOCALAPPDATA\Programs\Git\usr\bin\bash.exe",
  "C:\Program Files\Git\bin\bash.exe",
  "C:\Program Files\Git\usr\bin\bash.exe"
)

$bash = $bashCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $bash) {
  throw "Git Bash was not found. Install Git for Windows or add bash.exe to PATH."
}

& $bash "$repoRoot/deploy.sh" @args
exit $LASTEXITCODE
