@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - one-click user list encryption (original JsonCrypt algorithm).
REM
REM  This is what it does by default (the step you normally want):
REM    source: D:\AI\Code\YunGameProject\YunGameTools\JsonCrypt\jsoncrypt\bin\Debug\YunGame_UserList.json
REM    target: D:\YunGame\PlayNite\YunGameConfig\YunGame_UserList.json
REM    i.e. encrypt the plaintext from jsoncrypt and write it as the ciphertext
REM    the client actually reads under YunGameConfig.
REM
REM  Three safety gates (implemented in the script):
REM    (1) an existing target file is backed up as
REM        YunGame_UserList.json.bak-<timestamp> first
REM    (2) a source file that is ALREADY ciphertext is refused (encrypting it
REM        again would destroy the data)
REM    (3) a source file that is not valid JSON is refused too (so a broken file
REM        cannot be hidden)
REM    - it also reports which records the deployment would change, so data is
REM      never replaced silently.
REM
REM  Usage:
REM    double-click                       -> the two default paths above
REM    encrypt-userlist.bat "src.json"              -> other source, same target
REM    encrypt-userlist.bat "src.json" "dst.json"   -> both given explicitly
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs.
REM ============================================================
setlocal

REM ---- 0. go to the project root (this script's directory) ----
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.encrypt-userlist

REM ---- 1. the two default paths (arguments override them) ----
set "SRC=D:\AI\Code\YunGameProject\YunGameTools\JsonCrypt\jsoncrypt\bin\Debug\YunGame_UserList.json"
set "DST=D:\YunGame\PlayNite\YunGameConfig\YunGame_UserList.json"
if not "%~1"=="" set "SRC=%~1"
if not "%~2"=="" set "DST=%~2"

REM ---- 2. Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    call node scripts\bat-msg.mjs node.proto-ok
) else (
    call node scripts\bat-msg.mjs node.proto-fallback
)

call node scripts\bat-msg.mjs encrypt-userlist.header "%SRC%" "%DST%"

REM ---- 3. preview first (dry run, writes nothing) ----
echo.
call node scripts\bat-msg.mjs encrypt-userlist.step-preview
echo.
node scripts\encrypt-userlist.mjs --dry-run "%SRC%" "%DST%"
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs encrypt-userlist.err-preview
    goto :end
)

REM ---- 4. encrypt for real after confirmation (the target is backed up) ----
REM     Trap: set /p and the %CONFIRM% check must not sit in the same block
REM     (variables expand at parse time).
echo.
call node scripts\bat-msg.mjs encrypt-userlist.ask-write
set /p CONFIRM=
if /i not "%CONFIRM%"=="Y" (
    echo.
    call node scripts\bat-msg.mjs encrypt-userlist.cancelled
    goto :end
)

echo.
call node scripts\bat-msg.mjs encrypt-userlist.step-write
echo.
node scripts\encrypt-userlist.mjs "%SRC%" "%DST%"
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs encrypt-userlist.err-write
    goto :end
)

echo.
call node scripts\bat-msg.mjs encrypt-userlist.done

:end
echo.
pause
endlocal
