param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )
  Write-Host "==> $Name"
  & $Action
}

Invoke-Step "Build web app" { npm --prefix apps/web run build }
Invoke-Step "Build worker" { npm --prefix worker run build }

Invoke-Step "Check scraper syntax" {
  if (Get-Command python -ErrorAction SilentlyContinue) {
    python -m compileall apps/scraper
  }
}

Invoke-Step "Git add" { git add -A }

$status = git status --porcelain
if (-not $status) {
  Write-Host "No changes to commit."
  exit 0
}

if (-not $Message) {
  $Message = "chore: release"
}

Invoke-Step "Commit" { git commit -m $Message }
Invoke-Step "Push" { git push origin main }

