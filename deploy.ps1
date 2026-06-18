# Deploy SEVEN to Fly.io
# Run: deploy.bat

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$flyDir = Join-Path $env:USERPROFILE '.fly\bin'
$flyExe = Join-Path $flyDir 'flyctl.exe'

function Download-FlyZip {
  param([string]$Url, [string]$ZipPath)

  Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
  $minBytes = 45000000

  for ($try = 1; $try -le 5; $try++) {
    Write-Host "Download attempt $try of 5..." -ForegroundColor Yellow
    try {
      curl.exe -L --retry 3 --retry-delay 5 -o $ZipPath $Url
      if ((Test-Path $ZipPath) -and (Get-Item $ZipPath).Length -ge $minBytes) {
        return
      }
      Write-Host "File too small or missing. Retrying..." -ForegroundColor Yellow
    } catch {
      Write-Host "Download error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    Start-Sleep -Seconds 3
  }

  throw 'flyctl download failed. Check internet and run deploy.bat again.'
}

function Ensure-Fly {
  if (Test-Path $flyExe) { return $flyExe }
  if (Get-Command fly -ErrorAction SilentlyContinue) { return (Get-Command fly).Source }

  Write-Host 'Installing Fly CLI (~50 MB, one time)...' -ForegroundColor Yellow
  New-Item -ItemType Directory -Force -Path $flyDir | Out-Null

  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/superfly/flyctl/releases/latest'
  $asset = $release.assets | Where-Object { $_.name -match 'Windows_x86_64\.zip$' } | Select-Object -First 1
  if (-not $asset) { throw 'flyctl for Windows not found on GitHub' }

  $zip = Join-Path $env:TEMP 'flyctl-win.zip'
  Download-FlyZip -Url $asset.browser_download_url -ZipPath $zip

  Expand-Archive -Path $zip -DestinationPath $flyDir -Force
  if (-not (Test-Path $flyExe)) { throw "flyctl missing after extract: $flyExe" }
  Write-Host 'Fly CLI installed.' -ForegroundColor Green
  return $flyExe
}

function Invoke-Fly {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$FlyArgs)

  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $lines = & $fly @FlyArgs 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  foreach ($line in $lines) {
    if ($line -and $line -notmatch '^Warning: Metrics send issue') {
      Write-Host $line
    }
  }
  return @{ Text = ($lines -join "`n"); ExitCode = $code }
}

function Ensure-App {
  param([string]$Name)

  $result = Invoke-Fly apps create $Name
  if ($result.Text -match 'trial has ended') {
    Write-Host ''
    Write-Host 'Fly.io needs a card on your account:' -ForegroundColor Yellow
    Write-Host '  https://fly.io/trial'
    Write-Host 'Then run deploy.bat again.'
    Write-Host ''
    exit 1
  }
  if ($result.ExitCode -eq 0) {
    Write-Host "App created: $Name" -ForegroundColor Green
    return
  }
  if ($result.Text -match 'already been taken|already exists|is already') {
    Write-Host "App already exists: $Name" -ForegroundColor Green
    return
  }

  Write-Host "Could not create app: $Name" -ForegroundColor Red
  exit 1
}

$fly = Ensure-Fly

try {
  & $fly auth whoami 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'not logged in' }
} catch {
  Write-Host ''
  Write-Host 'Sign in to Fly.io (browser will open).' -ForegroundColor Cyan
  Write-Host 'No account? Register at https://fly.io'
  Write-Host ''
  & $fly auth login
}

Write-Host ''
Write-Host '=== Deploy SEVEN to Fly.io ===' -ForegroundColor Cyan
Write-Host ''

$appName = 'seven-barber-shop'
try {
  $toml = Get-Content (Join-Path $PSScriptRoot 'fly.toml') -Raw
  if ($toml -match "app\s*=\s*'([^']+)'") { $appName = $Matches[1] }
} catch {}

Ensure-App -Name $appName

$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
  Write-Host 'Loading secrets from .env...'
  $pairs = @()
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $i = $line.IndexOf('=')
    if ($i -lt 1) { return }
    $key = $line.Substring(0, $i).Trim()
    $val = $line.Substring($i + 1).Trim()
    if ($key -in @('TELEGRAM_BOT_TOKEN', 'ADMIN_PASSWORD') -and $val -and $val -notmatch 'your_|example') {
      $pairs += "$key=$val"
    }
  }
  if ($pairs.Count -gt 0) {
    $secArgs = @('secrets', 'set', '-a', $appName) + $pairs
    $sec = Invoke-Fly @secArgs
    if ($sec.ExitCode -ne 0 -and $sec.Text -notmatch 'already') { exit 1 }
  }
} else {
  Write-Host 'No .env file. Set secrets manually after deploy:' -ForegroundColor Yellow
  Write-Host '  fly secrets set TELEGRAM_BOT_TOKEN=... ADMIN_PASSWORD=...'
}

$deploy = Invoke-Fly deploy -a $appName
if ($deploy.ExitCode -ne 0) { exit 1 }

Write-Host ''
Write-Host 'Done!' -ForegroundColor Green
Write-Host "Site:  https://$appName.fly.dev"
Write-Host "Admin: https://$appName.fly.dev/admin.html"
Write-Host ''
