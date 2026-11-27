$ErrorActionPreference = 'Stop'
# Optional: Investmenttracker.html direkt doppelklicken genügt.
$appFile = Join-Path $PSScriptRoot 'Investmenttracker.html'
if (-not (Test-Path -LiteralPath $appFile -PathType Leaf)) { throw 'Investmenttracker.html fehlt. Bitte das vollständige App-Paket entpacken.' }
Start-Process -FilePath $appFile
