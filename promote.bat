@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday one-click PROMOTE (test environment -> production)
REM
REM  Usage: promote.bat [extra args for promote.mjs]
REM    promote.bat               promote, then clear the test destination
REM    promote.bat --dry-run     print what would change, write nothing
REM    promote.bat --keep-test   promote but keep the test copy
REM
REM  What it does (in this order, on purpose - a failure never loses data):
REM    1) copy the TEST deployment (path-modes.json, release section) to the production side:
REM         Z:  = network drive mapped to the production machine's X:  -> this IS the deploy
REM         X:  = when running ON the production machine itself
REM         release\  = when neither exists (same layout, copy it over by hand)
REM       NOTE: the drive letter INSIDE the files is always X: - Z: is only the transfer path.
REM    2) rewrite config.json on the production copy: leading "D:" -> "X:"
REM    3) migrate the library DB the same way (backed up first, list printed)
REM    4) verify, and only then clear the test destination
REM
REM  Why no rebuild here: what was tested IS that directory. A rebuild would
REM  replace it with something nobody tested, which makes the test worthless.
REM
REM  ASCII-ONLY ON PURPOSE (same reason as package.bat). Chinese for the user
REM  comes from scripts\bat-msg.mjs - see deploy.bat's note.
REM ============================================================
setlocal

cd /d "%~dp0"

REM ---- Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    call node scripts\bat-msg.mjs node.proto-ok
) else (
    call node scripts\bat-msg.mjs node.proto-fallback
)

REM  Chinese for the user comes from scripts\bat-msg.mjs, never from this file:
REM  see the ASCII-ONLY note at the top.
call node scripts\bat-msg.mjs promote.header

REM ---- NO build here, on purpose ----
REM  promote is "take the tested folder, fix the paths, move it" - nothing else.
REM  It still reads the same rule table (from shared/pathModes.ts), so it needs that
REM  parser's build output; deploy.bat always produces it. If it is missing we say so
REM  instead of silently compiling (a recompile here would defeat the point).
if not exist "dist-electron\shared\pathModes.js" (
    call node scripts\bat-msg.mjs promote.err-parser
    pause
    exit /b 1
)

REM ---- promote ----
call node scripts\bat-msg.mjs promote.step
call node scripts\promote.mjs %*
if errorlevel 1 (
    call node scripts\bat-msg.mjs promote.err-failed
    pause
    exit /b 1
)

echo.
call node scripts\bat-msg.mjs promote.done
echo.
call node scripts\bat-msg.mjs wait-key
pause >nul
exit /b 0
endlocal
