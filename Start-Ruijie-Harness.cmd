@echo off
setlocal
cd /d "%~dp0"
title Ruijie Harness Launcher
powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\start-ruijie-dsh-desktop.ps1"
endlocal
