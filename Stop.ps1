$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'data\server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No managed server is running.'; exit }
$serverPid = [int](Get-Content -LiteralPath $pidFile)
$serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
$serverFile = Join-Path $PSScriptRoot 'server.mjs'
if ($serverProcess -and $serverProcess.Name -eq 'node.exe' -and $serverProcess.CommandLine.Contains($serverFile)) {
    Stop-Process -Id $serverPid
    Remove-Item -LiteralPath $pidFile
    Write-Output 'The local website has stopped. Saved documents remain in data.'
} else { Write-Output 'The recorded process is not this website. No process was stopped.' }
