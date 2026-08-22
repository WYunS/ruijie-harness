$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $workspaceRoot 'dsh-plugin-desktop\node_modules\electron\dist\electron.exe'
$mainScript = Join-Path $workspaceRoot 'dsh-plugin-desktop\lib\main.js'
$localDataRoot = Join-Path $workspaceRoot '.local-data'
$dshHome = Join-Path $localDataRoot 'dsh-home'
$electronUserData = Join-Path $localDataRoot 'electron-user-data'
$launcherLog = Join-Path $localDataRoot 'desktop-shortcut.log'

foreach ($requiredPath in @($electron, $mainScript)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Local desktop runtime was not found: $requiredPath"
  }
}

New-Item -ItemType Directory -Force -Path $dshHome, $electronUserData | Out-Null
$env:DSH_HOME = $dshHome
$env:RUIJIE_DSH_USER_DATA_DIR = $electronUserData

try {
  $process = Start-Process -FilePath $electron -ArgumentList @($mainScript) -WorkingDirectory $workspaceRoot -WindowStyle Hidden -PassThru
  "$(Get-Date -Format o) started electron pid=$($process.Id)" | Add-Content -LiteralPath $launcherLog -Encoding UTF8
} catch {
  "$(Get-Date -Format o) failed: $($_.Exception.Message)" | Add-Content -LiteralPath $launcherLog -Encoding UTF8
  throw
}
