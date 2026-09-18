@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - export the authoritative library to whole-library JSON.
REM  Admin\library.db -> library-json\*.json
REM
REM  THIN SHELL, same split as librarydb-backup.bat: the real logic is in
REM  scripts\librarydb-exportto-libraryjson.ps1.
REM
REM  Usage: double-click = export (read-only on the library, but it overwrites
REM  the JSON); on the command line, arguments go straight to the .ps1:
REM  --force / --tables users / --dir / --db
REM
REM  ASCII-ONLY: see the note in package.bat.
REM ============================================================
setlocal
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.librarydb-export
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\librarydb-exportto-libraryjson.ps1" %*
set "RC=%errorlevel%"
echo.
pause
endlocal & exit /b %RC%
