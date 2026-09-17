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
REM  ASCII-ONLY ON PURPOSE (same reason as package.bat).
REM ============================================================
setlocal

cd /d "%~dp0"

REM ---- Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [promote] using Node 22.23.2 (proto)
) else (
    echo [promote] proto Node 22 not found - using the system node
)

echo ============================================
echo  Playday promote (test -^> production)
echo ============================================

REM ---- NO build here, on purpose ----
REM  promote is "take the tested folder, fix the paths, move it" - nothing else.
REM  It still reads the same rule table (from shared/pathModes.ts), so it needs that
REM  parser's build output; deploy.bat always produces it. If it is missing we say so
REM  instead of silently compiling (a recompile here would defeat the point).
if not exist "dist-electron\shared\pathModes.js" (
    echo [ERROR] dist-electron\shared\pathModes.js is missing - run deploy.bat once first.
    echo         ^(promote reads the rule table; that parser is build output^)
    pause
    exit /b 1
)

REM ---- promote ----
echo [1/2] promoting (no rebuild)...
call node scripts\promote.mjs %*
if errorlevel 1 (
    echo [ERROR] promote failed - the test destination was NOT cleared (by design).
    pause
    exit /b 1
)

echo [2/2] done
echo.
echo ============================================
echo  done. The next step is printed in the log above.
echo  Log : logs\promote-last.log  (the whole run, kept on disk)
echo ============================================
echo.
echo   ---- finished - press any key to close this window ----
pause >nul
exit /b 0
endlocal
