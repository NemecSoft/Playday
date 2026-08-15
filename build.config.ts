// 全工程的"命名配置中心"。
// 产品名、客户端 exe 名、管理端 exe 名都只能在这里定义，
// 其它任何代码都从这里 import，禁止在别处硬编码名字。
// 改这一处，窗口标题、托盘、UI 文案、打包出的 exe 名会全部同步更新。

// 产品展示名（显示在窗口标题、托盘 tooltip、UI 文案里）。
// 用户可能要求改成 HaHaGame、heiheigame 等，直接改这里即可。
export const APP_NAME = "YunGame";

// 客户端可执行文件名（不含 .exe 后缀）。
// 用户可能要求改成 Playday.DesktopApp 等。
export const CLIENT_EXE_NAME = "Playnite.DesktopApp";

// 管理端可执行文件名（不含 .exe 后缀）。
// 独立的管理端程序，打开管理界面（用户/游戏/游戏库管理）。
export const ADMIN_EXE_NAME = "Playday.Admin";
