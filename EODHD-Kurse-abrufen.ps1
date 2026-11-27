[CmdletBinding()]
param([ValidatePattern('^[A-Za-z][A-Za-z0-9]{0,14}$')][string]$Handelsplatz = 'XETRA')
$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw 'Für diesen optionalen Abrufhelfer wird Python 3 benötigt. Die Offline-App selbst benötigt keine Installation. Auf dem Pi: python3 tools/eodhd_quotes.py'
}
& $python (Join-Path $PSScriptRoot 'tools/eodhd_quotes.py') --exchange $Handelsplatz
if ($LASTEXITCODE -ne 0) { throw 'Kursabruf nicht abgeschlossen. Es wurden keine Tracker-Daten geändert.' }
