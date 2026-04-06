param(
  [string]$ConfigPath = "deploy/github-config.txt"
)

$ErrorActionPreference = "Stop"

$ghCommand = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghCommand) {
  $fallbackGh = "C:\Program Files\GitHub CLI\gh.exe"
  if (Test-Path $fallbackGh) {
    $ghCommand = @{ Source = $fallbackGh }
  } else {
    throw "GitHub CLI (gh) is not installed or not on PATH. Restart PowerShell after installing it, then run again."
  }
}

$gh = $ghCommand.Source

if (-not (Test-Path $ConfigPath)) {
  throw "Config file not found: $ConfigPath"
}

$variables = @(
  "VPS_HOST",
  "VPS_USER",
  "PUBLIC_URL",
  "GHCR_USERNAME"
)

$secrets = @(
  "VPS_SSH_PASSPHRASE",
  "POSTGRES_PASSWORD",
  "NEXTAUTH_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ENCRYPTION_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GEMINI_API_KEY",
  "GHCR_TOKEN"
)

$values = @{}

foreach ($line in Get-Content $ConfigPath) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith("#")) {
    continue
  }

  $parts = $trimmed -split "=", 2
  if ($parts.Length -ne 2) {
    throw "Invalid line in config: $line"
  }

  $key = $parts[0].Trim()
  $value = $parts[1].Trim()
  $values[$key] = $value
}

$required = @(
  "VPS_HOST",
  "VPS_USER",
  "PUBLIC_URL",
  "GHCR_USERNAME",
  "VPS_SSH_KEY_FILE",
  "VPS_SSH_PASSPHRASE",
  "POSTGRES_PASSWORD",
  "NEXTAUTH_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ENCRYPTION_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GEMINI_API_KEY",
  "GHCR_TOKEN"
)

foreach ($key in $required) {
  if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
    throw "Missing required key in config: $key"
  }
}

$sshKeyFile = $values["VPS_SSH_KEY_FILE"]
if (-not (Test-Path $sshKeyFile)) {
  throw "SSH key file not found: $sshKeyFile"
}

Write-Host "Checking GitHub authentication..."
& $gh auth status

foreach ($name in $variables) {
  $value = $values[$name]
  Write-Host "Setting GitHub variable $name"
  & $gh variable set $name --body $value
}

Write-Host "Setting GitHub secret VPS_SSH_KEY from file"
Get-Content $sshKeyFile -Raw | & $gh secret set VPS_SSH_KEY

foreach ($name in $secrets) {
  $value = $values[$name]
  Write-Host "Setting GitHub secret $name"
  & $gh secret set $name --body $value
}

Write-Host ""
Write-Host "GitHub variables and secrets uploaded successfully."
