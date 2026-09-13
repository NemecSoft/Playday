@echo off
chcp 65001 >nul
REM ============================================================
REM  Build the RELEASE package (production, X: drive). No arguments.
REM
REM  This is the double-click entry point - it always builds the release
REM  variant. For the test/pre-release variant (D: drive) use
REM  build-prerelease.bat instead.
REM
REM  What it does:
REM    1) package.bat release
REM                        - build + electron-builder into the release folder
REM    2) prepare-release   - write config.json for mode "release"
REM                           (X: drive paths) and copy the data folder
REM
REM  Output folder is release\ - this is the SHIPPABLE artifact: copy the whole
REM  folder to a production machine as-is (exe + config.json + data\ are inside).
REM  The test variant goes to release_test\ (build-prerelease.bat) instead, so
REM  the two never mix.
REM  Per-mode directories come from path-modes.json - see
REM  docs/design/release-build.md. Chinese output is printed by node.
REM
REM  ASCII-ONLY ON PURPOSE: cmd decodes a .bat with the console code page
REM  active when it opened the file, so multi-byte text can get split and
REM  half a comment line can be executed ("'se' is not recognized ...").
REM ============================================================
setlocal
cd /d "%~dp0"

echo ============================================
echo  Playday  -  RELEASE build (X: drive)
echo ============================================

REM ---- 1. build + electron-builder into the release folder ----
call package.bat release
if errorlevel 1 (
    echo [ERROR] package.bat failed - aborting.
    exit /b 1
)

REM ---- 2. write the release config (+ data next to the exe) ----
echo.
call node scripts\prepare-release.mjs --mode release --out release
if errorlevel 1 (
    echo [ERROR] prepare-release failed - this package is NOT usable.
    exit /b 1
)

echo.
echo ============================================
echo  done - release package (X: drive)
echo  exe    : release\PlayniteUI.exe
echo  config : release\config.json
echo  data   : <exe dir>\data  (ships with the package)
echo.
echo  SHIPPABLE: copy the whole release\ folder to the production machine
echo             (exe + config.json + data\ are all inside it).
echo ============================================
endlocal
pause