chcp 65001
@echo off
REM ============================================================
REM  Playday (YunGame) 客户端开发模式启动脚本
REM  功能：1) 后台启动 Vite 开发服务器(5173)
REM        2) 用 Electron 加载开发服务器（带 ?window=client）
REM  前置：已执行 npm install；本机有显示器（否则窗口看不到）
REM ============================================================
setlocal

REM ---- 0. 切到工程根目录（脚本所在目录）----
cd /d "%~dp0"

REM ---- 1. 用 proto 管理的 Node 22（找不到就用系统 node）----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [dev] 使用 Node 22.23.2 (proto)
) else (
    echo [dev] 未找到 proto Node 22，使用系统默认 node
)

REM ---- 2. 关键环境变量 ----
REM 数据目录：开发态直接指向 release/data，和打包版共享同一份游戏库 + 封面。
REM 这样 1271 个真实游戏 + 1248 张封面在 dev/release 两个模式都能看到，且不会两边各跑出一份。
REM （早期 dev 用工程根 data，用户已经把封面图迁去 release 了，工程根只剩个孤儿老库）
set "YUNGAME_DATA_DIR=%~dp0release\data"
REM 让主进程走 Vite 开发服务器
set "VITE_DEV_SERVER_URL=http://localhost:5173"
REM 无头服务器若没有显示器，可取消下一行注释（禁 GPU 加速，避免报错）
REM set "ELECTRON_DISABLE_GPU=1"

echo ============================================
echo  Playday 客户端开发模式
echo  数据目录: %YUNGAME_DATA_DIR%
echo  Vite     : http://localhost:5173
echo ============================================

REM ---- 3. 启动 Vite 开发服务器（后台）----
echo [dev] 启动 Vite 开发服务器...
start "Playday Vite" /min cmd /c "cd /d %~dp0 && node node_modules\vite\bin\vite.js --port 5173 --strictPort"

REM ---- 4. 编译主进程（必须在 Electron 之前完成）----
REM 为什么要有这一步：本脚本最后只是 `call electron .`，跑的是 dist-electron/ 里的
REM **编译产物**。以前改了 electron/** 或 shared/** 不重新编译，dev 里跑的还是旧代码，
REM 而且毫无提示（踩过：改了路径解析/封面匹配，重启后以为生效了、其实没有）。
REM 放在 Vite 启动之后：编译与 Vite 启动并行，总等待 ≈ max(编译时间, Vite 就绪时间)。
echo [dev] 编译主进程 (tsc -p tsconfig.main.json)...
call node_modules\.bin\tsc.cmd -p tsconfig.main.json > dev-client-build.log 2>&1
if errorlevel 1 (
    echo.
    echo [dev] ***********************************************************
    echo [dev]  主进程编译失败，已中止启动（避免拿旧代码跑出假象）
    echo [dev]  错误详情：dev-client-build.log
    echo [dev] ***********************************************************
    type dev-client-build.log
    pause
    exit /b 1
)
echo [dev] 主进程编译完成。

REM ---- 5. 等待 Vite 就绪（最多 30 秒）----
echo [dev] 等待 Vite 就绪...
set /a tries=0
:waitvite
set /a tries+=1
if %tries% gtr 30 (
    echo [dev] 警告: Vite 未在预期时间内就绪，仍尝试启动 Electron
    goto runelectron
)
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:5173' -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false }" >nul 2>&1
if errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto waitvite
)
echo [dev] Vite 已就绪。

:runelectron
REM ---- 6. 启动 Electron（加载 5173）----
echo [dev] 启动 Electron...
call node_modules\.bin\electron.cmd . 2>dev-client-err.log

REM ---- 6. 退出前提示 ----
echo.
echo [dev] Electron 已退出。Vite 开发服务器仍在后台运行。
echo       如需停止，可在任务管理器结束 "Playday Vite" 窗口，或运行 dev-stop.bat。
endlocal
