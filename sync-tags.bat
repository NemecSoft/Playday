@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday (YunGame) tag sync - temporary authoritative json -> authoritative DB.
REM    source: D:\AI\games-web\games_tags.json   (temporary authoritative source)
REM    target: %PLAYDAY_ADMIN_DB%                (authoritative database)
REM
REM  For when you have checked and re-checked the tags in that json and want
REM  them in the database in one step. Every real write makes a timestamped .bak
REM  first, so rolling back is always possible.
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs.
REM  See the note in deploy.bat for the reason.
REM ============================================================
setlocal

REM ---- 0. go to the project root ----
cd /d "%~dp0"

REM ---- 1. Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    call node scripts\bat-msg.mjs node.proto-ok
) else (
    call node scripts\bat-msg.mjs node.proto-fallback
)

REM ---- 1.5 data dir (path-modes.json "dev" section, see data-dir.bat) ----
REM      After the node step on purpose: reading the paths itself calls node.
call "%~dp0data-dir.bat"
if errorlevel 1 exit /b 1

call node scripts\bat-msg.mjs title.sync-tags
call node scripts\bat-msg.mjs sync-tags.header "%PLAYDAY_ADMIN_DB%"

REM ---- 2. dry run first: summary only, the database is untouched ----
echo.
call node scripts\bat-msg.mjs sync-tags.step-preview
echo.
node scripts\sync-tags-from-json.mjs
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs sync-tags.err-preview
    exit /b 1
)

REM ---- 3. ask before applying ----
REM      Trap: set /p and the %CONFIRM% check must NOT sit in the same block
REM      (variables expand at parse time).
echo.
call node scripts\bat-msg.mjs sync-tags.ask-apply
set /p CONFIRM=
if /i not "%CONFIRM%"=="Y" (
    echo.
    call node scripts\bat-msg.mjs sync-tags.cancelled
    exit /b 0
)

REM ---- 4. really apply (makes a timestamped backup automatically) ----
echo.
call node scripts\bat-msg.mjs sync-tags.step-apply
echo.
node scripts\sync-tags-from-json.mjs --apply
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs sync-tags.err-apply
    exit /b 1
)

echo.
call node scripts\bat-msg.mjs sync-tags.done "%PLAYDAY_ADMIN_DB%"
endlocal
