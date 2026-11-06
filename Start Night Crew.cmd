@echo off
cd /d "%~dp0local"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer, then open this file again.
  pause
  exit /b 1
)
rem Reinstall when package-lock.json is newer than the last install, for example after a pull.
node -e "const f=require('fs');try{process.exit(f.statSync('package-lock.json').mtimeMs>f.statSync('node_modules/.package-lock.json').mtimeMs?1:0)}catch{process.exit(1)}"
if errorlevel 1 (
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
