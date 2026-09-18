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
REM  Every Chinese line for the user is therefore printed by scripts\bat-msg.mjs,
REM  never echoed here.
REM
REM  That also retired the old "no parentheses in echo text" trap: cmd ends an
REM  IF block at the first closing bracket, so a stray ")" used to kill the file
REM  ("or was unexpected at this time"). Node prints the Chinese now, and cmd
REM  never parses that text. Brackets [ ] stay safe for the ASCII lines here.
REM ============================================================
setlocal
cd /d "%~dp0"
REM node prints UTF-8; without this a double-click run shows mojibake.
chcp 65001 >nul

call node scripts\bat-msg.mjs sync-config.step-preview
node scripts\prepare-release.mjs --mode dev --dry-run
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs sync-config.err-preview
    endlocal
    exit /b 1
)

echo.
call node scripts\bat-msg.mjs sync-config.step-write
node scripts\prepare-release.mjs --mode dev
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs sync-config.err-write
    endlocal
    exit /b 1
)

echo.
call node scripts\bat-msg.mjs sync-config.step-verify
node scripts\prepare-release.mjs --mode dev --check
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs sync-config.err-verify
    endlocal
    exit /b 1
)

echo.
call node scripts\bat-msg.mjs sync-config.ok
endlocal
exit /b 0