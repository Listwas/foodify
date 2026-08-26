<#
    Foodify — instalator dla Windows

    Robi wszystko od zera na czystym komputerze: instaluje Pythona i Node.js
    (przez winget, który jest wbudowany w Windows 10/11), pobiera aplikację,
    buduje ją, przygotowuje bazę i tworzy skrót na pulpicie.

    Uruchomienie (PowerShell, NIE trzeba administratora):
        powershell -ExecutionPolicy Bypass -File .\install-foodify.ps1

    Można puszczać wielokrotnie — aktualizuje istniejącą instalację.
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InstallDir = "$env:LOCALAPPDATA\Foodify",
    [int]$Port = 8000,
    # klucz Gemini jest opcjonalny: bez niego działa wszystko poza
    # generowaniem nowych przepisów przez AI
    [string]$GeminiKey = "",
    [switch]$NoAutostart,
    [switch]$NoShortcut
)

$ErrorActionPreference = "Stop"
$RepoZip = "https://github.com/Listwas/foodify/archive/refs/heads/main.zip"

function Info($m)  { Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "  OK  $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "  !   $m" -ForegroundColor Yellow }
function Step($m)  { Write-Host "`n=== $m ===" -ForegroundColor White }

function Refresh-Path {
    # po instalacji winget PATH w tej sesji jest nieaktualny
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user    = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = ($machine, $user | Where-Object { $_ }) -join ";"
}

function Have($name) {
    # Uwaga: czysty Windows ma w PATH atrapę "python.exe" ze Sklepu Microsoft,
    # która istnieje, ale nie jest Pythonem — samo Get-Command to za mało.
    # Dlatego sprawdzamy, czy program faktycznie odpowiada numerem wersji.
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { return $false }
    try {
        $out = & $name --version 2>&1 | Out-String
    } catch {
        return $false
    }
    return ($out -match '\d+\.\d+')
}

function Ensure-Tool {
    param([string]$Command, [string]$WingetId, [string]$Label)

    if (Have $Command) { Ok "$Label już jest"; return }

    if (-not (Have "winget")) {
        throw @"
Brakuje $Label, a nie mam czym go zainstalować (brak 'winget').
Zainstaluj ręcznie i uruchom skrypt ponownie:
  Python  -> https://www.python.org/downloads/  (zaznacz 'Add python.exe to PATH')
  Node.js -> https://nodejs.org/en/download  (wersja LTS)
"@
    }

    Info "instaluję $Label (to potrwa chwilę)..."
    winget install --id $WingetId --exact --silent --accept-source-agreements --accept-package-agreements | Out-Null
    Refresh-Path

    if (-not (Have $Command)) {
        throw "$Label zainstalowany, ale system go jeszcze nie widzi. Zamknij PowerShell, otwórz nowy i puść skrypt jeszcze raz."
    }
    Ok "$Label zainstalowany"
}

# --------------------------------------------------------------------------

Write-Host ""
Write-Host "  FOODIFY — instalacja" -ForegroundColor Magenta
Write-Host "  katalog: $InstallDir"

Step "1/6  Python i Node.js"
Ensure-Tool -Command "python" -WingetId "Python.Python.3.12" -Label "Python"
Ensure-Tool -Command "node"   -WingetId "OpenJS.NodeJS.LTS"  -Label "Node.js"

Step "2/6  pliki aplikacji"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$localRepo = Resolve-Path (Join-Path $scriptDir "..\..") -ErrorAction SilentlyContinue

if ($localRepo -and (Test-Path (Join-Path $localRepo "backend\main.py"))) {
    # skrypt leży w kopii repo (pendrive / sklonowane) — użyj tych plików
    Info "używam plików obok skryptu"
    $source = $localRepo
} else {
    Info "pobieram z GitHuba..."
    $tmp = Join-Path $env:TEMP "foodify-dl"
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $zip = Join-Path $tmp "foodify.zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $RepoZip -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $source = (Get-ChildItem $tmp -Directory | Where-Object { $_.Name -like "foodify-*" } | Select-Object -First 1).FullName
    Ok "pobrane"
}

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
foreach ($part in @("backend", "frontend")) {
    # /MIR sprząta usunięte pliki, ale wykluczenia (/XD /XF) zostają nietknięte,
    # więc .venv, node_modules i baza przeżywają ponowną instalację
    robocopy (Join-Path $source $part) (Join-Path $InstallDir $part) /MIR /NFL /NDL /NJH /NJS /NP `
        /XD node_modules .venv dist __pycache__ /XF *.db .env | Out-Null
    # robocopy: 0-7 to sukces, dopiero 8+ znaczy błąd
    if ($LASTEXITCODE -ge 8) { throw "nie udało się skopiować '$part' (robocopy $LASTEXITCODE)" }
}
$global:LASTEXITCODE = 0
Ok "pliki na miejscu"

Step "3/6  biblioteki Pythona"
$backend = Join-Path $InstallDir "backend"
$venvPy  = Join-Path $backend ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) {
    python -m venv (Join-Path $backend ".venv")
}
& $venvPy -m pip install --quiet --upgrade pip
& $venvPy -m pip install --quiet -r (Join-Path $backend "requirements.txt")
Ok "gotowe"

Step "4/6  budowanie interfejsu"
$frontend = Join-Path $InstallDir "frontend"
Push-Location $frontend
try {
    # npm to .cmd, w skrypcie trzeba wywołać wprost
    & cmd /c "npm install --silent --no-audit --no-fund" 2>&1 | Out-Null
    & cmd /c "npm run build" 2>&1 | Out-Null
    if (-not (Test-Path (Join-Path $frontend "dist\index.html"))) {
        throw "build się nie udał — sprawdź czy Node.js działa (node --version)"
    }
} finally { Pop-Location }
Ok "interfejs zbudowany"

Step "5/6  przepisy"
$db = Join-Path $backend "foodify.db"
$shippedDb = Join-Path $scriptDir "foodify.db"

if (Test-Path $db) {
    Ok "baza już istnieje — zostawiam bez zmian"
} elseif (Test-Path $shippedDb) {
    # najlepszy wariant: gotowa baza obok skryptu, wszystko od razu z makrami
    Copy-Item $shippedDb $db
    Ok "wgrana gotowa baza (z makrami)"
} else {
    Warn "brak gotowej bazy — pobieram przepisy z internetu, potrwa 5-10 minut"
    if ($GeminiKey) {
        Set-Content -Path (Join-Path $backend ".env") -Value "GEMINI_API_KEY=$GeminiKey" -Encoding ASCII
    }
    Push-Location $backend
    try { & $venvPy "seed.py" } finally { Pop-Location }
    Ok "przepisy pobrane"
}

if ($GeminiKey -and -not (Test-Path (Join-Path $backend ".env"))) {
    Set-Content -Path (Join-Path $backend ".env") -Value "GEMINI_API_KEY=$GeminiKey" -Encoding ASCII
}

Step "6/6  skróty"
$launcher = Join-Path $InstallDir "Foodify.cmd"
@"
@echo off
title Foodify
cd /d "%~dp0backend"
start "" http://localhost:$Port
".venv\Scripts\python.exe" -m uvicorn main:server --host 0.0.0.0 --port $Port
"@ | Set-Content -Path $launcher -Encoding ASCII

$shell = New-Object -ComObject WScript.Shell
if (-not $NoShortcut) {
    $lnk = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Foodify.lnk"))
    $lnk.TargetPath = $launcher
    $lnk.WorkingDirectory = $InstallDir
    $lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,44"
    $lnk.Description = "Foodify — planer posiłków"
    $lnk.Save()
    Ok "skrót na pulpicie"
}
if (-not $NoAutostart) {
    $startup = [Environment]::GetFolderPath("Startup")
    $auto = $shell.CreateShortcut((Join-Path $startup "Foodify.lnk"))
    $auto.TargetPath = $launcher
    $auto.WorkingDirectory = $InstallDir
    $auto.WindowStyle = 7   # zminimalizowane
    $auto.Save()
    Ok "będzie startować razem z Windowsem"
}

Write-Host ""
Write-Host "  GOTOWE" -ForegroundColor Green
Write-Host "  Aplikacja: " -NoNewline; Write-Host "http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  Na telefonie w tej samej sieci wifi: http://<ip-tego-kompa>:$Port"
Write-Host "  (ip sprawdzisz komendą: ipconfig)"
Write-Host ""
Write-Host "  Uruchamiam..." -ForegroundColor White
Start-Process -FilePath $launcher
