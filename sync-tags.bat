@echo off
chcp 65001 >nul
REM ============================================================
REM  Playday (YunGame) 标签同步脚本（从临时权威 json 更新到权威数据库）
REM  来源：D:\AI\games-web\games_tags.json  （临时权威源）
REM  目标：%PLAYDAY_ADMIN_DB%    （权威数据库）
REM
REM  适用：你反复核查、修改 json 里的 tag 后，一键同步到数据库。
REM  每次真改前会生成带时间戳的 .bak 备份，可随时回退。
REM ============================================================
setlocal

REM ---- 0. 切到工程根目录 ----
cd /d "%~dp0"

REM ---- 1. 用 proto 管理的 Node 22（找不到就用系统 node），与 dev-client.bat 一致 ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [sync] 使用 Node 22.23.2 (proto)
) else (
    echo [sync] 未找到 proto Node 22，使用系统默认 node
)

REM ---- 1.5 数据目录（由 path-modes.json 的 dev 段决定，见 data-dir.bat）----
REM       放在 node 就绪之后：取路径本身要调 node。
call "%~dp0data-dir.bat"
if errorlevel 1 exit /b 1

echo ============================================
echo  Playday 标签同步
echo  JSON : D:\AI\games-web\games_tags.json
echo  权威库: %PLAYDAY_ADMIN_DB%
echo ============================================

REM ---- 2. 先跑 dry-run，只看汇总，不改库 ----
echo.
echo [sync] 第 1 步：预览（DRY-RUN，不改库）
echo.
node scripts\sync-tags-from-json.mjs
if errorlevel 1 (
    echo.
    echo [sync] 预览失败，请检查上面的错误。同步终止。
    exit /b 1
)

REM ---- 3. 询问是否真正应用 ----
echo.
set /p CONFIRM="是否真正同步到数据库？(输入 Y 回车确认，其他键取消): "
if /i not "%CONFIRM%"=="Y" (
    echo.
    echo [sync] 已取消，未改动数据库。
    exit /b 0
)

REM ---- 4. 真正应用（会自动做时间戳备份）----
echo.
echo [sync] 第 2 步：真正同步到权威库（会生成时间戳 .bak 备份）...
echo.
node scripts\sync-tags-from-json.mjs --apply
if errorlevel 1 (
    echo.
    echo [sync] 同步失败，请检查上面的错误。
    exit /b 1
)

echo.
echo [sync] 同步完成 ✅  旧库已备份到 %PLAYDAY_ADMIN_DB%.bak-<时间戳>
echo        如需回退，把对应 .bak 复制回 library.db 覆盖即可。
echo.
echo [sync] 提示：客户端下次启动会自动从权威库复制到运行时副本 library\library.db。
endlocal
