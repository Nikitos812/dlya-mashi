$ErrorActionPreference = 'Stop'
$supervisorPidFile = Join-Path $PSScriptRoot 'data/tunnel-supervisor.pid'
if (Test-Path -LiteralPath $supervisorPidFile) {
    $supervisorId = [int](Get-Content -LiteralPath $supervisorPidFile)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $supervisorId" -ErrorAction SilentlyContinue
    if ($existing -and $existing.Name -eq 'node.exe' -and $existing.CommandLine -match 'public-tunnel\.mjs') { Write-Host 'Публичное соединение уже работает.'; exit }
}
& (Join-Path $PSScriptRoot 'start-local.ps1')
$cloudflaredPath = Join-Path $PSScriptRoot '.deploy/cloudflared.exe'
if (!(Test-Path -LiteralPath $cloudflaredPath)) { throw 'Нужен официальный cloudflared.exe в .deploy. Инструкция — в README.md.' }
$nodePath = (Get-Command node).Source
Start-Process -FilePath $nodePath -ArgumentList 'scripts/public-tunnel.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/supervisor.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/supervisor-error.log') | Out-Null
Write-Host 'Соединение запускается. Адрес открытки: https://nikitos812.github.io/dlya-mashi/'
Write-Host 'При изменении адреса сервера он обновится на GitHub автоматически.'
