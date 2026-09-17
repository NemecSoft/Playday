@echo off&color 1f
set "tl=王国重生-网吧联机版"
title %tl%
mode con: lines=25 cols=100
echo.=================================＝=================================================================
echo.0、单人玩-单机游戏
echo.1、联机玩-主机：多人游戏→创建→生成世界→准备→开始游戏。
echo.2、联机玩-客机：多人游戏→选择房间加入→生成世界→准备。
echo.====================================================================================================
"X:\YunGame\Tools\nircmd\nircmdc.exe" win center ititle %tl%
call update_config.bat >nul 2>&1
echo.游戏运行中...
"KingdomsReborn.exe"