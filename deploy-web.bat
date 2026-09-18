@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - deploy as a website (browser version).
REM    1) build the front end (vite build -> dist/)
REM    2) start the Node web back end (data dir comes from path-modes.json)
REM  Open http://localhost:8080
REM  Note: the web version can browse the library / details / covers / login,
REM        but cannot launch games.
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs.
REM  See the note in deploy.bat for the reason (cmd cuts multi-byte lines).
REM ============================================================
setlocal
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.deploy-web

call node scripts\bat-msg.mjs deploy-web.step-build
call npm run build
if errorlevel 1 (
    call node scripts\bat-msg.mjs deploy-web.err-build
    exit /b 1
)

REM Clear whatever still holds 8080 first, otherwise EADDRINUSE.
REM Find the owning process by port (PowerShell), so other node processes survive.
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique"') do (
    call node scripts\bat-msg.mjs deploy-web.clear-port %%i
    powershell -NoProfile -Command "Stop-Process -Id %%i -Force -ErrorAction SilentlyContinue"
)
timeout /t 1 /nobreak >nul

call node scripts\bat-msg.mjs deploy-web.step-serve
call node scripts\bat-msg.mjs deploy-web.visit
node server/server.mjs

endlocal
