// 整个应用的主入口：负责创建窗口、注册 IPC、挂系统托盘。
// 名字统一从 electron/config.ts 拿，不在本文件硬编码。
import { app, BrowserWindow, Menu } from "electron";
import * as path from "path";
import { registerIpc } from "./ipc/register";
import { openDb, closeDb } from "./core/db";
import { readSettings } from "./core/settings";
import { stopGameServer } from "./core/gameServer";
import { createTray, destroyTray } from "./core/tray";
import { registerErrorCollector } from "./core/errorCollector";
import {
  createClientWindow,
  createAnnouncementWindow,
  createCrashHandlerWindow,
  setCrashReport,
} from "./windows";

// 说明：管理端应用已移除（数据由手工维护的 games.json + 脚本写入源库）。
// 现在只有客户端一种运行形态，不再有 --admin / Playday.Admin.exe 分支。

// 全局保存窗口引用，避免被垃圾回收。
let clientWin: BrowserWindow | null = null;
let announcementWin: BrowserWindow | null = null;

app.whenReady().then(async () => {
  // 去掉 Electron 自带的顶部应用菜单（File/Edit/View/Window/Help）。
  // 窗口已用 frame:false 去掉了原生标题栏和外框，这里再用 setApplicationMenu
  // 把剩下的菜单条彻底清掉，让 UI 完全由前端 TopBar 自定义。
  Menu.setApplicationMenu(null);

  // 注册所有主进程 ←→ 渲染进程 的命令。
  registerIpc();

  // 错误收集器：主进程崩溃/未捕获异常/渲染进程崩溃时，弹崩溃处理窗口（UnityCrashHandler64 风格）。
  registerErrorCollector((report) => {
    try {
      setCrashReport(report);
      createCrashHandlerWindow();
    } catch (e) {
      console.error("[main] 创建崩溃处理窗口失败:", e);
    }
  });

  // 按设置决定是否启用系统托盘。
  // 注：游戏详情页本地 HTTP 服务器不再在这里启动，改为"第一次打开详情页时"
  // 由 get_game_server_url 惰性启动（见 ipc/gameHtml.ts），缩短应用启动时间。
  if (readSettings().enableTray) {
    try {
      createTray();
    } catch (e) {
      console.error("[main] 创建托盘失败:", e);
    }
  }

  // 先弹公告窗口（独立引导窗口）。数据库打开是重活（整库复制 + 读入内存），
  // 推迟到点"进入系统"时再执行（见 enterSystem），让公告窗口第一时间出现，启动更快。
  announcementWin = createAnnouncementWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      clientWin = createClientWindow();
    }
  });
});

// "进入系统"：公告窗口点按钮后回调到主进程，关闭公告窗口、创建主窗口。
// 供 system.ts 的 IPC 调用，避免循环依赖。
// 这里是打开数据库的时机：把整库复制 + 读入内存这类重活从"应用启动"推迟到
// "用户点击进入系统"时，让公告窗口能第一时间弹出来。
export async function enterSystem(): Promise<void> {
  // 先打开数据库（sql.js 是异步初始化，幂等：已打开则直接复用）。
  // 只有 db 就绪后才创建主窗口，避免主窗口里访问数据时库还没就绪。
  await openDb();
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
