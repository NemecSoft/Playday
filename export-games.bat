@echo off
chcp 65001 >nul
title Playday - 导出数据库为 games.json
cd /d "%~dp0"

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
