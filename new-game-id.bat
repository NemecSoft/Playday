@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday new game id  (double-click, no arguments)
REM
REM  Generates a fresh game id (UUID v4, same shape as every id in
REM  games.json), copies it to the clipboard and prints it, then waits
REM  so you can read the result.
REM
REM  Why: when you add a game by hand to the whole-library JSON
REM  (<data root>\library-json\games.json), its "id" must be unique.
REM  After editing, write it back to the database:
REM      npm run db:import -- --apply
REM  (or double-click libraryjson-importto-librarydb.bat)
REM
REM  ASCII-ONLY ON PURPOSE (same reason as package.bat): Node prints
REM  Chinese for the user; this file prints English.
REM ============================================================
setlocal
cd /d "%~dp0"

REM ---- Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
) else (
    echo [new-game-id] proto Node 22 not found - using the system node
)

call node scripts\new-game-id.mjs %*
if errorlevel 1 (
    echo.
    echo [ERROR] could not generate an id - read the message above.
)

echo.
echo   ---- finished - press any key to close this window ----
pause >nul
exit /b 0
endlocal
