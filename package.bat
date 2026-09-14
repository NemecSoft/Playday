@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday one-click package script
REM  Usage: package.bat [outputDir]        (default: release)
REM    prerelease -> build-prerelease.bat passes release_test
REM    production -> build-release.bat    passes release
REM  Steps: 1) npm run build (main + renderer)
REM         2) electron-builder --dir into .pack-tmp\win-unpacked (staging)
REM         3) wipe <outputDir>, then robocopy the exe/resources into it
REM         4) remove the whole staging dir
REM  Result: <outputDir>\PlayniteUI.exe
REM
REM  The output dir is a pure artifact folder - safe to delete and rebuild.
REM  Dev/test data lives in the repo data root (see path-modes.json) and is
REM  never touched by this script. For a runnable package with data, use
REM  prepare-release (see docs/design/release-build.md).
REM
REM  ASCII-ONLY ON PURPOSE: do not put Chinese text back into this file.
REM  cmd re-reads a .bat as it executes and tracks a byte offset; combined with
REM  the code-page switch above, multi-byte text can make it resume at a wrong
REM  offset, so a line gets split and a fragment like "age.bat" is executed
REM  ("is not recognized as an internal or external command"). It is flaky -
REM  it only shows up once the file grows past some size. Node scripts print
REM  Chinese for the user; this file prints English.
REM ============================================================
setlocal

REM ---- 0. go to the project root (this script's directory) ----
cd /d "%~dp0"

REM ---- 0.5 output dir ----
REM  Why a parameter: the prerelease and the production package differ only by
REM  the drive letters inside config.json (D: vs X:). Keeping both in one folder
REM  makes "which one is safe to ship" unanswerable - that is incident-grade.
set "OUTDIR=%~1"
if not defined OUTDIR set "OUTDIR=release"
REM  Safety: step 4 wipes this folder, so accept only the known variants instead
REM  of trusting the argument. A typo (or an absolute path) then cannot delete
REM  anything else, and adding a variant forces a conscious review here.
REM  Keep in sync with build-release.bat / build-prerelease.bat.
if /i not "%OUTDIR%"=="release" if /i not "%OUTDIR%"=="release_test" (
    echo [ERROR] invalid output dir "%OUTDIR%" - expected release or release_test.
    exit /b 1
)
REM  The staging dir is variant-independent: electron-builder's output is set in
REM  one place (electron-builder.yml) because the CLI cannot override it here
REM  (electron-builder 25 treats -c.directories.output as a config *file* path).
set "STAGING=.pack-tmp"

REM ---- 1. Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [package] using Node 22.23.2 (proto)
) else (
    echo [package] proto Node 22 not found - using the system node
)

REM ---- 1.5 Electron binaries via the domestic mirror (GitHub is slow here) ----
REM  Why it downloads at all: electron-builder packs the official electron ZIP
REM  (cached under %LOCALAPPDATA%\electron\Cache), NOT node_modules\electron\dist
REM  - that extracted dir is only used to run the app locally. A version missing
REM  from the cache, or a half-downloaded zip left by an interrupted run, makes
REM  it pull 100+ MB again.
REM  Both vars use "if not defined", so you can go back to the official source
REM  for one run by setting the same variable in your own environment.
REM    ELECTRON_MIRROR                  -> electron zip (app-builder.exe reads it)
REM    ELECTRON_BUILDER_BINARIES_MIRROR -> nsis / winCodeSign tool packages
REM  The electron binary for "npm install" is covered by the repo .npmrc.
REM  See docs/design/release-build.md
if not defined ELECTRON_MIRROR set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
if not defined ELECTRON_BUILDER_BINARIES_MIRROR set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
echo [package] electron download source: %ELECTRON_MIRROR%

echo ============================================
echo  Playday package
echo  output dir: %OUTDIR%
echo  target    : %OUTDIR%\PlayniteUI.exe
echo ============================================

REM ---- 2. compile main + renderer ----
echo [1/4] building main + renderer...
call npm run build
if errorlevel 1 (
    echo [ERROR] build failed - aborting.
    exit /b 1
)

REM ---- 3. electron-builder --dir into the staging dir ----
echo [2/4] electron-builder (unpacked dir)...
call node_modules\.bin\electron-builder.cmd --dir --config electron-builder.yml
if errorlevel 1 (
    echo [ERROR] electron-builder failed - aborting.
    exit /b 1
)

REM ---- 4. wipe %OUTDIR%, then copy win-unpacked into it ----
REM  Why wipe: robocopy /E only adds and overwrites, so leftovers from an older
REM  package (e.g. a dll that a newer electron no longer ships) would silently
REM  travel to the production machine.
REM  Why only here (not at the very start): this runs AFTER the build succeeded,
REM  so a failed build never destroys the previous, still usable package.
REM  It also removes config.json / data\ written by prepare-release - intended:
REM  prepare-release runs after this script and writes both again.
REM  Never keep anything of your own inside the output folders.
echo [3/4] wiping %OUTDIR% and copying artifacts ...
if exist "%OUTDIR%" (
    rmdir /s /q "%OUTDIR%"
)
if exist "%OUTDIR%" (
    echo [ERROR] could not clear %OUTDIR% - close whatever is using it, then retry.
    exit /b 1
)
REM  /MT:16 (2026-09-14, performance-first): copy with 16 threads instead of one.
REM  The payload is ~250 MB (electron runtime + asar + runtime installers), and the
REM  exit-code contract is unchanged (/MT still returns 0-7 = success, >=8 = failure),
REM  so the checks below keep working. Safe here: the source dir is our own staging.
robocopy "%STAGING%\win-unpacked" "%OUTDIR%" /E /NJH /NJS /NDL /NP /R:1 /W:1 /MT:16 >nul
if errorlevel 8 (
    echo [ERROR] robocopy failed - return code %errorlevel%.
    exit /b 1
)

REM ---- 4.5 copy the native YunGameStart (built by tools\yungamestart\build.bat) ----
REM  Must happen AFTER the wipe above: the output dir is cleared on every build,
REM  so anything placed there before is gone. It ships as <package>\yungamestart\
REM  (yungamestart.exe + 1.ico + 2.ico), which is exactly the layout the tool
REM  expects at runtime (it reads 1.ico / 2.ico from its own directory).
REM  Not built yet = not an error: the package is still valid, just without it.
if exist "tools\yungamestart\dist\yungamestart.exe" (
    robocopy "tools\yungamestart\dist" "%OUTDIR%\yungamestart" /E /NJH /NJS /NDL /NP /R:1 /W:1 /MT:16 >nul
    if errorlevel 8 (
        echo [ERROR] robocopy yungamestart failed - return code %errorlevel%.
        exit /b 1
    )
    echo [extra] yungamestart -^> %OUTDIR%\yungamestart
) else (
    echo [extra] SKIP yungamestart (not built - run tools\yungamestart\build.bat first)
)

REM ---- 4.6 copy the runtime installers (VC++ redist x64/x86, VP9 extension) ----
REM  Sibling layout: <package>\runtime\ - same convention as yungamestart\ above, and
REM  the very path config.json points at (settings.runtimeDir, set by path-modes.json:
REM  release X:/YunGame/Playnite/runtime, prerelease D:/YunGame/Playnite/runtime).
REM  Why here and NOT electron-builder extraResources: the configured dir then really
REM  exists on the target machine, and there is exactly ONE 45 MB copy - not one next
REM  to the exe plus one inside resources\. Same reasoning as the yungamestart copy.
if not exist "tools\runtime" (
    echo [ERROR] tools\runtime not found - cannot ship the runtime installers.
    exit /b 1
)
robocopy "tools\runtime" "%OUTDIR%\runtime" /E /NJH /NJS /NDL /NP /R:1 /W:1 /MT:16 >nul
if errorlevel 8 (
    echo [ERROR] robocopy runtime failed - return code %errorlevel%.
    exit /b 1
)
echo [extra] runtime -^> %OUTDIR%\runtime

REM ---- 5. drop the whole staging dir ----
REM  This also removes builder-debug.yml / builder-effective-config.yaml:
REM  electron-builder debug output must not end up in a shippable package.
echo [4/4] removing staging dir %STAGING% ...
if exist "%STAGING%" (
    rmdir /s /q "%STAGING%"
)

echo.
echo ============================================
echo  done
echo  exe: %OUTDIR%\PlayniteUI.exe
echo  (pure artifact folder - dev/test data untouched)
echo ============================================

REM ---- 6. explicit exit code 0 ----
REM  Do not delete: robocopy returns 1 when it copied something (success, but
REM  non-zero). This script only rejects errorlevel >= 8, so the success path
REM  leaks that 1 to the caller; build-prerelease.bat / build-release.bat check
REM  "if errorlevel 1" and would abort AFTER a successful package - the exe is
REM  there but <outputDir>\config.json is never written (looks fine, unusable).
REM  The bug only appears when files were actually copied, so it was flaky.
exit /b 0
endlocal
