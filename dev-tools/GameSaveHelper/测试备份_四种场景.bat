@echo off
chcp 65001 >nul
REM ============================================================================
REM  Scenario test for the save backup: four cases, each opens a GameSaveHelper
REM  window (exactly like running it with arguments by hand). Close the window and
REM  the script moves on to the next case.
REM
REM  Case 1: savePaths empty     -> expect: red window "no save config", no package
REM  Case 2: 1 path              -> expect: green "backup ok", package on desktop
REM  Case 3: 2 paths             -> expect: green, both paths in one package
REM  Case 4: 3 paths (1 empty)   -> expect: green, the empty dir is skipped
REM  Packages land on the desktop; the save paths come from games.json.
REM
REM  ASCII-ONLY: the game names and every message are Chinese, so they come from
REM  scripts\bat-msg.mjs (see the note in deploy.bat).
REM ============================================================================

cd /d "%~dp0"
set "EXE=%~dp0GameSaveHelper.exe"
set "BM=%~dp0..\..\scripts\bat-msg.mjs"
set /a PASS=0, FAIL=0

REM Read the four game names and the desktop glob once (all Chinese, from bat-msg).
for /f "delims=" %%g in ('call "%BM%" gsh.game1') do set "G1=%%g"
for /f "delims=" %%g in ('call "%BM%" gsh.game2') do set "G2=%%g"
for /f "delims=" %%g in ('call "%BM%" gsh.game3') do set "G3=%%g"
for /f "delims=" %%g in ('call "%BM%" gsh.game4') do set "G4=%%g"
for /f "delims=" %%g in ('call "%BM%" gsh.backup-glob') do set "BLOB=%%g"

call "%BM%" title.gsh-scenarios
call "%BM%" gsh.scenario-header
echo.

call "%BM%" gsh.scenario1
echo.
"%EXE%" "%G1%"
if errorlevel 2 (
    call "%BM%" gsh.pass1
    set /a PASS+=1
) else (
    call "%BM%" gsh.fail1
    set /a FAIL+=1
)
echo.

call "%BM%" gsh.scenario2
echo.
"%EXE%" "%G2%"
if not errorlevel 1 (
    call "%BM%" gsh.pass-backup
    set /a PASS+=1
) else (
    call "%BM%" gsh.fail-red
    set /a FAIL+=1
)
echo.

call "%BM%" gsh.scenario3
echo.
"%EXE%" "%G3%"
if not errorlevel 1 (
    call "%BM%" gsh.pass-backup
    set /a PASS+=1
) else (
    call "%BM%" gsh.fail-red
    set /a FAIL+=1
)
echo.

call "%BM%" gsh.scenario4
echo.
"%EXE%" "%G4%"
if not errorlevel 1 (
    call "%BM%" gsh.pass-skip
    set /a PASS+=1
) else (
    call "%BM%" gsh.fail-red
    set /a FAIL+=1
)
echo.

call "%BM%" gsh.result "%PASS%" "%FAIL%"
echo.
call "%BM%" gsh.recent-backups
dir /b /o-d "%USERPROFILE%\Desktop\%BLOB%" 2>nul
echo.
call "%BM%" gsh.usage-note
pause
