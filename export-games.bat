@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - export the database to games.json (for GameSaveHelper).
REM
REM  This is the DATA OUTLET for dev-tools/GameSaveHelper (the save-backup
REM  tool), not a data-management tool:
REM    to manage data use  npm run db:export / db:import
REM    (or double-click libraryjson-importto-librarydb.bat)
REM    The other half of that chain (import-games.bat, games.json -> library)
REM    was retired on 2026-09-16.
REM  WARNING: the output format (camelCase fields + tab indent) is an interface
REM  parsed by GameSaveHelper's C++ via exact text anchors - do not change it.
REM  See the header of _export-games-json.mjs.
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs.
REM ============================================================

REM The authoritative library path comes from the rule table (path-modes.json
REM "dev" section, see data-dir.bat).
call "%~dp0data-dir.bat"
if errorlevel 1 goto :end

call node scripts\bat-msg.mjs title.export-games
call node scripts\bat-msg.mjs export-games.header "%PLAYDAY_ADMIN_DB%"
echo.

if not exist "%PLAYDAY_ADMIN_DB%" (
  call node scripts\bat-msg.mjs export-games.err-nodb "%PLAYDAY_ADMIN_DB%"
  goto :end
)

node _export-games-json.mjs
if errorlevel 1 (
  echo.
  call node scripts\bat-msg.mjs export-games.err-failed
  goto :end
)

echo.
call node scripts\bat-msg.mjs export-games.done

:end
echo.
pause
