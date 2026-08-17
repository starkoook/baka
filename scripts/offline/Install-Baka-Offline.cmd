@echo off
setlocal
cd /d "%~dp0.."
if not exist "Baka-TOOLS-Setup.exe" (
  echo Missing Baka-TOOLS-Setup.exe
  pause
  exit /b 1
)
start /wait "" "Baka-TOOLS-Setup.exe"
if errorlevel 1 exit /b %errorlevel%
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Offline-Environment.ps1"
if errorlevel 1 (
  echo Offline environment installation failed.
  pause
  exit /b 1
)
pause
