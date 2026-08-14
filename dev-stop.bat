@echo off
REM ============================================================
REM  Playday 开发模式停止脚本
REM  结束后台的 Vite 开发服务器窗口（标题 Playday Vite）。
REM ============================================================
echo [dev] 正在停止 Vite 开发服务器...
taskkill /fi "WINDOWTITLE eq Playday Vite*" /f >nul 2>&1
echo [dev] 已发送停止信号。若仍有残留，可在任务管理器中手动结束。
