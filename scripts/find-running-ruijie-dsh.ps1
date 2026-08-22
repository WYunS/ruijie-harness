$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mainScript = [Regex]::Escape((Join-Path $projectRoot 'dsh-plugin-desktop\lib\main.js'))
$process = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'electron.exe' -and
    $_.CommandLine -match $mainScript
  } |
  Select-Object -First 1

if ($null -ne $process) {
  Write-Output $process.ProcessId
}
