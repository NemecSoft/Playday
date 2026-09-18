@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday one-click DEPLOY (test environment = the real destination)
REM
REM  Usage: deploy.bat [extra args for deploy.mjs]
REM    deploy.bat                 deploy to D:\YunGame\Playnite (per path-modes.json)
REM    deploy.bat --dry-run       print the plan only, write nothing
REM
REM  Steps: 1) node scripts\build.mjs    (incremental: skips vite build when the
REM                                        renderer inputs did not change)
REM         2) node scripts\pack.mjs     -> .pack-tmp\win-unpacked (staging).
REM                                        Reuses the Electron runtime and only
REM                                        re-packs app.asar when just app code
REM                                        changed; full electron-builder when the
REM                                        "shell" changed (or on first run).
REM         3) node scripts\deploy.mjs   -> program + dev-* assets + config.json
REM         4) KEEP the staging dir     (baseline for the next incremental pack)
REM
REM  Extra flag:
REM    --full    force a clean build + a full repack (ignore every cache)
REM
REM  Why the program goes straight to the destination: that directory IS the
REM  test environment on this machine (D:\YunGame\Playnite), so a separate
REM  "release_test\" staging folder would only add one more manual copy step
REM  (and one more chance to run a stale build). See docs/design/release-build.md.
REM
REM  ASCII-ONLY ON PURPOSE (same reason as package.bat): cmd re-reads a .bat as
REM  it executes and tracks a byte offset; with the code-page switch above,
REM  multi-byte text can make it resume at a wrong offset and execute a fragment
REM  of a line. So every user-facing Chinese line comes from scripts\bat-msg.mjs
REM  (call node scripts\bat-msg.mjs <key>) - this file stays pure ASCII, comments
REM  included.
REM ============================================================
setlocal

REM ---- 0. go to the project root (this script's directory) ----
cd /d "%~dp0"

REM ---- 1. Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    call node scripts\bat-msg.mjs node.proto-ok
) else (
    call node scripts\bat-msg.mjs node.proto-fallback
)

REM ---- 1.5 Electron binaries via the domestic mirror (see package.bat) ----
if not defined ELECTRON_MIRROR set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
if not defined ELECTRON_BUILDER_BINARIES_MIRROR set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"

set "STAGING=.pack-tmp"

REM ---- --full: force a clean build + a full repack (ignore every cache) ----
set "FULL="
set "BUILD_ARGS="
set "PACK_ARGS="
REM  Note the guard: `for %%a in () do` is a syntax error, so only loop when there is an arg.
if not "%~1"=="" for %%a in (%*) do if /i "%%a"=="--full" set "FULL=1"
if defined FULL (
    set "BUILD_ARGS=--force"
    set "PACK_ARGS=--full"
    call node scripts\bat-msg.mjs deploy.full
)

REM  Chinese for the user comes from scripts\bat-msg.mjs, never from this file:
REM  see the ASCII-ONLY note at the top.
call node scripts\bat-msg.mjs deploy.header "%STAGING%\win-unpacked"

REM ---- 2. compile main + renderer (incremental: unchanged parts are skipped) ----
call node scripts\bat-msg.mjs deploy.step-build
call node scripts\build.mjs %BUILD_ARGS%
if errorlevel 1 (
    call node scripts\bat-msg.mjs deploy.err-build
    pause
    exit /b 1
)

REM ---- 3. pack into the staging dir (re-pack app.asar only when the shell is unchanged) ----
call node scripts\bat-msg.mjs deploy.step-pack
call node scripts\pack.mjs %PACK_ARGS%
if errorlevel 1 (
    call node scripts\bat-msg.mjs deploy.err-pack
    pause
    exit /b 1
)

REM ---- 4. deploy: program + assets + config.json ----
REM  Everything after this point is table-driven (scripts/deploy.mjs reads
REM  dist-electron/shared/pathModes.js); this file knows nothing about paths.
call node scripts\bat-msg.mjs deploy.step-deploy
call node scripts\deploy.mjs --staging "%STAGING%\win-unpacked" %*
if errorlevel 1 (
    call node scripts\bat-msg.mjs deploy.err-deploy
    pause
    exit /b 1
)

REM ---- 5. KEEP the staging dir (kept since 2026-09-17) ----
REM  It is now the BASELINE for incremental packing: the next deploy only re-packs
REM  app.asar instead of re-copying the 330MB Electron runtime (see scripts/pack.mjs).
REM  electron-builder debug output only appears on failure - drop it, it must not ship.
call node scripts\bat-msg.mjs deploy.step-keep "%STAGING%"
if exist ".pack-tmp\builder-debug.yml" del /q ".pack-tmp\builder-debug.yml" >nul 2>&1
if exist ".pack-tmp\builder-effective-config.yaml" del /q ".pack-tmp\builder-effective-config.yaml" >nul 2>&1

echo.
call node scripts\bat-msg.mjs deploy.done
echo.
call node scripts\bat-msg.mjs wait-key
pause >nul
exit /b 0
endlocal
