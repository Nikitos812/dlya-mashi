$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    Write-Host 'Порт 3000 уже занят. Если открытка уже запущена, открой http://localhost:3000'
    return
}
New-Item -ItemType Directory -Path (Join-Path $projectDir 'data') -Force | Out-Null
$server = Start-Process -FilePath $nodePath -ArgumentList 'server.mjs' -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectDir 'data/server.log') -RedirectStandardError (Join-Path $projectDir 'data/server-error.log') -PassThru
Set-Content -LiteralPath (Join-Path $projectDir 'data/server.pid') -Value $server.Id
Write-Host 'Открытка запущена: http://localhost:3000'
Write-Host 'Сервер продолжит работать после закрытия окна терминала.'
