# Деплой SEVEN на Fly.io (бесплатный хостинг, сайт + Telegram-бот 24/7)
# Запуск: deploy.bat

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$flyDir = Join-Path $env:USERPROFILE '.fly\bin'
$flyExe = Join-Path $flyDir 'flyctl.exe'

function Ensure-Fly {
  if (Test-Path $flyExe) { return $flyExe }
  if (Get-Command fly -ErrorAction SilentlyContinue) { return (Get-Command fly).Source }

  Write-Host 'Устанавливаю Fly CLI (один раз, ~50 МБ)...' -ForegroundColor Yellow
  New-Item -ItemType Directory -Force -Path $flyDir | Out-Null

  $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/superfly/flyctl/releases/latest'
  $asset = $release.assets | Where-Object { $_.name -match 'Windows_x86_64\.zip$' } | Select-Object -First 1
  if (-not $asset) { throw 'Не удалось найти flyctl для Windows на GitHub' }

  $zip = Join-Path $env:TEMP 'flyctl-win.zip'
  curl.exe -L -o $zip $asset.browser_download_url
  if ((Get-Item $zip).Length -lt 1000000) { throw 'Скачивание flyctl не завершилось — проверьте интернет' }

  Expand-Archive -Path $zip -DestinationPath $flyDir -Force
  if (-not (Test-Path $flyExe)) { throw "После распаковки нет $flyExe" }
  Write-Host 'Fly CLI установлен.' -ForegroundColor Green
  return $flyExe
}

$fly = Ensure-Fly

try {
  & $fly auth whoami 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'not logged in' }
} catch {
  Write-Host ''
  Write-Host 'Войдите в Fly.io — откроется браузер.' -ForegroundColor Cyan
  Write-Host 'Если нет аккаунта: зарегистрируйтесь на https://fly.io (карта нужна, деньги не списывают).'
  Write-Host ''
  & $fly auth login
}

Write-Host ''
Write-Host '=== Деплой SEVEN на Fly.io ===' -ForegroundColor Cyan
Write-Host ''

$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
  Write-Host 'Секреты из .env...'
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
    & $fly secrets set @pairs
  }
} else {
  Write-Host 'Нет .env — задайте секреты вручную после деплоя:' -ForegroundColor Yellow
  Write-Host '  fly secrets set TELEGRAM_BOT_TOKEN=... ADMIN_PASSWORD=...'
}

& $fly deploy

$appName = 'seven-barber-shop'
try {
  $toml = Get-Content (Join-Path $PSScriptRoot 'fly.toml') -Raw
  if ($toml -match "app\s*=\s*'([^']+)'") { $appName = $Matches[1] }
} catch {}

Write-Host ''
Write-Host 'Готово!' -ForegroundColor Green
Write-Host "Сайт:    https://$appName.fly.dev"
Write-Host "Админка: https://$appName.fly.dev/admin.html"
Write-Host ''
