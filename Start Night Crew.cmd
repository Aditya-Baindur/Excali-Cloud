@echo off
cd /d "%~dp0local"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then open this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto failed
)
node server/setup-mcp.mjs
call npm run build
if errorlevel 1 goto failed
node server/start.mjs --open
if errorlevel 1 goto failed
exit /b 0
:failed
echo Could not start the workspace. Read the error above.
pause
exit /b 1
