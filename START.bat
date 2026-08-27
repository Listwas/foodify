@echo off
title Foodify
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" goto brak
if not exist "frontend\dist\index.html" goto brak

start "" http://localhost:8000
cd backend
".venv\Scripts\python.exe" -m uvicorn main:server --host 0.0.0.0 --port 8000
goto koniec

:brak
echo.
echo   Aplikacja nie jest jeszcze zainstalowana.
echo   Uruchom najpierw INSTALUJ.bat (ten sam folder).
echo.
pause

:koniec
