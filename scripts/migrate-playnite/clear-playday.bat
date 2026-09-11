@echo off
setlocal
chcp 65001 >nul
title 一键清空 Playday 目标库（games 表）

echo ============================================================
echo   一键清空 Playday 目标库 games 表
echo   备份到 library.db.reset-bak，清空后其他表保留
echo   注意：清空后需重新运行迁移工具导入
echo ============================================================
echo.
set /p confirm=确定清空游戏库吗？输入 yes 继续:
if /i not "%confirm%"=="yes" (
    echo 已取消。
    pause
    exit /b 0
)

cd /d "%~dp0..\.."
node scripts\migrate-playnite\migrate-playnite.mjs --reset %*

if errorlevel 1 (
    echo.
    echo [失败] 清空未完成，请查看上方错误信息。
    pause
    exit /b 1
)

echo.
echo [完成] 目标库 games 表已清空。
echo 接着运行 migrate-playnite.bat 从 Playnite 导入即可。
pause
