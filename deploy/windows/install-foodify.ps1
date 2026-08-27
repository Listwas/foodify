<#
    Foodify — instalacja na Windowsie.

    Nie uruchamiaj tego pliku wprost. Kliknij dwa razy INSTALUJ.bat
    w głównym katalogu (ten wyżej o dwa poziomy).

    Skrypt działa "w miejscu": wszystko ląduje w rozpakowanym folderze,
    nic nie jest kopiowane po dysku. Można go puszczać wielokrotnie —
    aktualizuje to co trzeba i nigdy nie kasuje bazy z Twoimi danymi.
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
    [int]$Port = 8000,
    # opcjonalny: bez niego działa wszystko poza generowaniem przepisów przez AI
    [string]$GeminiKey = "",
    [switch]$NoAutostart
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

function Info($m) { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor White }

function Refresh-Path {
    # po instalacji przez winget PATH w tej sesji jest jeszcze nieaktualny
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = ($machine, $user | Where-Object { $_ }) -join ";"
}

function Have($name) {
    # Czysty Windows ma w PATH atrapę "python.exe" ze Sklepu Microsoft, która
    # istnieje, ale Pythonem nie jest. Dlatego sprawdzamy, czy program
    # faktycznie odpowiada numerem wersji, a nie czy plik gdzieś leży.
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { return $false }
    try { $out = & $name --version 2>&1 | Out-String } catch { return $false }
    return ($out -match '\d+\.\d+')
}

function Ensure-Tool {
    param([string]$Command, [string]$WingetId, [string]$Label, [string]$Manual)

    if (Have $Command) { Ok "$Label już jest"; return }

    if (-not (Get-Command "winget" -ErrorAction SilentlyContinue)) {
        throw "Brakuje $Label i nie mam czym go zainstalowac (brak winget). Pobierz recznie: $Manual - potem uruchom INSTALUJ.bat jeszcze raz."
    }

    Info "instaluje $Label - moze wyskoczyc okienko z pytaniem, zgodz sie"
    winget install --id $WingetId --exact --silent `
        --accept-source-agreements --accept-package-agreements | Out-Null
    Refresh-Path

    if (-not (Have $Command)) {
        throw "$Label sie zainstalowal, ale system jeszcze go nie widzi. Zamknij to okno i uruchom INSTALUJ.bat jeszcze raz."
    }
    Ok "$Label zainstalowany"
}

# --------------------------------------------------------------------------

Write-Host ""
Write-Host "  FOODIFY - instalacja" -ForegroundColor Magenta

# skrypt siedzi w deploy\windows\, katalog aplikacji jest dwa poziomy wyzej
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$backend  = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

if (-not (Test-Path (Join-Path $backend "main.py"))) {
    throw "Nie znajduje plikow aplikacji. Rozpakuj CALY plik ZIP z GitHuba i uruchom INSTALUJ.bat z srodka rozpakowanego folderu."
}
Write-Host "  katalog: $root"

Step "1/5  Python i Node.js"
Ensure-Tool -Command "python" -WingetId "Python.Python.3.12" -Label "Python" `
            -Manual "https://www.python.org/downloads/ (zaznacz 'Add python.exe to PATH')"
Ensure-Tool -Command "node" -WingetId "OpenJS.NodeJS.LTS" -Label "Node.js" `
            -Manual "https://nodejs.org/en/download (wersja LTS)"

Step "2/5  biblioteki Pythona"
$venvPy = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    python -m venv (Join-Path $backend ".venv")
}
if (-not (Test-Path $venvPy)) { throw "Nie udalo sie stworzyc srodowiska Pythona." }
& $venvPy -m pip install --quiet --upgrade pip
& $venvPy -m pip install --quiet -r (Join-Path $backend "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Nie udalo sie zainstalowac bibliotek Pythona." }
Ok "gotowe"

Step "3/5  budowanie aplikacji"
Info "to trwa 1-2 minuty, poczekaj"
Push-Location $frontend
try {
    & cmd /c "npm install --no-audit --no-fund --loglevel=error" 2>&1 | Out-Null
    & cmd /c "npm run build" 2>&1 | Out-Null
} finally { Pop-Location }
if (-not (Test-Path (Join-Path $frontend "dist\index.html"))) {
    throw "Budowanie sie nie udalo. Sprawdz czy Node dziala: otworz nowe okno i wpisz  node --version"
}
Ok "aplikacja zbudowana"

Step "4/5  przepisy"
$db   = Join-Path $backend "foodify.db"
$seed = Join-Path $root "deploy\seed\foodify-seed.db"

if (Test-Path $db) {
    Ok "baza juz jest - zostawiam nietknieta"
} elseif (Test-Path $seed) {
    Copy-Item $seed $db
    Ok "wgrane 511 przepisow z wyliczonymi makrami"
} else {
    Warn "brak gotowej bazy - pobieram przepisy z internetu, 5-10 minut"
    Push-Location $backend
    try { & $venvPy "seed.py" } finally { Pop-Location }
}

if ($GeminiKey) {
    Set-Content -Path (Join-Path $backend ".env") -Value "GEMINI_API_KEY=$GeminiKey" -Encoding ASCII
    Ok "klucz AI zapisany"
}

Step "5/5  skroty"
# launcher zostaje w katalogu aplikacji, skroty tylko na niego wskazuja
$launcher = Join-Path $root "Foodify.cmd"
@"
@echo off
title Foodify
cd /d "%~dp0backend"
start "" http://localhost:$Port
".venv\Scripts\python.exe" -m uvicorn main:server --host 0.0.0.0 --port $Port
"@ | Set-Content -Path $launcher -Encoding ASCII

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Foodify.lnk"))
$lnk.TargetPath = $launcher
$lnk.WorkingDirectory = $root
$lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,44"
$lnk.Description = "Foodify - planer posilkow"
$lnk.Save()
Ok "ikona na pulpicie"

if (-not $NoAutostart) {
    $auto = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Startup")) "Foodify.lnk"))
    $auto.TargetPath = $launcher
    $auto.WorkingDirectory = $root
    $auto.WindowStyle = 7   # zminimalizowane
    $auto.Save()
    Ok "bedzie startowac razem z Windowsem"
}

Write-Host ""
Write-Host "  GOTOWE" -ForegroundColor Green
Write-Host "  Aplikacja otworzy sie za chwile: " -NoNewline
Write-Host "http://localhost:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Nastepnym razem odpalasz ikona Foodify z pulpitu."
Write-Host "  NIE KASUJ tego folderu - aplikacja z niego dziala."
Write-Host ""

Start-Process -FilePath $launcher
