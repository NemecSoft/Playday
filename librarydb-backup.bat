@echo off
chcp 65001 >nul
title Playday - 备份权威库（Admin\library.db → library.db.bak-＜时间戳＞）
REM ============================================================
REM  **双击壳**：只做四件事 —— 切到仓库根 → 调 PowerShell → 把退出码带出去 → pause。
REM  真正的逻辑在 scripts\librarydb-backup.ps1。
REM
REM  为什么这么分（见 docs\PROJECT-MEMORY.md 硬约定 §三.14）：cmd 的解析层（重定向、括号块、
REM  ^ 转义、% 展开、chcp 之后的英文报错）坑一个接一个，踩中的代价是"**静默产生垃圾文件 +
REM  误导性报错**"。所以：**逻辑一律写 .ps1，bat 只当壳**，而且壳里不许出现裸的尖括号（要写就转义）。
REM
REM  什么时候用：手改 整库 JSON 目录\*.json 之前想留个点；或要跑别的会动库的脚本之前。
REM  单纯回写（libraryjson-importto-librarydb.bat）不需要先跑这个 —— 它写库前会自动备份。
REM ============================================================
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\librarydb-backup.ps1" %*
set "RC=%errorlevel%"
echo.
pause
endlocal & exit /b %RC%
