param([switch]$LegacyServer)
$ErrorActionPreference = 'Stop'
if (-not $LegacyServer) {
    Write-Host 'Zum Beenden der Dateiversion das Browserfenster schließen. Es läuft kein eigener App-Server.'
    return
}
$expected = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '.venv/Scripts/python.exe'))
$listeners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    if ($processInfo.ExecutablePath -eq $expected -and $processInfo.CommandLine -match 'launch.py') {
        Stop-Process -Id $listener.OwningProcess
        Write-Host 'Investmenttracker beendet. Gespeicherte Daten bleiben erhalten.'
    } else { Write-Warning 'Der Port gehört nicht eindeutig zu diesem Starter; Prozess bleibt unverändert.' }
}
