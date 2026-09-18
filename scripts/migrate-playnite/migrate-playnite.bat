@echo off
setlocal
chcp 65001 >nul
REM ============================================================
REM  Playnite -> Playday data migration.
REM  Safe to re-run (idempotent): matches by game name, keeps Playday-specific
REM  fields. The target library is backed up as library.db.migrate-bak first.
REM
REM  Environment data / paths are resolved from path-modes.json; see
REM  docs\design\database-schema.md.
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs
REM  (the helper lives two levels up from here).
REM ============================================================
call "%~dp0..\..\scripts\bat-msg.mjs" title.migrate-playnite
call "%~dp0..\..\scripts\bat-msg.mjs" migrate.header
echo.

REM Go to the Playday project root (this file lives in scripts\migrate-playnite\).
cd /d "%~dp0..\.."

REM Arguments are passed straight through, e.g.:
REM   migrate-playnite.bat --playnite D:\YunGame\PlayNite
REM   migrate-playnite.bat --data dev-data
REM   migrate-playnite.bat --db D:\path\to\library.db
node scripts\migrate-playnite\migrate-playnite.mjs %*

if errorlevel 1 (
    echo.
    call "%~dp0..\..\scripts\bat-msg.mjs" migrate.err
    echo.
    pause
    exit /b 1
)

echo.
call "%~dp0..\..\scripts\bat-msg.mjs" migrate.done
echo.
pause
