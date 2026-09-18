@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - write whole-library JSON back into the authoritative library.
REM  library-json\*.json -> Admin\library.db
REM
REM  THIN SHELL: go to the repo root -> call PowerShell -> pass the exit code
REM  through -> pause. The real logic is in
REM  scripts\libraryjson-importto-librarydb.ps1.
REM
REM  Why split like this (docs\PROJECT-MEMORY.md, hard rule 3.14): cmd's parsing
REM  layer is one trap after another and hitting one costs a "silently created
REM  junk file + a misleading error" (the 4 junk files in rule 3.13 are the
REM  evidence). So: all logic in the .ps1, the .bat is only a shell - and no
REM  bare angle brackets in the shell (escape them if you need them).
REM
REM  Usage: double-click = preview first, press Y to write;
REM         command line: libraryjson-importto-librarydb.bat --yes (skip confirm)
REM  Arguments go straight to the .ps1:
REM    --yes / --merge / --force / --add-columns / --dir / --db
REM ============================================================
setlocal
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.libraryjson-import
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\libraryjson-importto-librarydb.ps1" %*
set "RC=%errorlevel%"
echo.
pause
endlocal & exit /b %RC%
