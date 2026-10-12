param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$websiteUrl = 'http://localhost:4318'
$expectedData = Join-Path $projectDir 'data'
function Test-TorahServer {
    try {
        $result = Invoke-RestMethod -Uri 'http://127.0.0.1:4318/api/status' -TimeoutSec 3
        return ($result.local -eq $true -and $result.dataDir -eq $expectedData)
    } catch { return $false }
}
if (-not (Test-TorahServer)) {
    New-Item -ItemType Directory -Force -Path $expectedData | Out-Null
    $nodeExe = Join-Path $projectDir '.runtime\node.exe'
    if (-not (Test-Path -LiteralPath $nodeExe)) {
        $nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
        $nodeMajor = [int]((& $nodeExe --version).TrimStart('v').Split('.')[0])
        if ($nodeMajor -lt 22) { throw 'Node.js 22 or newer is required. Restore the .runtime folder.' }
    }
    $serverFile = Join-Path $projectDir 'server.mjs'
    $serverProcess = Start-Process -FilePath $nodeExe -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $projectDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $expectedData 'server.log') -RedirectStandardError (Join-Path $expectedData 'server-errors.log') -PassThru
    $serverProcess.Id | Set-Content -LiteralPath (Join-Path $expectedData 'server.pid') -Encoding ascii
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        if (Test-TorahServer) { break }
        Start-Sleep -Milliseconds 300
    }
    if (-not (Test-TorahServer)) { throw 'The local website did not start. Check data\server-errors.log.' }
}
if (-not $NoBrowser) { Start-Process $websiteUrl }
