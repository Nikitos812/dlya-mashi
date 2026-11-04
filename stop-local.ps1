$pidFile = Join-Path $PSScriptRoot 'data/server.pid'
if (!(Test-Path -LiteralPath $pidFile)) { Write-Host 'Нет сохранённого процесса открытки.'; exit }
$serverProcessId = [int](Get-Content -LiteralPath $pidFile)
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId" -ErrorAction SilentlyContinue
if ($serverProcess -and $serverProcess.Name -eq 'node.exe' -and $serverProcess.CommandLine -match 'server\.mjs') {
    Stop-Process -Id $serverProcessId
    Write-Host 'Сервер открытки остановлен.'
} else { Write-Host 'Сохранённый процесс уже завершён.' }
