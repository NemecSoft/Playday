chcp 65001
@echo off
REM ============================================================
REM  Playday 一键推送脚本
REM  作用：检测数据目录的 library / announcements 是否有更新，
REM       有则自动 add + commit + push 到 GitHub。
REM       （数据目录来自 path-modes.json 的 dev 段，见 data-dir.bat）
REM  用法：双击 push.bat
REM  前置：仓库已 git init，remote 已指向 NemecSoft/Playday
REM ============================================================
setlocal
cd /d "%~dp0"

REM 数据目录相对仓库的路径（git status 里显示的就是它）——由规则表决定，别写死。
call "%~dp0data-dir.bat"
if errorlevel 1 exit /b 1

echo ============================================
echo  Playday 推送脚本
echo ============================================

REM ---- 1. 确认 remote ----
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [错误] 尚未配置 remote，请先执行：
    echo   git remote add origin https://github.com/NemecSoft/Playday.git
    pause
    exit /b 1
)

REM ---- 2. 检查是否有未提交的变更 ----
REM 数据在仓库外（自定义数据根）时，git 里看不到它 —— 那本次就只做"推送"。
if not defined PLAYDAY_DATA_REL (
    echo [提示] 开发态数据不在仓库内（%YUNGAME_DATA_DIR%），跳过数据变更检查。
    goto PUSH_CHECK
)

git add -A
git status --porcelain | findstr /R /C:"%PLAYDAY_DATA_REL%" >nul 2>&1
set changed=%errorlevel%

if not "%changed%"=="0" (
    echo.
    echo [提示] 当前没有新的数据变更，无需提交。
    echo         （若改了代码想提交，请手动 git add + commit）
    goto PUSH_CHECK
)

echo.
echo [1/2] 检测到数据目录有更新，正在提交...
echo ------------------------------------------------------------
git status --porcelain | findstr /R /C:"%PLAYDAY_DATA_REL%"
echo ------------------------------------------------------------

REM 获取当前时间做提交信息
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set _d=%%a-%%b-%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set _t=%%a%%b

git commit -m "更新数据（%_d% %_t%）：library / announcements / config.json"
if errorlevel 1 (
    echo [错误] 提交失败。
    pause
    exit /b 1
)

:PUSH_CHECK
echo.
echo [2/2] 推送远程...
git push origin master
if errorlevel 1 (
    echo.
    echo [错误] 推送失败。可能原因：
    echo   - 网络不通 / 需要登录 GitHub
    echo   - 远程仓库有冲突，先 git pull 再推
    pause
    exit /b 1
)

echo.
echo 推送完成 ✓
endlocal
