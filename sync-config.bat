@echo off
REM ============================================================
REM  Sync dev config.json from path-modes.json (the single source).
REM
REM  WHY THIS EXISTS: path-modes.json is the only place a path may be
REM  written, but the client reads config.json. Edit the table, forget to
REM  sync, and the client silently runs on the OLD path - covers / library /
REM  GameSaveHelper - with no error and no hint. dev-client.bat calls this
REM  before launching, so a dev start can no longer run on a stale config.
REM
REM  WHAT IT DOES - dev mode only; release / prerelease have their own entry
REM  points, build-release.bat / build-prerelease.bat:
REM    1) --dry-run  list the fields that would change, writes nothing
REM    2) sync       write config.json; only the path fields come from the
REM                  table, every other setting in config.json is kept
REM    3) --check    confirm the two files now agree
REM
REM  exits 1 when the table is invalid or the sync fails, so the caller
REM  must abort.
REM
REM  WHY THIS FILE IS ASCII-ONLY: it gets CALLED from other bats, and cmd.exe
REM  decodes a .bat with the console code page active when it opened the file.
REM  Multi-byte text can be mis-decoded, a line can get split, and cmd then
REM  runs the tail of a comment. Same rule as data-dir.bat.
REM
REM  WHY NO PARENTHESES IN ECHO TEXT: an echo line inside an IF ERRORLEVEL
REM  block ends the block at the first closing bracket, the rest of the line
REM  is then parsed as a command and cmd dies with
REM  "or was unexpected at this time". Hit that once while writing this file.
REM  Brackets [ ] are safe - use them.
REM ============================================================
setlocal
cd /d "%~dp0"
REM node prints UTF-8; without this a double-click run shows mojibake.
chcp 65001 >nul

echo [sync-config] 1/3 preview --dry-run, writes nothing...
node scripts\prepare-release.mjs --mode dev --dry-run
if errorlevel 1 (
    echo.
    echo [sync-config] FAILED at preview. Reason is above; config.json untouched.
    echo   Usual causes: path-modes.json "dev" section invalid - dev must be on
    echo   the D: drive, no missing or unknown field names - or the compiled
    echo   artifact dist-electron\shared\pathModes.js is missing, or older than
    echo   its source shared\pathModes.ts. Rebuild with: npm run build
    endlocal
    exit /b 1
)

echo.
echo [sync-config] 2/3 writing config.json...
node scripts\prepare-release.mjs --mode dev
if errorlevel 1 (
    echo.
    echo [sync-config] FAILED while writing. config.json was NOT synced.
    endlocal
    exit /b 1
)

echo.
echo [sync-config] 3/3 verifying --check...
node scripts\prepare-release.mjs --mode dev --check
if errorlevel 1 (
    echo.
    echo [sync-config] FAILED at verification. The two files still disagree.
    endlocal
    exit /b 1
)

echo.
echo [sync-config] OK: dev config.json matches path-modes.json.
endlocal
exit /b 0