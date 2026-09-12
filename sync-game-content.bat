@echo off
chcp 65001 >nul
title Playday - 游戏内容同步（简介 / 地区 / 标签）
REM ============================================================
REM  Playday 游戏内容同步：data\game-content.json → 数据库
REM
REM  来源：data\game-content.json   （人工维护的内容源：每个游戏的简介/地区/标签）
REM  目标：release\data\Admin\library.db     （权威库）
REM        release\data\library\library.db   （运行时副本，客户端启动时也会自动复制）
REM
REM  这个批处理做什么：把你在 json 里写的内容同步进数据库，改完双击即可。
REM  安全措施：先预览（不动库）→ 按 Y 才写 → 写前自动备份两份库（.bak-<时间戳>）。
REM  写完重启 Playday 就能在界面上看到。
REM
REM  字段写法（详见 docs\design\game-content.md）：
REM    简介 intro  ：一句话，<=48 字
REM    地区 region ：单个直写 "国产"；多个用 # 连 "国产#日本"；没有写 ""
REM    标签 tags   ：用 # 分隔，如 "#休闲#生存#卡通#烧脑"；没有写 ""
REM    （地区/标签的 # 写法由脚本自动转成库里需要的数组格式，你不用管库格式）
REM
REM  默认就会写：简介（长短都写）、地区、标签、社区评分、**权限等级 game_level**
REM              （gamelevel = 玩这个游戏需要的权限等级：1 = 黄金版，2 = 钻石版。
REM                它是黄金/钻石门禁的判据，所以必须进库）
REM  可选：只想先写短的那批简介：sync-game-content.bat --short-only
REM        跳过"按 Y 确认"：    sync-game-content.bat --yes
REM          （--yes 是给自动化/批处理调用用的；双击使用请留着确认更安全）
REM ============================================================
setlocal

REM ---- 0. 切到工程根目录（脚本所在目录）----
cd /d "%~dp0"

REM ---- 1. 可选参数透传（--short-only / --with-level），并摘出 --yes、挡掉误传的 --apply ----
REM     为什么要挡掉 --apply：第 5 步的"预览"必须是真的 dry-run，否则预览就把库改了。
set "EXTRA=%*"
set "EXTRA=%EXTRA:--apply=%"
set "YES="
if not "%EXTRA%"=="%EXTRA:--yes=%" set "YES=1"
set "EXTRA=%EXTRA:--yes=%"

REM ---- 2. 用 proto 管理的 Node 22（找不到就用系统 node），与 dev-client.bat 一致 ----
set "NODE22=C:\Users\Administrator\.proto\tools\node\22.23.2"
if exist "%NODE22%\node.exe" (
    set "PATH=%NODE22%;%PATH%"
    echo [content] 使用 Node 22.23.2 (proto)
) else (
    echo [content] 未找到 proto Node 22，使用系统默认 node
)

echo ============================================
echo  Playday 游戏内容同步
echo  内容文件: data\game-content.json
echo  权威库  : release\data\Admin\library.db
echo ============================================

REM ---- 3. 前置检查：文件都在 ----
if not exist "data\game-content.json" (
    echo.
    echo [错误] 找不到 data\game-content.json
    echo        这是人工维护的内容源文件（简介/地区/标签），不该被删除或挪出仓库。
    echo        需要重建时运行：node scripts\gen-game-content.mjs
    goto :end
)
if not exist "release\data\Admin\library.db" (
    echo.
    echo [错误] 找不到权威库 release\data\Admin\library.db
    echo        请确认程序数据目录正常（见 config.json 的 libraryDir / sourceLibraryDir）。
    goto :end
)

REM ---- 4. 程序在跑就提醒一句（运行中它读的是启动时复制的运行时副本）----
tasklist /fi "imagename eq Playday.exe" 2>nul | find /i "Playday.exe" >nul
if not errorlevel 1 (
    echo.
    echo [提示] 检测到 Playday 正在运行。同步会改写两份库，
    echo        建议先关掉程序，写完再启动，免得它仍显示旧数据。
)

REM ---- 5. 第 1 步：预览（DRY-RUN，不改库）----
echo.
echo [content] 第 1 步：预览（DRY-RUN，不改库）
echo.
node scripts\apply-game-content-to-db.mjs %EXTRA%
if errorlevel 1 (
    echo.
    echo [content] 预览失败，请把上面的报错发出来。同步终止，数据库未改动。
    goto :end
)

REM ---- 6. 第 2 步：确认后真正写入（自动备份）----
REM     坑：set /p 和随后对 %CONFIRM% 的判断**不能**塞进同一对括号里 ——
REM     括号块在解析阶段就展开变量，%CONFIRM% 会取到空值，导致永远走"取消"分支。
REM     所以这里用 goto 分流，而不是 if ( ... ) 包起来。
if defined YES goto :dowrite
echo.
set /p CONFIRM="按 Y 回车写入数据库（会自动备份两份库）；其他键取消: "
if /i not "%CONFIRM%"=="Y" (
    echo.
    echo [content] 已取消，数据库未改动。
    goto :end
)

:dowrite
echo.
echo [content] 第 2 步：写入数据库（备份 + 写入）...
echo.
node scripts\apply-game-content-to-db.mjs --apply %EXTRA%
if errorlevel 1 (
    echo.
    echo [content] 写入失败。改动前的库已备份为 library.db.bak-^(时间戳^)，可随时回退。
    goto :end
)

echo.
echo [content] 完成
echo         回退方法：把 release\data\Admin\library.db.bak-^(时间戳^) 复制回 library.db 覆盖即可。
echo.
echo [content] 现在启动（或重启）Playday，就能在界面上看到新的简介 / 地区 / 标签。

:end
echo.
pause
endlocal
