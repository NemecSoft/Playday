@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - update the user list (plaintext master -> encrypted live copy).
REM
REM  It does exactly one thing:
REM      plaintext master  files\YunGame_UserList.json   (edit this copy from now on)
REM       -> encrypt -> overwrite the copy that is live
REM          (YunGame_UserList.json in the directory config.json's
REM           YunGameConfigDir names)
REM
REM  Why it is built this way:
REM    - One single plaintext master means there is no "which copy did I edit?"
REM      question any more. Encryption is a straight transform, and the file
REM      being overwritten is backed up as .bak-<timestamp> first.
REM    - The target gets a FILE NAME only, never a directory: the script resolves
REM      the directory from config.json, so changing the config (another drive,
REM      another deployment folder) carries it along. No path is hard-coded here.
REM
REM  Usage:
REM    double-click                       -> use the plaintext master in files
REM    drag another plaintext onto this   -> use that file (same target)
REM    update-userlist.bat y              -> skip the confirmation (scripting)
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs.
REM ============================================================
setlocal
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.update-userlist

REM ---- 0. Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
) else (
    call node scripts\bat-msg.mjs node.proto-fallback
)

REM ---- 1. source: the plaintext master by default; a dropped file wins ----
set "SRC=files\YunGame_UserList.json"
set "AUTO="
if /i "%~1"=="y" set "AUTO=1"
if not "%~1"=="" if /i not "%~1"=="y" set "SRC=%~1"
REM A dragged/pasted path may come with quotes - strip them
set "SRC=%SRC:"=%"

if not exist "%SRC%" (
    echo.
    call node scripts\bat-msg.mjs update-userlist.err-nosrc "%SRC%"
    goto :end
)

call node scripts\bat-msg.mjs update-userlist.header "%SRC%"

REM ---- 2. preview first (dry run, writes nothing) ----
echo.
call node scripts\bat-msg.mjs update-userlist.step-preview
echo.
node scripts\encrypt-userlist.mjs "%SRC%" YunGame_UserList.json --dry-run
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs update-userlist.err-preview
    goto :end
)

REM ---- 3. write after confirmation (the overwritten copy is backed up) ----
REM     Trap: set /p and the %CONFIRM% check must not sit in the same block
REM     (variables expand at parse time).
if "%AUTO%"=="1" goto :write
echo.
call node scripts\bat-msg.mjs update-userlist.ask-write
set /p CONFIRM=
if /i not "%CONFIRM%"=="Y" (
    echo.
    call node scripts\bat-msg.mjs update-userlist.cancelled
    goto :end
)

:write
echo.
call node scripts\bat-msg.mjs update-userlist.step-write
echo.
node scripts\encrypt-userlist.mjs "%SRC%" YunGame_UserList.json
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs update-userlist.err-write
    goto :end
)

echo.
call node scripts\bat-msg.mjs update-userlist.done

:end
echo.
if "%AUTO%"=="1" goto :eof
pause
endlocal
