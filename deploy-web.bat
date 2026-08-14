chcp 65001
@echo off
REM ============================================================
REM  Playday 一键部署为网站
REM  1) 构建前端（vite build → dist/）
REM  2) 启动 Node 网站后端（复用 release/data 数据）
REM  访问 http://localhost:8080
REM  说明：网站版能看游戏库/详情/封面/登录，不支持启动游戏。
REM ============================================================
setlocal
cd /d "%~dp0"

echo [1/2] 构建前端...
call npm run build
if errorlevel 1 (
    echo [错误] 前端构建失败
    exit /b 1
)

REM 先清理旧的 8080 占用进程，避免 EADDRINUSE。
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique"') do (
    echo   [清理] 端口 8080 被进程 %%i 占用，正在停止...
    powershell -NoProfile -Command "Stop-Process -Id %%i -Force -ErrorAction SilentlyContinue"
)
timeout /t 1 /nobreak >nul

echo [2/2] 启动网站后端...
echo 访问 http://localhost:8080
node server/server.mjs

endlocal
