@echo off
cd /d "%~dp0"
if not exist "%~dp0Investmenttracker.html" (
    echo Investmenttracker.html fehlt. Bitte das vollstaendige App-Paket entpacken.
    exit /b 1
)
start "" "%~dp0Investmenttracker.html"
