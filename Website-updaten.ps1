[CmdletBinding()]
param(
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]*$')][string]$Server = 'homeserver.local',
    [ValidatePattern('^[a-z_][a-z0-9_-]*$')][string]$PiUser = 'ludwig',
    [switch]$Check
)
$ErrorActionPreference = 'Stop'
$html = Join-Path $PSScriptRoot 'pi/Investmenttracker-Pi.html'
$proof = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'test-results/sync-hosted-ui-result.json') -Raw | ConvertFrom-Json
if ($proof.result -ne 'PASS' -or (Get-FileHash -LiteralPath $html -Algorithm SHA256).Hash.ToLowerInvariant() -ne $proof.hosted_html_sha256) { throw 'Website stimmt nicht mit der bestandenen Hosted-Prüfung überein.' }
Write-Host "Ziel: https://$Server/investmenttracker/ ; nur HTML-Datei aktualisieren."
if ($Check) { return }
$target = "$PiUser@$Server"
$stage = '.investmenttracker-website-' + [guid]::NewGuid().ToString('N')
$options = @('-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes')
& ssh.exe @options $target "umask 077; mkdir -- $stage"
if ($LASTEXITCODE -ne 0) { throw 'SSH-Anmeldung oder Uploadordner fehlgeschlagen.' }
& scp.exe @options $html "${target}:$stage/Investmenttracker-Pi.html"
if ($LASTEXITCODE -ne 0) { throw 'Website-Upload fehlgeschlagen.' }
# Preserve the current public page. Install next to it, then rename atomically.
# This touches neither the running service nor its database/key/configuration.
$command = "test -f /opt/investmenttracker-sync/Investmenttracker-Pi.html && sudo install -d -m 700 /var/backups/investmenttracker-sync && sudo cp -p /opt/investmenttracker-sync/Investmenttracker-Pi.html /var/backups/investmenttracker-sync/$stage.html && sudo install -m 644 $stage/Investmenttracker-Pi.html /opt/investmenttracker-sync/Investmenttracker-Pi.html.next && sudo mv -f /opt/investmenttracker-sync/Investmenttracker-Pi.html.next /opt/investmenttracker-sync/Investmenttracker-Pi.html"
& ssh.exe @options -t $target $command
if ($LASTEXITCODE -ne 0) { throw 'Website nicht aktualisiert. SSH-/sudo-Ausgabe prüfen.' }
Write-Host "Website aktualisiert. https://$Server/investmenttracker/ neu laden (gegebenenfalls Strg+F5)."
