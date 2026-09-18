@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday - one-click push.
REM  Checks the data dir's library / announcements for changes and, when there
REM  are any, adds + commits + pushes to GitHub.
REM    (the data dir comes from path-modes.json, "dev" section - see data-dir.bat)
REM  Usage: double-click push.bat
REM  Needs: repo already git init'ed, remote pointing at NemecSoft/Playday.
REM
REM  ASCII-ONLY: Chinese for the user AND the commit message are printed by
REM  scripts\bat-msg.mjs. See the note in deploy.bat for the reason (cmd cuts
REM  multi-byte lines, and a Chinese string in here would break the parse).
REM ============================================================
setlocal
cd /d "%~dp0"
call node scripts\bat-msg.mjs title.push

REM The data dir's path relative to the repo (that is what git status shows) -
REM decided by the rule table, never hard-coded.
call "%~dp0data-dir.bat"
if errorlevel 1 exit /b 1

call node scripts\bat-msg.mjs push.header

REM ---- 1. make sure there is a remote ----
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    call node scripts\bat-msg.mjs push.err-noremote
    pause
    exit /b 1
)

REM ---- 2. any uncommitted changes? ----
REM When the data lives outside the repo (custom data root) git cannot see it -
REM then this run only does the push.
if not defined PLAYDAY_DATA_REL (
    call node scripts\bat-msg.mjs push.info-data-outside "%YUNGAME_DATA_DIR%"
    goto PUSH_CHECK
)

git add -A
git status --porcelain | findstr /R /C:"%PLAYDAY_DATA_REL%" >nul 2>&1
set changed=%errorlevel%

if not "%changed%"=="0" (
    echo.
    call node scripts\bat-msg.mjs push.info-nothing
    goto PUSH_CHECK
)

echo.
call node scripts\bat-msg.mjs push.step-commit
echo ------------------------------------------------------------
git status --porcelain | findstr /R /C:"%PLAYDAY_DATA_REL%"
echo ------------------------------------------------------------

REM Build the commit message from the current date/time. The Chinese text comes
REM from bat-msg (a string in this file would break the parse).
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set _d=%%a-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set _t=%%a%%b
for /f "delims=" %%m in ('node scripts\bat-msg.mjs push.commit-msg %_d% %_t%') do set "MSG=%%m"

git commit -m "%MSG%"
if errorlevel 1 (
    call node scripts\bat-msg.mjs push.err-commit
    pause
    exit /b 1
)

:PUSH_CHECK
echo.
call node scripts\bat-msg.mjs push.step-push
git push origin master
if errorlevel 1 (
    echo.
    call node scripts\bat-msg.mjs push.err-push
    pause
    exit /b 1
)

echo.
call node scripts\bat-msg.mjs push.done
endlocal
