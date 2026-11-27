param([string]$PythonPath = 'python', [switch]$LegacyServer)
$ErrorActionPreference = 'Stop'
if (-not $LegacyServer) {
    $appFile = Join-Path $PSScriptRoot 'Investmenttracker.html'
    if (-not (Test-Path -LiteralPath $appFile -PathType Leaf)) { throw 'Investmenttracker.html fehlt. Bitte das vollständige App-Paket entpacken.' }
    Write-Host 'Keine Einrichtung nötig. Investmenttracker.html oder Start-Investmenttracker.cmd öffnen.'
    Write-Host 'Zum Beenden das Browserfenster schließen. Daten vor Browser- oder Ordnerwechsel als JSON sichern.'
    return
}
# Historical server environment only, explicitly selected by a developer.
Set-Location -LiteralPath $PSScriptRoot
& $PythonPath -c 'import sys; assert sys.version_info >= (3,12), "Python 3.12 oder neuer erforderlich"'
if ($LASTEXITCODE -ne 0) { throw 'Bitte einen funktionierenden Python-3.12+-Pfad über -PythonPath angeben.' }
if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
    & $PythonPath -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python-Umgebung konnte nicht erstellt werden.' }
}
& .venv/Scripts/python.exe -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Paketinstallation fehlgeschlagen.' }
Write-Host 'Historische Serverumgebung bereit. Sie startet separat mit .venv/Scripts/python.exe launch.py; der normale Starter öffnet weiterhin die Offline-Dateiversion.'
