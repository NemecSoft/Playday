@echo off
chcp 65001 >nul
title Playday - 导出数据库为 games.json（给存档工具 GameSaveHelper 用）
cd /d "%~dp0"

REM ============================================================
REM  这是**给 dev-tools/GameSaveHelper（存档备份工具）的数据出口**，不是数据管理工具：
REM    管理数据请用  npm run db:export / db:import  （或双击 libraryjson-importto-librarydb.bat）
REM    这条链的另一半（import-games.bat 把 games.json 写回库）已于 2026-09-16 退役。
REM  ⚠️ 输出格式（camelCase 字段 + tab 缩进）是 GameSaveHelper 的 C++ 按精确文本锚点
REM     解析的接口，不能改 —— 见 _export-games-json.mjs 头部说明。
REM ============================================================

REM 权威库路径由规则表决定（path-modes.json 的 dev 段，见 data-dir.bat）。
call "%~dp0data-dir.bat"
if errorlevel 1 goto :end

echo ==============================================
echo   %PLAYDAY_ADMIN_DB% -^> games.json
echo ==============================================
echo.

if not exist "%PLAYDAY_ADMIN_DB%" (
  echo [错误] 找不到权威库 %PLAYDAY_ADMIN_DB%
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
