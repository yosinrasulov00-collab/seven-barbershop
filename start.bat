@echo off
cd /d "%~dp0"
title SEVEN — localhost:3000
echo.
echo   Сайт: http://localhost:3000
echo.
if not exist node_modules (
  echo Установка зависимостей...
  call npm install
)
start "" "http://localhost:3000"
npm start
