chcp 65001
@echo off
REM ============================================================
REM  Playday 管理端一键打包脚本
REM  功能：1) 编译管理端前端（npm run build:admin）
REM        2) electron-builder --dir 打包到 release\admin\win-unpacked
REM        3) 把 win-unpacked 同步到 release\admin 根（独立目录，不覆盖客户端）
REM  结果：release\admin\Playday.Admin.exe 独立管理端
REM  说明：管理端与客户端共用同一份主进程代码（dist-electron），
REM       前端加载独立的 dist-admin（管理端 UI）。
REM       管理端靠 exe 文件名判断，双击即走管理端模式。
REM ============================================================
setlocal

REM ---- 0. 切到工程根 ----
cd /d "%~dp0"

REM ---- 1. 用 proto 管理的 Node 22 ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [package] 使用 Node 22.23.2 (proto)
) else (
    echo [package] 未找到 proto Node 22，使用系统默认 node
)

echo ============================================
echo  Playday 管理端打包
echo  目标: release\admin\Playday.Admin.exe
echo ============================================

REM ---- 2. 编译管理端前端 + 主进程 ----
echo [1/4] 编译主进程（供管理端复用）...
call npx tsc -p tsconfig.main.json
if errorlevel 1 (
    echo [错误] 主进程编译失败，中止打包。
    exit /b 1
)
echo [1/4] 编译管理端前端...
call npm run build:admin
if errorlevel 1 (
    echo [错误] 管理端编译失败，中止打包。
    exit /b 1
)

REM ---- 3. electron-builder 打包到 release\admin\win-unpacked ----
echo [2/4] electron-builder 打包管理端（免安装目录）...
call node_modules\.bin\electron-builder.cmd --dir --config electron-builder.admin.yml
if errorlevel 1 (
    echo [错误] electron-builder 打包失败，中止。
    exit /b 1
)

REM ---- 4. 同步到 release\admin 根 ----
echo [3/4] 同步产物到 release\admin（不覆盖客户端）...
robocopy "release\admin\win-unpacked" "release\admin" /E /NJH /NJS /NDL /NP /R:1 /W:1 >nul
if errorlevel 8 (
    echo [错误] 同步失败（robocopy 返回 %errorlevel%），请检查。
    exit /b 1
)

REM ---- 5. 清掉空的 win-unpacked ----
echo [4/4] 清理临时目录 win-unpacked...
if exist "release\admin\win-unpacked" (
    rmdir /s /q "release\admin\win-unpacked"
)

echo.
echo ============================================
echo  管理端打包完成 ✅
echo  可执行文件: release\admin\Playday.Admin.exe
echo ============================================
endlocal
