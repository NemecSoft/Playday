@echo off
setlocal
chcp 65001 >nul
title Playnite → Playday 数据迁移

echo ============================================================
echo   Playnite → Playday 数据迁移工具
echo   可反复运行（幂等）：按游戏名匹配，保留 Playday 特有字段
echo   写库前自动备份目标库为 library.db.migrate-bak
echo ============================================================
echo.

REM 切到 Playday 项目根目录（本文件位于 scripts\migrate-playnite\ 下）
cd /d "%~dp0..\.."

REM 透传参数，例如:
REM   migrate-playnite.bat --playnite D:\YunGame\PlayNite
REM   migrate-playnite.bat --data release\data
REM   migrate-playnite.bat --db D:\path\to\library.db
node scripts\migrate-playnite\migrate-playnite.mjs %*

if errorlevel 1 (
    echo.
    echo [失败] 迁移未完成，请查看上方错误信息。
    echo.
    pause
    exit /b 1
)

echo.
echo [完成] 迁移成功。若需回滚，可用迁移前的备份 library.db.migrate-bak 覆盖目标库。
echo.
pause
