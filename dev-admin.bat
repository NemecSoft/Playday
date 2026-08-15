chcp 65001
@echo off
REM ============================================================
REM  Playday (YunGame) 管理端开发模式启动脚本
REM  用独立的管理端 Vite（端口 1421）热更新 admin/ 前端，
REM  通过 VITE_ADMIN_DEV_SERVER_URL 让主进程加载 dist-admin 的 dev server。
REM ============================================================
setlocal

cd /d "%~dp0"

set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [dev] 使用 Node 22.23.2 (proto)
) else (
    echo [dev] 未找到 proto Node 22，使用系统默认 node
)

set "YUNGAME_DATA_DIR=%~dp0release\data"
set "VITE_ADMIN_DEV_SERVER_URL=http://localhost:1421"
REM set "ELECTRON_DISABLE_GPU=1"

echo ============================================
echo  Playday 管理端开发模式
echo  数据目录: %YUNGAME_DATA_DIR%
echo  管理端Vite: http://localhost:1421
echo ============================================

REM 启动管理端 Vite（端口 1421）
echo [dev] 启动管理端 Vite 开发服务器...
start "Playday Admin Vite" /min cmd /c "cd /d %~dp0 && node node_modules\vite\bin\vite.js --config vite.admin.config.ts"

echo [dev] 等待 Vite 就绪...
set /a tries=0
:waitvite
set /a tries+=1
if %tries% gtr 30 (
    echo [dev] 警告: Vite 未就绪，仍尝试启动 Electron
    goto runelectron
)
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:1421' -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false }" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto waitvite
)
echo [dev] Vite 已就绪。

:runelectron
REM 管理端：加 --admin（或 exe 名是 Playday.Admin 时自动走管理端）
echo [dev] 启动 Electron（管理端）...
call node_modules\.bin\electron.cmd . --admin 2>dev-admin-err.log

echo.
echo [dev] 管理端已退出。Vite 仍在后台，用 dev-stop.bat 停止。
endlocal
