chcp 65001
@echo off
REM ============================================================
REM  Playday 一键打包脚本
REM  功能：1) 编译主进程 + 渲染进程（npm run build）
REM        2) electron-builder --dir 打包到 release\win-unpacked
REM        3) 把 win-unpacked 里的 exe/资源同步到 release 根（保留 data）
REM        4) 清掉空的 win-unpacked
REM  结果：release\Playnite.DesktopApp.exe + release\data 直接能跑
REM  注意：data 目录（游戏库/封面）不会被动，放心重复打包
REM ============================================================
setlocal

REM ---- 0. 切到工程根（脚本所在目录）----
cd /d "%~dp0"

REM ---- 1. 用 proto 管理的 Node 22（找不到就用系统 node）----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [package] 使用 Node 22.23.2 (proto)
) else (
    echo [package] 未找到 proto Node 22，使用系统默认 node
)

echo ============================================
echo  Playday 一键打包
echo  目标: release\Playnite.DesktopApp.exe
echo ============================================

REM ---- 2. 编译主进程 + 渲染进程 ----
echo [1/4] 编译主进程 + 渲染进程...
call npm run build
if errorlevel 1 (
    echo [错误] 编译失败，中止打包。
    exit /b 1
)

REM ---- 3. electron-builder 打包到 release\win-unpacked ----
echo [2/4] electron-builder 打包（免安装目录）...
call node_modules\.bin\electron-builder.cmd --dir --config electron-builder.yml
if errorlevel 1 (
    echo [错误] electron-builder 打包失败，中止。
    exit /b 1
)

REM ---- 4. 把 win-unpacked 同步到 release 根（保留 data）----
echo [3/4] 同步产物到 release 根（保留 data）...
robocopy "release\win-unpacked" "release" /E /NJH /NJS /NDL /NP /R:1 /W:1 >nul
if errorlevel 8 (
    echo [错误] 同步失败（robocopy 返回 %errorlevel%），请检查。
    exit /b 1
)

REM ---- 5. 清掉空的 win-unpacked ----
echo [4/4] 清理临时目录 win-unpacked...
if exist "release\win-unpacked" (
    rmdir /s /q "release\win-unpacked"
)

echo.
echo ============================================
echo  打包完成 ✅
echo  可执行文件: release\Playnite.DesktopApp.exe
echo  （data 目录原样保留，未被改动）
echo ============================================
endlocal
