chcp 65001
@echo off
REM ============================================================
REM  Playday 网站版一键测试
REM  1) 检查数据目录（由 path-modes.json 的 dev 段决定）是否存在
REM  2) 构建前端（vite build → dist/）
REM  3) 启动网站后端服务器（node server/server.mjs）
REM  4) 自动打开浏览器 http://localhost:8080
REM  关闭窗口 = 停止服务器
REM ============================================================
setlocal
cd /d "%~dp0"

echo ============================================
echo  Playday 网站版测试
echo ============================================

REM ---- 1. 检查数据 ----
REM 数据目录由规则表决定（data-dir.bat 从 path-modes.json 的 dev 段取），别写死。
call "%~dp0data-dir.bat"
if errorlevel 1 (
    echo [错误] 取不到开发态数据目录，已中止。
    pause
    exit /b 1
)
node scripts\data-dir.mjs --exists
if errorlevel 1 (
    echo [警告] 数据不完整（缺权威库或运行时副本）：%YUNGAME_DATA_DIR%
    echo         请确认桌面版数据正常（config.json 的 libraryDir / sourceLibraryDir）。
    choice /C YN /M "继续？"
    if errorlevel 2 exit /b 1
) else (
    echo [1/3] 数据目录 OK：%YUNGAME_DATA_DIR%
)

REM ---- 2. 构建前端 ----
echo [2/3] 构建前端...
call npm run build
if errorlevel 1 (
    echo [错误] 前端构建失败。
    pause
    exit /b 1
)

REM ---- 3. 清理旧服务器（如果 8080 被占用）----
echo [3/4] 检查 8080 端口...
REM 用 PowerShell 按端口精确找到占用进程并停掉（不误杀其它 node 进程）。
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique"') do (
    echo   [清理] 端口 8080 被进程 %%i 占用，正在停止...
    powershell -NoProfile -Command "Stop-Process -Id %%i -Force -ErrorAction SilentlyContinue"
)
timeout /t 1 /nobreak >nul

REM ---- 4. 启动服务器 + 打开浏览器 ----
echo [4/4] 启动网站后端，打开浏览器...
start "" http://localhost:8080
node server/server.mjs

echo.
echo 服务器已停止。
endlocal
