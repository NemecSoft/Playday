@echo off
chcp 65001 >nul
title Playday - 整库JSON 回写进 权威库（data\library\*.json → Admin\library.db）
REM ============================================================
REM  **双击壳**：只做四件事 —— 切到仓库根 → 调 PowerShell → 把退出码带出去 → pause。
REM  真正的逻辑在 scripts\libraryjson-importto-librarydb.ps1。
REM
REM  为什么这么分（见 docs\PROJECT-MEMORY.md 硬约定 §三.14）：cmd 的解析层（重定向、括号块、
REM  ^ 转义、% 展开、chcp 之后的英文报错）坑一个接一个，踩中的代价是"**静默产生垃圾文件 +
REM  误导性报错**"（§三.13 那 4 个垃圾文件就是证据）。所以：**逻辑一律写 .ps1，bat 只当壳**，
REM  而且壳里不许出现裸的尖括号（要写就转义）。
REM
REM  用法：双击 = 先预览、按 Y 才写；命令行 = libraryjson-importto-librarydb.bat --yes
REM  参数：--yes 跳过确认；其余原样透传给 ps1（--merge / --force / --add-columns / --dir / --db）
REM ============================================================
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\libraryjson-importto-librarydb.ps1" %*
set "RC=%errorlevel%"
echo.
pause
endlocal & exit /b %RC%
