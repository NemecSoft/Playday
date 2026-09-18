@echo off
chcp 65001 >nul
REM ============================================================================
REM  build-release.bat - assemble a deployable release directory.
REM  Produces: release\GameSaveHelper.exe + settings.json + template\
REM            + assets\icon.ico + nsis\ (optional compiler)
REM  Usage: build-release.bat [gamesJsonPath] [coverDirPath]
REM    arg 1 (optional): the games.json path written into settings.json
REM    arg 2 (optional): the cover image directory:
REM      test environment (default): D:\YunGame\PlayNite\CoverImages
REM      production:                 X:\YunGame\PlayNite\CoverImages
REM  Note: set SKIP_NSIS=1 to skip copying NSIS (tens of MB).
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs
REM  (see the note in deploy.bat).
REM ============================================================================

cd /d "%~dp0"
set "REL=release"
set "GAMESJSON=%~1"
set "COVER=%~2"
if "%GAMESJSON%"=="" set "GAMESJSON=D:\AI\Code\Playnite\Playday\games.json"
if "%COVER%"=="" set "COVER=D:\YunGame\PlayNite\CoverImages"

call "%~dp0..\..\scripts\bat-msg.mjs" title.gsh-build-release
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-build.header

call "%~dp0..\..\scripts\bat-msg.mjs" gsh-build.step-compile
call build.bat
if errorlevel 1 goto :fail

call "%~dp0..\..\scripts\bat-msg.mjs" gsh-build.step-prepare "%REL%"
rd /s /q "%REL%" 2>nul
mkdir "%REL%" 2>nul
mkdir "%REL%\template" 2>nul
mkdir "%REL%\assets" 2>nul

call "%~dp0..\..\scripts\bat-msg.mjs" gsh-build.step-copy
copy /y "GameSaveHelper.exe" "%REL%\" >nul
copy /y "template\GameSaveHelper.nsi" "%REL%\template\" >nul
copy /y "assets\icon.ico" "%REL%\assets\" >nul
if not exist "%REL%\GameSaveHelper.exe" goto :fail

if not "%SKIP_NSIS%"=="1" (
    call "%~dp0..\..\scripts\bat-msg.mjs" gsh-build.copy-nsis
    robocopy nsis "%REL%\nsis" /E /NFL /NDL /NJH /NJS >nul
    if errorlevel 8 goto :fail
)

call "%~dp0..\..\scripts\bat-msg.mjs" gsh-build.step-settings
(
echo {
echo   "gamesJson": "%GAMESJSON:\=\\%",
echo   "nsis": "nsis\\makensis.exe",
echo   "outDir": "",
echo   "coverDir": "%COVER:\=\\%",
echo   "recurse": "true"
echo }
) > "%REL%\settings.json"

echo.
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-build.done
dir /b "%REL%"
echo.
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-build.deploy-note
exit /b 0

:fail
echo.
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-build.err
exit /b 1
