@echo off
chcp 65001 >nul
REM ============================================================================
REM  push-to-git.bat - initialise / commit / push this tool to GitHub.
REM  ASCII-ONLY: Chinese for the user AND the commit message come from
REM  scripts\bat-msg.mjs (a Chinese string in here would break cmd's parsing).
REM ============================================================================

cd /d "%~dp0"
call "%~dp0..\..\scripts\bat-msg.mjs" title.gsh-push-git

set "REPO_URL=https://github.com/NemecSoft/GameSaveHelper.git"

call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.header "%REPO_URL%"
echo.

REM ---------- 1. init the repo (skip when it already is one) ----------
if not exist ".git" (
    call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.step-init
    git init
    if errorlevel 1 goto :fail
) else (
    call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.skip-init
)

REM ---------- 2. stage everything (.gitignore keeps build output out) ----------
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.step-add
git add -A
if errorlevel 1 goto :fail

REM ---------- 3. commit (only when something is staged, so re-running is safe) ----------
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.step-commit
git diff --cached --quiet
if errorlevel 1 (
    for /f "delims=" %%m in ('call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.commit-msg "%date%" "%time%"') do set "MSG=%%m"
    git commit -m "%MSG%"
    if errorlevel 1 goto :fail
) else (
    call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.nothing
)

REM ---------- 4. branch main + remote ----------
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.step-remote
git branch -M main 2>nul
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    git remote add origin "%REPO_URL%"
    if errorlevel 1 goto :fail
) else (
    git remote set-url origin "%REPO_URL%"
)

REM ---------- 5. push ----------
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.step-push
git push -u origin main
if errorlevel 1 goto :fail

echo.
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.done "%REPO_URL%"
pause
exit /b 0

:fail
echo.
call "%~dp0..\..\scripts\bat-msg.mjs" gsh-push.err
pause
exit /b 1
