@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - one-click website test.
REM    1) check that the data dir exists (it comes from path-modes.json)
REM    2) build the front end (vite build -> dist/)
REM    3) start the web back end (node server/server.mjs)
REM    4) open the browser at http://localhost:8080
REM  Closing the window stops the server.
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs.
REM  See the note in deploy.bat for the reason.
REM ============================================================
setlocal
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.test-web

call node scripts\bat-msg.mjs test-web.header

REM ---- 1. check the data ----
REM The data dir comes from the rule table (data-dir.bat reads path-modes.json);
REM never hard-code a directory name here.
call "%~dp0data-dir.bat"
if errorlevel 1 (
    call node scripts\bat-msg.mjs test-web.err-nodatadir
    pause
    exit /b 1
)
node scripts\data-dir.mjs --exists
if errorlevel 1 (
    call node scripts\bat-msg.mjs test-web.warn-incomplete "%YUNGAME_DATA_DIR%"
    call node scripts\bat-msg.mjs test-web.ask-continue
    REM /N: the Chinese question was already printed by bat-msg (it cannot live
    REM in this file); choice only reads the key.
    choice /C YN /N
    if errorlevel 2 exit /b 1
) else (
    call node scripts\bat-msg.mjs test-web.ok-datadir "%YUNGAME_DATA_DIR%"
)

REM ---- 2. build the front end ----
call node scripts\bat-msg.mjs test-web.step-build
call npm run build
if errorlevel 1 (
    call node scripts\bat-msg.mjs test-web.err-build
    pause
    exit /b 1
)

REM ---- 3. clear the old server (if 8080 is taken) ----
call node scripts\bat-msg.mjs test-web.step-port
REM Find the owning process by port (PowerShell), so other node processes survive.
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique"') do (
    call node scripts\bat-msg.mjs test-web.clear-port %%i
    powershell -NoProfile -Command "Stop-Process -Id %%i -Force -ErrorAction SilentlyContinue"
)
timeout /t 1 /nobreak >nul

REM ---- 4. start the server and open the browser ----
call node scripts\bat-msg.mjs test-web.step-serve
start "" http://localhost:8080
node server/server.mjs

echo.
call node scripts\bat-msg.mjs test-web.stopped
endlocal
