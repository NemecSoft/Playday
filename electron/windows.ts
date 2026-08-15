// 窗口工厂：统一创建客户端窗口和管理端窗口。
// 两个窗口共用同一份 preload 和渲染代码（通过 ?window=admin 区分渲染的是哪个界面）。

import { BrowserWindow, nativeImage } from "electron";
import * as fs from "fs";
import * as path from "path";
import { APP_NAME, ADMIN_EXE_NAME } from "./config";
import { readSettings } from "./core/settings";

// 给窗口动态设置应用图标。
// Windows 上只靠 BrowserWindow 的 icon 选项有时不生效（任务栏图标会显示 Electron
// 默认的），用 win.setIcon() 才是可靠做法，能同时更新窗口标题栏和任务栏图标。
// 找不到图标就跳过（保持默认，不崩）。
function applyWindowIcon(win: BrowserWindow): void {
  const p = appIconPath();
  if (!p) return;
  try {
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) win.setIcon(img);
  } catch {
    /* ignore */
  }
}

// 按用户的"启动行为"设置处理窗口的初始状态（最大化/最小化/隐藏到托盘/正常）。
// 在窗口还没显示出来前就调用，这样首帧就是正确状态，不会先闪一下默认大小再跳变。
function applyStartupBehavior(win: BrowserWindow): void {
  const behavior = readSettings().startupBehavior;
  switch (behavior) {
    case "StartMaximized":
      win.maximize(); // 默认最大化
      break;
    case "StartMinimized":
      win.minimize(); // 启动最小化到任务栏
      break;
    case "StartMinimizedTray":
      win.hide(); // 启动直接隐藏到托盘（需要托盘已启用，否则看不到）
      break;
    default:
      // StartNormal：保持默认普通窗口，啥都不做
      break;
  }
}

// 开发态：有 VITE_DEV_SERVER_URL 环境变量时走 Vite 开发服务器；否则加载打包后的页面。
// 客户端用主 Vite（5173），管理端用 admin Vite（1421）。
const devUrl = process.env.VITE_DEV_SERVER_URL;
const adminDevUrl = process.env.VITE_ADMIN_DEV_SERVER_URL;

// 找一个可用的应用图标（窗口/任务栏用）。
// 跟托盘图标同一个来源：dev 用 public/icons/icon.png，打包用 resources/icon.png。
// 找不到就返回 undefined，让 Electron 用默认图标（不崩）。
function appIconPath(): string | undefined {
  const candidates = [
    // dev 模式：主进程在 dist-electron/electron/core/，上三级到工程根再进 public。
    path.join(__dirname, "..", "..", "..", "public", "icons", "icon.png"),
    path.join(__dirname, "..", "..", "..", "public", "icon.png"),
    path.join(process.resourcesPath || "", "icon.png"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

// 创建客户端窗口（主界面）。
// 无边框（frame: false）：前端的 TopBar 自带拖动和最小化/最大化/关闭按钮，
// 这里彻底去掉 Electron 自带的菜单栏、原生标题栏和窗口外框，让 UI 完全自定义。
export function createClientWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: APP_NAME,
    frame: false,
    icon: appIconPath(), // 窗口/任务栏图标，不用 Electron 默认图标
    backgroundColor: "#0d1117", // 没加载页面时的兜底深色，避免白屏闪一下
    autoHideMenuBar: true, // 多一份保险：万一没 frame 也把菜单条藏掉
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 强制隐藏应用菜单（File/Edit/View/Window/Help 这条），dev 和 release 都需要
  win.setMenuBarVisibility(false);
  // Windows 上必须 setIcon 才能真正把任务栏图标换成 Playday 的（而不是 Electron 默认）
  applyWindowIcon(win);
  loadRenderer(win, "client");
  // 按用户的启动行为设置窗口初始状态（默认最大化/最小化/隐藏到托盘）
  applyStartupBehavior(win);
  return win;
}

// 创建公告窗口（启动必经的引导窗口，类似微信的登录界面）。
// 特点：固定尺寸、居中、无边框、不可缩放。里面显示公告 + "进入系统"按钮，
// 点了按钮后主进程会创建主窗口并关闭本窗口（传统桌面应用的 Splash/引导模式）。
//
// 采用"真·异形（透明抠图）"样式：transparent:true 让窗口背景完全透明，
// 前端用一个四周透明、带圆角/装饰突起的 CSS 异形面板 + 看板娘立绘组成窗口，
// 透明像素会透出桌面，窗口形状随面板轮廓走（类似 QQ/宠物窗）。
// 注意：透明窗口不能带系统阴影（会变黑块），且透明区域无法用 app-region 拖动，
// 所以拖动只能靠面板不透明的顶部/边框区域（前端用 drag / no-drag 控制）。
export function createAnnouncementWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 700,
    height: 560,
    title: APP_NAME,
    frame: false,
    transparent: true, // 关键：窗口背景透明，四周露出桌面形成异形
    backgroundColor: "#00000000", // 完全透明，避免闪白/闪黑
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    icon: appIconPath(),
    autoHideMenuBar: true,
    hasShadow: false, // 透明窗口别开系统阴影，否则透明区域会出现黑块
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  applyWindowIcon(win);
  loadRenderer(win, "announcement");
  return win;
}

// 创建管理端窗口（独立窗口，标题用可配置的管理端名）。
// 管理端保持原生窗口（带标题栏 + 最大/最小/关闭按钮），与客户端（无边框）刻意区分。
export function createAdminWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    title: `Playday Admin`,
    icon: appIconPath(), // 管理端窗口也用同一个应用图标
    backgroundColor: "#f7f8fa",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  // DWM（窗口管理器）层面设置图标，确保任务栏与开始菜单正确显示。
  applyWindowIcon(win);
  loadRenderer(win, "admin");
  return win;
}

// 根据开发/生产态加载渲染页面，并通过 query 参数告诉渲染进程是哪个窗口。
// 管理端（windowName === "admin"）加载独立的 dist-admin 前端；其它加载客户端 dist。
function loadRenderer(win: BrowserWindow, windowName: string): void {
  const isAdmin = windowName === "admin";
  if (isAdmin) {
    // 管理端：dev 用 admin Vite（1421），否则加载打包产物 dist-admin/index.html
    if (adminDevUrl) {
      win.loadURL(`${adminDevUrl}?window=admin`);
    } else {
      win.loadFile(path.join(__dirname, "..", "..", "dist-admin", "index.html"), {
        query: { window: "admin" },
      });
    }
  } else if (devUrl) {
    win.loadURL(`${devUrl}?window=${windowName}`);
  } else {
    // 主进程编译产物在 dist-electron/electron/，vite 渲染产物在工程根 dist/，
    // 所以从 __dirname 回退两级到工程根，再进 dist/index.html。
    win.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"), {
      query: { window: windowName },
    });
  }

  // 联调辅助：设置 RENDER_LOG=1 时，把渲染进程的 console 和报错转发到主进程 stdout，
  // 便于无头环境或无界面调试时看到前端 JS 错误。
  if (process.env.RENDER_LOG === "1") {
    const wc = win.webContents;
    wc.on("console-message", (_e, level, message, line, sourceId) => {
      console.log(`[render:${windowName}:${level}] ${message} (${sourceId}:${line})`);
    });
    wc.on("render-process-gone", (_e, details) => {
      console.error(`[render:${windowName}] 渲染进程崩溃: ${details.reason}`);
    });
    wc.on("did-fail-load", (_e, code, desc, url) => {
      console.error(`[render:${windowName}] 加载失败 ${code}: ${desc} ${url}`);
    });
  }
}
