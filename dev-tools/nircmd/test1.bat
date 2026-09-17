@echo off&color 1f&title 牧场模拟器-网吧联机版
mode con: lines=25 cols=94
@echo.===================极简教程=================================================================
@echo.1、主机：新游戏或者载入游戏，按ESC，点击菜单标签页，邀请好友，对着Steam图标的客机点击邀请。
@echo.2、客机：右上角接受邀请。
@echo.============================================================================================
"X:\YunGame\Tools\nircmd\center.bat" "牧场模拟器-网吧联机版" >nul 2>&1
pause
call update_config.bat >nul 2>&1
pause
@echo 游戏运行中...
"Ranch_Simulator.exe"
@echo 游戏退出中...
exit