@echo off
chcp 65001 >nul
title Playday - games.json 一键回写数据库
cd /d "%~dp0"

REM 权威库 / 运行时副本路径由规则表决定（path-modes.json 的 dev 段，见 data-dir.bat）。
call "%~dp0data-dir.bat"
if errorlevel 1 goto :end

echo ==============================================
echo   games.json -^> %PLAYDAY_ADMIN_DB%
echo ==============================================
echo.

if not exist games.json (
  echo [错误] 项目根目录找不到 games.json
  goto :end
)

if not exist "%PLAYDAY_ADMIN_DB%" (
  echo [错误] 找不到权威库 %PLAYDAY_ADMIN_DB%
  goto :end
)

node scripts\migrate-playnite\playday-db.mjs import --in games.json --db "%PLAYDAY_ADMIN_DB%"
if errorlevel 1 (
  echo.
  echo [失败] 回写未完成（工具在改动前已自动备份为 library.db.json-bak，数据库未被破坏）
  goto :end
)

if exist "%PLAYDAY_RUNTIME_DB%" (
  copy /y "%PLAYDAY_ADMIN_DB%" "%PLAYDAY_RUNTIME_DB%" >nul
  echo 已同步运行时库 %PLAYDAY_RUNTIME_DB%
)

echo.
echo [完成] games.json 已按 id 全量更新到数据库（改字段按名更新，新游戏插入；
echo         数据库里存在但 JSON 里没有的游戏保持原样不动）。

:end
echo.
pause
