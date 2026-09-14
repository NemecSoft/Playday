// 全工程的"命名配置中心"。
// 产品名、客户端 exe 名都只能在这里定义，
// 其它任何代码都从这里 import，禁止在别处硬编码名字。
// 改这一处，窗口标题、托盘、UI 文案、打包出的 exe 名会全部同步更新。
// 说明：管理端应用已移除（数据由手工维护的 games.json + 脚本写入源库），
// 因此不再有 ADMIN_EXE_NAME。

// 产品展示名（显示在窗口标题、托盘 tooltip、UI 文案里）。
// 用户可能要求改成 HaHaGame、heiheigame 等，直接改这里即可。
export const APP_NAME = "YunGame";

// 客户端可执行文件名（不含 .exe 后缀）。
// 现名 PlayniteUI：与 YunGameStart（开机自启、建桌面快捷方式）里的 LauncherFile 一致。
// ⚠️ 改这里必须同步这几处（bat / C++ 读不到 TS，只能各自写死）：
//    · electron-builder.yml 的 win.executableName
//    · package.bat / build-*.bat 的提示文案
//    · sync-game-content.bat 的进程名判断（`tasklist /fi "imagename eq …"`）
//      —— 2026-09-14 发现漏的正是这一处：它还写着旧名 Playday.exe，
//      "检测到程序在运行"的提醒永远不会触发（静默失效）。
//    · tools/yungamestart 里的 LauncherFile（C++ 侧）
export const CLIENT_EXE_NAME = "PlayniteUI";
