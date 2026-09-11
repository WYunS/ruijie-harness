param([Parameter(Mandatory=$true)][string]$Version)
$ErrorActionPreference = 'Stop'
$installer = Join-Path $PSScriptRoot "../dsh-plugin-desktop/dist/Ruijie-Harness-$Version-x64-Setup.exe"
$signature = Get-AuthenticodeSignature -LiteralPath $installer
if ($signature.Status -ne 'NotSigned') { throw "Unexpected signature state: $($signature.Status)" }
$report = @{ signing = 'NotSigned'; installer = [IO.Path]::GetFileName($installer); sha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash; installedAcceptance = 'not performed' }
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot '../.release-out/evidence/windows-signature.json') -Encoding utf8
