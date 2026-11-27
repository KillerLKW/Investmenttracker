[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')][string]$Server = 'homeserver.local',
    [ValidatePattern('^[a-z_][a-z0-9_-]*$')][string]$PiUser = 'ludwig',
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$target = "$PiUser@$Server"
$options = @('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
if ($Check) {
    & ssh.exe @options $target 'python3 --version'
    if ($LASTEXITCODE -ne 0) { throw 'Pi-Anmeldung fehlgeschlagen. Bitte SSH-Zugang auf diesem Rechner einrichten.' }
    Write-Host "Ziel: https://$Server/investmenttracker/ ; bestehende TaskTracker-HTTPS-Site wird vorausgesetzt."
    return
}
$proofPath = Join-Path $PSScriptRoot 'test-results/sync-hosted-ui-result.json'
$proof = Get-Content -LiteralPath $proofPath -Raw | ConvertFrom-Json
if ($proof.result -ne 'PASS') { throw 'Bestandene Synchronisierungsabnahme erforderlich.' }
$html = Join-Path $PSScriptRoot 'pi/Investmenttracker-Pi.html'
$service = Join-Path $PSScriptRoot 'pi/sync_server.py'
if ((Get-FileHash -LiteralPath $html -Algorithm SHA256).Hash.ToLowerInvariant() -ne $proof.hosted_html_sha256) { throw 'Pi-HTML stimmt nicht mit der Abnahme überein.' }
if ((Get-FileHash -LiteralPath $service -Algorithm SHA256).Hash.ToLowerInvariant() -ne $proof.server_sha256) { throw 'Pi-Dienst stimmt nicht mit der Abnahme überein.' }
$stage = '.investmenttracker-sync-' + [guid]::NewGuid().ToString('N')
& ssh.exe @options $target "umask 077; mkdir -- $stage"
if ($LASTEXITCODE -ne 0) { throw 'Pi-Anmeldung oder Anlegen des Uploadordners fehlgeschlagen.' }
& scp.exe @options $html $service (Join-Path $PSScriptRoot 'pi/install.sh') "${target}:$stage/"
if ($LASTEXITCODE -ne 0) { throw 'Upload fehlgeschlagen.' }
& ssh.exe @options -t $target "tr -d '\r' < $stage/install.sh > $stage/setup.sh && sudo sh $stage/setup.sh $stage $Server"
if ($LASTEXITCODE -ne 0) { throw 'Pi-Einrichtung fehlgeschlagen. Ausgabe prüfen; vorhandene Daten nicht löschen.' }
Write-Host "Öffnen: https://$Server/investmenttracker/"
Write-Host 'Es wurden keine vorhandenen Browserdepots übertragen. Vor Wechsel vollständige JSON-Sicherung herunterladen.'
