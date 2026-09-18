@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - back up the authoritative library.
REM  Admin\library.db -> library.db.bak-<timestamp>
REM
REM  THIN SHELL: go to the repo root -> call PowerShell -> pass the exit code
REM  through -> pause. The real logic is in scripts\librarydb-backup.ps1.
REM
REM  Why split like this (docs\PROJECT-MEMORY.md, hard rule 3.14): cmd's parsing
REM  layer (redirection, parenthesised blocks, ^ escaping, % expansion, English
REM  errors after chcp) is one trap after another, and hitting one costs a
REM  "silently created junk file + a misleading error". So: all logic lives in
REM  the .ps1, the .bat is only a shell - and the shell stays pure ASCII.
REM
REM  When to use it: before hand-editing *.json in the library-json directory,
REM  or before running any other script that touches the library. A plain
REM  write-back (libraryjson-importto-librarydb.bat) does not need it - it makes
REM  its own backup before writing.
REM ============================================================
setlocal
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.librarydb-backup
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\librarydb-backup.ps1" %*
set "RC=%errorlevel%"
echo.
pause
endlocal & exit /b %RC%
