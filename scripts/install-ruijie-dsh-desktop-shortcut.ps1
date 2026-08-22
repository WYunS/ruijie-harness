$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutName = "$([char]0x9510)$([char]0x6377) Harness ($([char]0x672C)$([char]0x5730)$([char]0x5F00)$([char]0x53D1)$([char]0x7248)).lnk"
$shortcutPath = Join-Path $desktop $shortcutName
$startScript = Join-Path $PSScriptRoot 'start-ruijie-dsh-desktop.vbs'
$iconPath = Join-Path $workspaceRoot 'dsh-plugin-desktop\build\app-icon.ico'
$scriptHost = Join-Path $env:SystemRoot 'System32\wscript.exe'

foreach ($requiredPath in @($startScript, $iconPath, $scriptHost)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Shortcut dependency was not found: $requiredPath"
  }
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $scriptHost
$shortcut.Arguments = "//B //NoLogo `"$startScript`""
$shortcut.WorkingDirectory = $workspaceRoot
$shortcut.IconLocation = "$iconPath,0"
$shortcut.Description = 'Ruijie Harness (local development)'
$shortcut.Save()

Write-Output $shortcutPath
