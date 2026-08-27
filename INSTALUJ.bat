@echo off
title Foodify - instalacja
cd /d "%~dp0"

echo.
echo   ========================================
echo    FOODIFY - instalacja
echo   ========================================
echo.
echo   Potrwa kilka minut. Zainstaluje sie Python i Node.js,
echo   potem zbuduje sie aplikacja.
echo.
echo   Jesli Windows zapyta o zgode - zgodz sie.
echo.

rem Pliki sciagniete z internetu Windows oznacza jako "zablokowane",
rem wiec najpierw je odblokowujemy, a dopiero potem uruchamiamy instalator.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%~dp0deploy' -Recurse -Filter *.ps1 | Unblock-File -ErrorAction SilentlyContinue; & '%~dp0deploy\windows\install-foodify.ps1'"

if errorlevel 1 (
  echo.
  echo   ========================================
  echo    COS POSZLO NIE TAK
  echo.
  echo    Zrob zrzut ekranu calego okna i wyslij.
  echo   ========================================
  echo.
)

pause
