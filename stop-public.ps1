foreach ($item in @(@{File='tunnel-supervisor.pid';Name='node.exe';Pattern='public-tunnel\.mjs'},@{File='tunnel.pid';Name='cloudflared.exe';Pattern='tunnel'})) {
    $pidPath = Join-Path $PSScriptRoot ('data/' + $item.File)
    if (!(Test-Path -LiteralPath $pidPath)) { continue }
    $taskProcessId = [int](Get-Content -LiteralPath $pidPath)
    $taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $taskProcessId" -ErrorAction SilentlyContinue
    if ($taskProcess -and $taskProcess.Name -eq $item.Name -and $taskProcess.CommandLine -match $item.Pattern) { Stop-Process -Id $taskProcessId }
}
Write-Host 'Публичное соединение остановлено. Локальный сервер продолжает работать.'
