@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - user list encrypt / decrypt (YunGame_UserList.json).
REM  Original JsonCrypt algorithm: base64(plaintext XOR "yungameplaynite")
REM
REM  Why this step exists: the client can read that file in BOTH forms
REM  (shared/userLevel.ts detects which), but hand-editing needs the PLAINTEXT -
REM  editing the ciphertext directly cannot be read back. So the flow is:
REM  decrypt to plaintext -> edit in Notepad -> encrypt back.
REM
REM  Usage:
REM    double-click          -> pick a direction (1 encrypt / 2 decrypt), then a
REM                             file (Enter = the one named in config.json)
REM    drop a file on this   -> the file is known, only the direction is asked
REM    userlist-crypt.bat e FILE   -> encrypt straight away (d = decrypt)
REM    full form: userlist-crypt.bat e|d [file] [target]
REM
REM  Safety gates (implemented in scripts/encrypt-userlist.mjs; this is only the
REM  entry point):
REM    - the wrong direction is refused (encrypting a ciphertext or decrypting a
REM      plaintext destroys data)
REM    - the existing target is backed up as .bak-<timestamp> before encrypting;
REM      decrypt does NOT overwrite the ciphertext by default, it writes
REM      *.decrypted.json instead
REM    - if the result is not valid JSON nothing is written (wrong key / damaged
REM      file -> better to do nothing at all)
REM
REM  ASCII-ONLY: Chinese for the user is printed by scripts\bat-msg.mjs.
REM ============================================================
setlocal
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.userlist-crypt

REM ---- 0. Node 22 managed by proto (fall back to the system node) ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
) else (
    call node scripts\bat-msg.mjs node.proto-fallback
)

REM ---- 1. direction: command line e / d wins, otherwise ask ----
set "MODE="
if /i "%~1"=="e" set "MODE=1"
if /i "%~1"=="d" set "MODE=2"
if not "%MODE%"=="" goto :gotmode

call node scripts\bat-msg.mjs userlist-crypt.header
call node scripts\bat-msg.mjs userlist-crypt.ask-mode
set /p MODE=
if "%MODE%"=="" set "MODE=1"
if "%MODE%"=="1" goto :gotmode
if "%MODE%"=="2" goto :gotmode
echo.
call node scripts\bat-msg.mjs userlist-crypt.err-mode
goto :end

:gotmode
REM ---- 2. file: from the command line if given; when %~1 is not e/d it is the
REM          file that was dropped on this bat ----
set "SRC="
if /i "%~1"=="e" set "SRC=%~2"
if /i "%~1"=="d" set "SRC=%~2"
if "%SRC%"=="" if not "%~1"=="" set "SRC=%~1"
set "DST=%~3"
REM A file is already known (command line / drag): go straight on, only ask when
REM it is not. Do NOT check again later - a plain Enter means "the one named in
REM config.json", and re-checking would trap the user in that question forever.
if "%SRC%"=="" goto :needfile
goto :havefile
:needfile
echo.
call node scripts\bat-msg.mjs userlist-crypt.ask-file
set /p SRC="> "
:havefile
REM A dragged/pasted path may come with quotes - strip them (the script strips
REM them too)
set "SRC=%SRC:"=%"
set "DST=%DST:"=%"

REM The direction label is Chinese, so it comes from bat-msg into a variable.
if "%MODE%"=="2" (
    for /f "delims=" %%d in ('node scripts\bat-msg.mjs userlist-crypt.dir-decrypt') do set "DIRN=%%d"
) else (
    for /f "delims=" %%d in ('node scripts\bat-msg.mjs userlist-crypt.dir-encrypt') do set "DIRN=%%d"
)
set "FLAG="
if "%MODE%"=="2" set "FLAG=--decrypt"
if "%SRC%"=="" (
    for /f "delims=" %%s in ('node scripts\bat-msg.mjs userlist-crypt.file-from-config') do set "SRCSHOW=%%s"
) else (
    set "SRCSHOW=%SRC%"
)

echo.
call node scripts\bat-msg.mjs userlist-crypt.header2 "%DIRN%" "%SRCSHOW%"
if not "%DST%"=="" call node scripts\bat-msg.mjs userlist-crypt.header-dst "%DST%"
echo ============================================

REM ---- 3. preview first (dry run, writes nothing) ----
echo.
call node scripts\bat-msg.mjs userlist-crypt.step-preview
echo.
node scripts\encrypt-userlist.mjs %FLAG% --dry-run "%SRC%" "%DST%"
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs userlist-crypt.err-preview
    goto :end
)

REM ---- 4. write after confirmation (the target is backed up when it exists) ----
REM     Trap: set /p and the %CONFIRM% check must not sit in the same block
REM     (variables expand at parse time).
echo.
call node scripts\bat-msg.mjs userlist-crypt.ask-apply
set /p CONFIRM=
if /i not "%CONFIRM%"=="Y" (
    echo.
    call node scripts\bat-msg.mjs userlist-crypt.cancelled
    goto :end
)

echo.
call node scripts\bat-msg.mjs userlist-crypt.step-apply
echo.
node scripts\encrypt-userlist.mjs %FLAG% "%SRC%" "%DST%"
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs userlist-crypt.err-apply
    goto :end
)

echo.
call node scripts\bat-msg.mjs userlist-crypt.done

:end
echo.
pause
endlocal
