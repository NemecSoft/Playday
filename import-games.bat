@echo off
chcp 65001 >nul
title Playday - games.json 一键回写数据库
cd /d "%~dp0"

echo ==============================================
echo   games.json -^> release\data\Admin\library.db
echo ==============================================
echo.

if not exist games.json (
  echo [错误] 项目根目录找不到 games.json
  goto :end
)

if not exist "release\data\Admin\library.db" (
  echo [错误] 找不到权威库 release\data\Admin\library.db
  goto :end
)

node scripts\migrate-playnite\playday-db.mjs import --in games.json --db release\data\Admin\library.db
if errorlevel 1 (
  echo.
  echo [失败] 回写未完成（工具在改动前已自动备份为 library.db.json-bak，数据库未被破坏）
  goto :end
)

if exist "release\data\library\library.db" (
  copy /y "release\data\Admin\library.db" "release\data\library\library.db" >nul
  echo 已同步运行时库 release\data\library\library.db
)

echo.
echo [完成] games.json 已按 id 全量更新到数据库（改字段按名更新，新游戏插入；
echo         数据库里存在但 JSON 里没有的游戏保持原样不动）。

:end
echo.
pause
