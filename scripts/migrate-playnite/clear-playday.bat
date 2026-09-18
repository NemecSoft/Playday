@echo off
setlocal
chcp 65001 >nul
REM ============================================================
REM  Empties the games table of the Playday target library.
REM  Backs up to library.db.reset-bak first; other tables are kept.
REM  After this you have to run the migration again to import.
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs
REM  (the helper lives two levels up from here).
REM ============================================================
call "%~dp0..\..\scripts\bat-msg.mjs" title.clear-playday
call "%~dp0..\..\scripts\bat-msg.mjs" clear-playday.header
echo.
call "%~dp0..\..\scripts\bat-msg.mjs" clear-playday.ask
set /p confirm=
if /i not "%confirm%"=="yes" (
    call "%~dp0..\..\scripts\bat-msg.mjs" clear-playday.cancelled
    pause
    exit /b 0
)

REM Go to the Playday project root (this file lives in scripts\migrate-playnite\).
cd /d "%~dp0..\.."
node scripts\migrate-playnite\migrate-playnite.mjs --reset %*

if errorlevel 1 (
    echo.
    call "%~dp0..\..\scripts\bat-msg.mjs" clear-playday.err
    pause
    exit /b 1
)

echo.
call "%~dp0..\..\scripts\bat-msg.mjs" clear-playday.done
pause
