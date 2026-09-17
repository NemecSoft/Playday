@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday one-click DEPLOY (test environment = the real destination)
REM
REM  Usage: deploy.bat [extra args for deploy.mjs]
REM    deploy.bat                 deploy to D:\YunGame\Playnite (per path-modes.json)
REM    deploy.bat --dry-run       print the plan only, write nothing
REM
REM  Steps: 1) npm run build            (main + renderer)
REM         2) electron-builder --dir    -> .pack-tmp\win-unpacked (staging)
REM         3) node scripts\deploy.mjs   -> program + dev-* assets + config.json
REM         4) remove the staging dir
REM
REM  Why the program goes straight to the destination: that directory IS the
REM  test environment on this machine (D:\YunGame\Playnite), so a separate
REM  "release_test\" staging folder would only add one more manual copy step
REM  (and one more chance to run a stale build). See docs/design/release-build.md.
REM
REM  ASCII-ONLY ON PURPOSE (same reason as package.bat): cmd re-reads a .bat as
REM  it executes and tracks a byte offset; with the code-page switch above,
REM  multi-byte text can make it resume at a wrong offset and execute a fragment
REM  of a line. Node scripts print Chinese for the user; this file prints English.
REM ============================================================
setlocal

REM ---- 0. go to the project root (this script's directory) ----
cd /d "%~dp0"

REM ---- 1. Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [deploy] using Node 22.23.2 (proto)
) else (
    echo [deploy] proto Node 22 not found - using the system node
)

REM ---- 1.5 Electron binaries via the domestic mirror (see package.bat) ----
if not defined ELECTRON_MIRROR set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
if not defined ELECTRON_BUILDER_BINARIES_MIRROR set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"

set "STAGING=.pack-tmp"

echo ============================================
echo  Playday deploy
echo  mode    : release  (destination comes from path-modes.json)
echo  staging : %STAGING%\win-unpacked
echo ============================================

REM ---- 2. compile main + renderer ----
echo [1/4] building main + renderer...
call npm run build
if errorlevel 1 (
    echo [ERROR] build failed - aborting.
    pause
    exit /b 1
)

REM ---- 3. electron-builder --dir into the staging dir ----
echo [2/4] electron-builder (unpacked dir)...
call node_modules\.bin\electron-builder.cmd --dir --config electron-builder.yml
if errorlevel 1 (
    echo [ERROR] electron-builder failed - aborting.
    pause
    exit /b 1
)

REM ---- 4. deploy: program + assets + config.json ----
REM  Everything after this point is table-driven (scripts/deploy.mjs reads
REM  dist-electron/shared/pathModes.js); this file knows nothing about paths.
echo [3/4] deploying to the destination...
call node scripts\deploy.mjs --staging "%STAGING%\win-unpacked" %*
if errorlevel 1 (
    echo [ERROR] deploy failed - nothing was left half-done on purpose; read the log above.
    pause
    exit /b 1
)

REM ---- 5. drop the staging dir ----
REM  Also removes builder-debug.yml / builder-effective-config.yaml: electron-builder
REM  debug output must not end up in a shippable package.
echo [4/4] removing staging dir %STAGING% ...
if exist "%STAGING%" rmdir /s /q "%STAGING%"

echo.
echo ============================================
echo  done - deployed.
echo.
echo  Next : run the client in the destination (PlayniteUI.exe)
echo         then, if it looks right: promote.bat  (to the production machine)
echo  Log  : logs\deploy-last.log  (the whole run, kept on disk)
echo ============================================
echo.
echo   ---- finished - press any key to close this window ----
pause >nul
exit /b 0
endlocal
