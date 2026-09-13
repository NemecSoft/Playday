@echo off
chcp 65001 >nul
REM ============================================================
REM  Build the PRE-RELEASE package (test environment, D: drive). No arguments.
REM
REM  This is the double-click entry point - it always builds the prerelease
REM  variant. For the production package (X: drive) use build-release.bat.
REM
REM  What it does:
REM    1) package.bat release_test
REM                        - build + electron-builder into the release_test folder
REM    2) prepare-release   - write config.json for mode "prerelease"
REM                           (D: drive paths; library points at the dev data
REM                            folder, so no data is copied into the package)
REM    3) the result sits in release_test\ - ON PURPOSE SEPARATE from the
REM       release\ folder written by build-release.bat. The two packages differ
REM       only by the drive letters in config.json (D: vs X:), so one shared
REM       folder would make it impossible to tell which one is safe to ship.
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
echo  Playday  -  PRE-RELEASE build (D: drive / TEST)
echo ============================================

REM ---- 1. build + electron-builder into the release_test folder ----
call package.bat release_test
if errorlevel 1 (
    echo [ERROR] package.bat failed - aborting.
    exit /b 1
)

REM ---- 2. write the prerelease config (no data copied) ----
echo.
call node scripts\prepare-release.mjs --mode prerelease --out release_test
if errorlevel 1 (
    echo [ERROR] prepare-release failed - this package is NOT usable.
    exit /b 1
)

echo.
echo ============================================
echo  done - PRE-RELEASE package (D: drive / TEST)
echo  exe    : release_test\PlayniteUI.exe
echo  config : release_test\config.json
echo  data   : none (this variant uses the dev data folder directly)
echo.
echo  NOTE: this is the D: drive TEST config - do not ship it to
echo        production machines. Build the real one with
echo        build-release.bat (that one writes the release\ folder).
echo ============================================
endlocal
pause
