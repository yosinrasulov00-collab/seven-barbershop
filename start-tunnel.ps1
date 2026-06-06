# Временный бесплатный URL для теста (пока ПК включён)
# Запуск: двойной клик start-tunnel.bat

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

try {
  (Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 2).StatusCode | Out-Null
} catch {
  Write-Host 'Локальный сервер не запущен. Запускаю npm start...'
  Start-Process -FilePath 'npm' -ArgumentList 'start' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

Write-Host ''
Write-Host '=== Тестовый публичный URL ===' -ForegroundColor Cyan
Write-Host 'Сервер должен быть запущен. Ссылка появится ниже через несколько секунд.'
Write-Host 'Не закрывайте это окно — иначе сайт станет недоступен из интернета.'
Write-Host ''

npx --yes localtunnel --port 3000
