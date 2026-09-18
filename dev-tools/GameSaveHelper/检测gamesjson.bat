@echo off
chcp 65001 >nul
REM ============================================================================
REM  check-gamesjson.bat - report format problems in games.json, with line numbers.
REM  Result: on screen + the full list is written to the report file (its name is
REM          Chinese, so it comes from scripts\bat-msg.mjs).
REM  Usage: double-click; or pass another games.json path as an argument.
REM ============================================================================

cd /d "%~dp0"
call "%~dp0..\..\scripts\bat-msg.mjs" title.gsh-checkjson

set "GAMESJSON=%~1"
if "%GAMESJSON%"=="" set "GAMESJSON=D:\AI\Code\Playnite\Playday\games.json"

if not exist "%GAMESJSON%" (
    call "%~dp0..\..\scripts\bat-msg.mjs" gsh.err-nofile "%GAMESJSON%"
    pause
    exit /b 2
)

REM The report file name is Chinese: read it into a variable, never write it here.
for /f "delims=" %%r in ('call "%~dp0..\..\scripts\bat-msg.mjs" gsh.report-file') do set "REPORT=%%r"

node "tools\check-gamesjson.mjs" "%GAMESJSON%"
if errorlevel 1 (
    echo.
    call "%~dp0..\..\scripts\bat-msg.mjs" gsh.err-node
    pause
    exit /b 1
)

echo.
call "%~dp0..\..\scripts\bat-msg.mjs" gsh.ask-open
set /p OPEN=
if /i "%OPEN%"=="Y" start "" "%REPORT%"
exit /b 0
