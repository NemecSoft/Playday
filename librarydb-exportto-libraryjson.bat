@echo off
chcp 65001 >nul
title Playday - 权威库 导出成 整库JSON（Admin\library.db → 整库 JSON 目录\*.json）
REM ============================================================
REM  **双击壳**：只做四件事 —— 切到仓库根 → 调 PowerShell → 把退出码带出去 → pause。
REM  真正的逻辑在 scripts\librarydb-exportto-libraryjson.ps1。
REM
REM  为什么这么分（见 docs\PROJECT-MEMORY.md 硬约定 §三.14）：cmd 的解析层（重定向、括号块、
REM  ^ 转义、% 展开、chcp 之后的英文报错）坑一个接一个，踩中的代价是"**静默产生垃圾文件 +
REM  误导性报错**"。所以：**逻辑一律写 .ps1，bat 只当壳**，而且壳里不许出现裸的尖括号（要写就转义）。
REM
REM  用法：双击 = 导出（只读库，但会覆盖 JSON）；命令行可加参数（见下一行）
REM  参数原样透传给 ps1：--force / --tables users / --dir / --db
REM ============================================================
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\librarydb-exportto-libraryjson.ps1" %*
set "RC=%errorlevel%"
echo.
pause
endlocal & exit /b %RC%
