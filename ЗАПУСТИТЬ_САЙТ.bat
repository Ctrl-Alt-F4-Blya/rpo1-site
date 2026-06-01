@echo off
chcp 65001 >nul
title Currency Pulse - авто запуск
cd /d "%~dp0"

cls
echo ========================================
echo   Currency Pulse - авто запуск сайта
echo ========================================
echo.

echo [1/3] Проверка Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден.
  echo Установи Node.js LTS, потом снова запусти этот файл.
  echo Сейчас открою страницу загрузки Node.js...
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VERSION=%%v
echo [OK] Node.js найден: %NODE_VERSION%
echo.

echo [2/3] Настройка...
echo Зависимости не нужны: сайт работает без npm install.
echo Поэтому ошибки npm/proxy/timeout больше не мешают запуску.
echo.

set PORT=3000
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo Порт 3000 занят, пробую порт 3001...
  set PORT=3001
)

echo [3/3] Запуск сайта...
echo Адрес: http://localhost:%PORT%
echo.
echo Если браузер не открылся сам, скопируй адрес выше.
echo Для остановки сервера нажми Ctrl+C в этом окне.
echo.

start "" "http://localhost:%PORT%"
node server.js

echo.
echo Сервер остановлен.
pause
