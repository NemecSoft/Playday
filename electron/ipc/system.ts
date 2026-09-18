// 系统命令：窗口控制、通知、应用信息、托盘联动（Task 9）。
// 移植自原 Rust 的 commands/system.rs。窗口相关操作直接作用于当前聚焦的窗口
// （管理端操作管理端窗口、客户端操作客户端窗口），或通过 getClientWindow 取主窗口。

import { ipcMain, BrowserWindow, dialog } from "electron";
import { APP_NAME, APP_VERSION } from "../config";
import { configRoot, appRoot } from "../core/paths";
import { readSettings } from "../core/settings";
import { getClientWindow, enterSystem } from "../main";
import { resolveMaintenanceState, resolveLibraryAgeState } from "../core/auth";
import { registerCommand } from "./registry";

// 取"发起命令的窗口"；没有则回退到主客户端窗口。
function targetWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) return win;
  return getClientWindow();
}

// 应用信息（对齐 AppInfo）。
function currentAppInfo() {
  return {
    appName: APP_NAME,
    version: APP_VERSION,
    os: process.platform,
    arch: process.arch,
    dataDir: configRoot(),
    // config.json 现在跟主程序走（<主程序目录>/config.json），不再等于数据目录。
    // 之前这里两行都写 configRoot()，界面上显示的"配置目录"是错的。
    configDir: appRoot(),
  };
}

export function registerSystemIpc(ipc: typeof ipcMain) {
  // 服务器维护状态：公告窗口一启动就问一次，决定"能不能进系统"。
  // 规则见 docs/design/user-level-detection.md（Status=0 = 该等级维护中）。
  registerCommand(ipc, "get_server_status", async () => {
    const m = await resolveMaintenanceState();
    return {
      maintenance: m.maintenance,
      status: m.status,
      level: m.level,
      filePath: m.filePath,
      fileExists: m.fileExists,
      recordCount: m.recordCount,
      parseError: m.parseError,
    };
  });

  // 库"年龄"：公告窗口启动时问一次，决定"能不能进系统"。
  // 规则：权威库文件超过 30 天没变化 → outdated（见 shared/libraryAge.ts）。
  registerCommand(ipc, "get_library_age", async () => {
    const age = resolveLibraryAgeState();
    return {
      outdated: age.outdated,
      ageDays: age.ageDays,
      mtimeMs: age.mtimeMs,
      filePath: age.filePath,
      fileExists: age.fileExists,
    };
  });

  // "进入系统"：公告窗口点按钮后，先打开数据库，再关闭公告窗口并创建主窗口。
  // await enterSystem()：等数据库就绪后再返回，主窗口渲染时数据一定可用。
  // ⚠️ 两道拦截都在这里再判一次（前端也会查，但那只是为了早点提示 ——
  //    不能只靠前端拦：改前端就能绕过，必须由主进程说了算）：
  //     ① 服务器维护中；② 游戏库超过 30 天没更新（系统过旧）。
  registerCommand(ipc, "enter_system", async () => {
    const m = await resolveMaintenanceState();
    if (m.maintenance) {
      return { ok: false, reason: "maintenance", level: m.level, status: m.status };
    }
    const age = resolveLibraryAgeState();
    if (age.outdated) {
      return { ok: false, reason: "outdated", ageDays: age.ageDays, filePath: age.filePath };
    }
    await enterSystem();
    return { ok: true };
  });

  // 应用信息。
  registerCommand(ipc, "get_app_info", async () => {
    return currentAppInfo();
  });

  // 产品名（build.config.ts 的 APP_NAME）—— 给 preload 用的**同步**取值通道。
  // 为什么必须存在这一条：preload 跑在 Electron 沙箱里，**不能 require 相对路径模块**
  // （实测 2026-09-15：`module not found: ./sibling.js`），所以它没法 import
  // build.config。改之前 preload 里内联了一份常量，于是 build.config.ts 那句
  // "改这一处，UI 文案会全部同步更新"是句空话 —— 那边漏改就静默不一致
  // （窗口标题变了、徽标没变，谁也发现不了）。sendSync 实测可用，故走这条。
  // 写法必须是 ipc.on + event.returnValue（sendSync 的配套写法）；handle 是异步的，配不上。
  ipc.on("get_app_name", (e) => {
    e.returnValue = APP_NAME;
  });

  // 文件/目录选择对话框（管理端"浏览"按钮用）。
  // 入参：{ mode: "file"|"directory", title?, defaultPath?, filters? }。
  // 返回选中的路径字符串；用户取消返回 null。
  ipc.handle(
    "open_dialog",
    async (
      _e,
      a: string | { mode: string; title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }
    ) => {
      const opts = typeof a === "string" ? { mode: a } : a ?? {};
      const win = BrowserWindow.getFocusedWindow() ?? undefined;
      const props: Array<"openFile" | "openDirectory"> =
        opts.mode === "directory" ? ["openDirectory"] : ["openFile"];
      const dialogOpts: Electron.OpenDialogOptions = {
        title: opts.title,
        defaultPath: opts.defaultPath,
        properties: props,
        filters:
          opts.mode === "directory"
            ? undefined
            : (opts.filters as Electron.FileFilter[]) ?? undefined,
      };
      // showOpenDialog 有两种重载：有 window 时带 window，没有则只传 options。
      const result = win ? await dialog.showOpenDialog(win, dialogOpts) : await dialog.showOpenDialog(dialogOpts);
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    }
  );

  // 最小化窗口：若启用了托盘且"最小化到托盘"开关打开，就隐藏到托盘而不是
  // 最小化到任务栏（类似 QQ/迅雷的常驻行为）。否则照常最小化。
  ipc.handle("minimize_window", async (e) => {
    const settings = readSettings();
    const win = targetWindow(e);
    if (!win) return true;
    if (settings.enableTray && settings.minimizeToTray) {
      win.hide();
    } else {
      win.minimize();
    }
    return true;
  });

  // 最大化/还原，返回新的最大化状态。
  ipc.handle("maximize_window", async (e) => {
    const win = targetWindow(e);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });

  // 是否已最大化。
  ipc.handle("is_maximized", async (e) => {
    return targetWindow(e)?.isMaximized() ?? false;
  });

  // 是否全屏。
  ipc.handle("is_fullscreen", async (e) => {
    return targetWindow(e)?.isFullScreen() ?? false;
  });

  // 切换全屏，返回新的全屏状态。
  ipc.handle("toggle_fullscreen", async (e) => {
    const win = targetWindow(e);
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  // 关闭窗口：设置了"关闭到托盘"就隐藏，否则真正退出。
  ipc.handle("close_window", async (e) => {
    const settings = readSettings();
    const win = targetWindow(e);
    if (settings.closeToTray && win) {
      win.hide();
    } else {
      const { app } = await import("electron");
      app.quit();
    }
    return true;
  });

  // 隐藏到托盘。
  ipc.handle("hide_window", async (e) => {
    targetWindow(e)?.hide();
    return true;
  });

  // 显示并聚焦主窗口（托盘菜单"显示 XX"调用）。
  ipc.handle("show_window", async (e) => {
    const win = getClientWindow();
    if (win) {
      win.show();
      win.focus();
    }
    return true;
  });

  // 发系统通知：先把事件推给所有窗口的渲染进程（前端自行决定怎么展示）。
  // 入参兼容两种风格：直接传两个字符串 (title, body)，或 Tauri 风格的包装对象 { title, body }。
  // 早期只接 spread 风格会与前端的对象包装错位，导致 ToastContainer 拿到错误的
  // payload、把对象当 React child 渲染 → "Objects are not valid as a React child" 崩页。
  // 发系统通知：先把事件推给所有窗口的渲染进程（前端自行决定怎么展示）。
  // 参数兼容对象包装 { title, body }（前端用）和 spread 传 (title, body)。
  registerCommand(
    ipc,
    "show_notification",
    async (args: { title?: string; body?: string }) => {
      const title = args?.title ?? "";
      const body = args?.body ?? "";
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send("notification", { title, body });
      }
      return true;
    }
  );

  // 退出应用。
  registerCommand(ipc, "quit", async () => {
    const { app } = await import("electron");
    app.quit();
    return true;
  });
}
