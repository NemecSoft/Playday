// 整个应用的主入口：负责创建窗口、注册 IPC、挂系统托盘。
// 名字统一从 electron/config.ts 拿，不在本文件硬编码。
import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import { registerIpc } from "./ipc/register";
import { openDb, closeDb } from "./core/db";
import { readSettings } from "./core/settings";
import { gamesHtmlDir } from "./core/paths";
import { startGameServer, stopGameServer } from "./core/gameServer";
import { createTray, destroyTray } from "./core/tray";
import { ADMIN_EXE_NAME } from "./config";
import {
  createClientWindow,
  createAdminWindow,
  createAnnouncementWindow,
} from "./windows";

// 通过命令行参数决定启动哪个窗口：`--admin` 打开管理端，否则打开客户端。
// 也支持按"当前运行的 exe 文件名"判断：如果是 Playday.Admin.exe 就按管理端启动，
// 这样打包出的独立管理端 exe 无需手动加 --admin 参数。
const exeName = (() => {
  try {
    return path.basename(process.execPath, ".exe").toLowerCase();
  } catch {
    return "";
  }
})();
const shouldOpenAdmin =
  process.argv.includes("--admin") ||
  (!!exeName && exeName === ADMIN_EXE_NAME.toLowerCase());

// 全局保存窗口引用，避免被垃圾回收。
let clientWin: BrowserWindow | null = null;
let adminWin: BrowserWindow | null = null;
let announcementWin: BrowserWindow | null = null;

app.whenReady().then(async () => {
  // 去掉 Electron 自带的顶部应用菜单（File/Edit/View/Window/Help）。
  // 窗口已用 frame:false 去掉了原生标题栏和外框，这里再用 setApplicationMenu
  // 把剩下的菜单条彻底清掉，让 UI 完全由前端 TopBar 自定义。
  Menu.setApplicationMenu(null);

  // 先打开数据库（sql.js 是异步初始化），再创建窗口，避免在窗口里访问数据时库还没就绪。
  await openDb();

  // 注册所有主进程 ←→ 渲染进程 的命令。
  registerIpc();

  // 客户端才启动详情页服务器和托盘；管理端（独立 Playday.Admin.exe）不需要。
  if (!shouldOpenAdmin) {
    // 启动游戏详情页本地 HTTP 服务器（托管 Game_Details/ 目录，端口随机）。
    try {
      await startGameServer(gamesHtmlDir());
    } catch (e) {
      console.error("[main] 启动游戏详情页服务器失败:", e);
    }

    // 按设置决定是否启用系统托盘。
    if (readSettings().enableTray) {
      try {
        createTray();
      } catch (e) {
        console.error("[main] 创建托盘失败:", e);
      }
    }
  }

  if (shouldOpenAdmin) {
    // 管理端：直接打开管理窗口，不经过公告。
    adminWin = createAdminWindow();
  } else {
    // 客户端：先弹公告窗口（独立引导窗口），点"进入系统"后才创建主窗口。
    announcementWin = createAnnouncementWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      clientWin = createClientWindow();
    }
  });
});

// "进入系统"：公告窗口点按钮后回调到主进程，关闭公告窗口、创建主窗口。
// 供 system.ts 的 IPC 调用，避免循环依赖。
export function enterSystem(): void {
  // 关闭公告窗口
  if (announcementWin) {
    announcementWin.close();
    announcementWin = null;
  }
  // 创建主窗口（如果还没创建）
  if (!clientWin || clientWin.isDestroyed()) {
    clientWin = createClientWindow();
  }
}

// 窗口全关时的行为：若启用了托盘，则进程常驻（托盘可唤回窗口）；否则退出。
app.on("window-all-closed", () => {
  const trayEnabled = readSettings().enableTray;
  if (process.platform !== "darwin" && !trayEnabled) {
    app.quit();
  }
});

// 退出前清理：数据库落盘、关闭详情页服务器、销毁托盘，避免数据丢失或端口/资源占用。
app.on("before-quit", () => {
  closeDb();
  stopGameServer();
  destroyTray();
});

// 导出窗口引用，供系统命令（system.ts）控制窗口时使用。
export function getClientWindow(): BrowserWindow | null {
  return clientWin;
}
export function getAdminWindow(): BrowserWindow | null {
  return adminWin;
}
