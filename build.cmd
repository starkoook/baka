@echo off
setlocal
cd /d "D:\Claude\ccc\baka-tools"

echo Building baka-tools...
echo.

node -e "console.log('Node OK:', process.version)" 2>nul
if %errorlevel% neq 0 (
    if exist "D:\git and node\New Folder\node.exe" (
        set "PATH=D:\git and node\New Folder;%PATH%"
    )
)

call npm.cmd run build:renderer
if %errorlevel% equ 0 (
    echo.
    echo SUCCESS - Restart the app now
) else (
    echo.
    echo FAILED - Run this in cmd instead:
    echo   cd /d D:\Claude\ccc\baka-tools
    echo   npm run build:renderer
)

echo.
exit /b 0
