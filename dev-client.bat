@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday (YunGame) dev client launcher.
REM
REM  What it does: 1) start the Vite dev server (5173) in the background
REM                2) compile the main process, then run Electron on it
REM  Requires: npm install already done; a display (else no window shows).
REM
REM  ASCII-ONLY - do NOT put Chinese back into this file. cmd re-reads a .bat
REM  while it executes and tracks a byte offset; with multi-byte text (Chinese)
REM  in the file it resumes at the WRONG offset and runs half a line as a
REM  command - that is the "'xx' is not recognized as an internal or external
REM  command" garbage, and no terminal can fix it. Chinese for the user comes
REM  from scripts\bat-msg.mjs. Same rule as package.bat.
REM ============================================================
setlocal

REM ---- 0. go to the project root (this script's directory) ----
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.dev-client

REM ---- 1. Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    call node scripts\bat-msg.mjs node.proto-ok
) else (
    call node scripts\bat-msg.mjs node.proto-fallback
)

REM ---- 2. the environment the client needs ----
REM  Data dir: decided by the rule table (path-modes.json, "dev" section) and
REM  read ONCE, here (see data-dir.bat). Never hard-code a directory name in
REM  this file - that would be one more copy to forget when the data moves.
REM  Why set YUNGAME_DATA_DIR explicitly: in dev, configRoot() would otherwise
REM  fall back to the repo root, while config.json's libraryDir and friends are
REM  RELATIVE paths (relative to appRoot = repo root). Both have to land in the
REM  same place, or the library and the covers get looked up under two
REM  different roots - silently.
REM  Covers / game details are NOT under the data root: they are the absolute
REM  D: paths from config.json's coverImagesDir / gameDetailsDir, so dev and the
REM  packaged build read the same files instead of each growing its own copy.
call "%~dp0data-dir.bat"
if errorlevel 1 (
    call node scripts\bat-msg.mjs dev.err-datadir
    pause
    exit /b 1
)
REM  Make the main process load the Vite dev server.
set "VITE_DEV_SERVER_URL=http://localhost:5173"
REM On a headless machine there may be no display: uncomment the next line
REM (disables GPU acceleration, which would otherwise error out).
REM set "ELECTRON_DISABLE_GPU=1"

call node scripts\bat-msg.mjs dev.header "%YUNGAME_DATA_DIR%"

REM ---- 3. start the Vite dev server (background) ----
REM ---- 3.5. auto-import the library JSON if it is newer than the authoritative DB ----
REM Why: editing the library games.json used to require a manual
REM `npm run db:import -- --apply`; forgetting it looked like "I changed it but the
REM UI did not" (2026-09-18). sync does nothing when the DB is already up to date
REM (one stat call), and backs the DB up before it ever writes.
REM Paths are NOT hardcoded here on purpose - sync resolves them itself
REM (scripts/lib/devData.mjs); the arch check rejects directory names in .bat files.
call node scripts\library-json.mjs sync

call node scripts\bat-msg.mjs dev.start-vite
start "Playday Vite" /min cmd /c "cd /d %~dp0 && node node_modules\vite\bin\vite.js --port 5173 --strictPort"

REM ---- 4. compile the main process (must finish before Electron) ----
REM Why this step exists: the last line just runs `electron .`, which loads the
REM COMPILED output under dist-electron/. Editing electron/** or shared/** and
REM not recompiling used to mean dev silently ran the OLD code, with no hint
REM (hit that once: path resolution / cover matching changed, the restart
REM looked fine, and it was not).
REM Placed AFTER Vite starts so compiling and Vite startup overlap: total wait
REM is about max(compile time, Vite ready time).
call node scripts\bat-msg.mjs dev.compiling
call node_modules\.bin\tsc.cmd -p tsconfig.main.json > dev-client-build.log 2>&1
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs dev.err-compile
    type dev-client-build.log
    pause
    exit /b 1
)
call node scripts\bat-msg.mjs dev.compiled

REM ---- 4.5 sync config.json (path-modes.json is the single source) ----
REM Why this is mandatory: path-modes.json is the single source for paths, but
REM the client reads config.json. Edit the table, forget to sync, and the client
REM runs on the OLD path (covers / library / GameSaveHelper silently mismatch):
REM no error, no hint - the same class of illusion as "edited the code, did not
REM rebuild" above. It must run AFTER the compile: prepare-release requires
REM dist-electron/shared/pathModes.js to be no older than its source.
call node scripts\bat-msg.mjs dev.sync-config
call "%~dp0sync-config.bat"
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs dev.err-syncconfig
    pause
    exit /b 1
)

REM ---- 5. wait for Vite to be ready (at most 30 seconds) ----
call node scripts\bat-msg.mjs dev.wait-vite
set /a tries=0
:waitvite
set /a tries+=1
if %tries% gtr 30 (
    call node scripts\bat-msg.mjs dev.warn-vite-timeout
    goto runelectron
)
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false }" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto waitvite
)
call node scripts\bat-msg.mjs dev.vite-ready

:runelectron
REM ---- 6. start Electron (it loads 5173) ----
call node scripts\bat-msg.mjs dev.start-electron
REM -log: also write "every path this run actually used" (<data root>\logs\paths-latest.log).
REM  Why dev wants that: path-modes.json's "dev" section holds relative paths
REM  (fonts, library root, dev-tools/runtime); which absolute directories they
REM  resolve to is only visible once it runs. Every field is tagged [exists] /
REM  [missing], so "configured but pointing at nothing" shows up on the spot -
REM  the most expensive failure class in this project is the silent one.
REM  Drop the -log at the end of the next line if you do not want it every run.
call node_modules\.bin\electron.cmd . -log 2>dev-client-err.log

REM ---- 6. what happens when it exits ----
echo.
call node scripts\bat-msg.mjs dev.exited
endlocal
