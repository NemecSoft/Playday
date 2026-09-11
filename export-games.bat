@echo off
chcp 65001 >nul
title Playday - 导出数据库为 games.json
cd /d "%~dp0"

echo ==============================================
echo   release\data\Admin\library.db -^> games.json
echo ==============================================
echo.

if not exist "release\data\Admin\library.db" (
  echo [错误] 找不到权威库 release\data\Admin\library.db
  goto :end
)

node _export-games-json.mjs
if errorlevel 1 (
  echo.
  echo [失败] 导出未完成，原 games.json 未被改动
  goto :end
)

echo.
echo [完成] 已导出为项目根目录 games.json（coverImage 置空，
echo         developer/genre/tags/series 等均为名称数组）。

:end
echo.
pause
