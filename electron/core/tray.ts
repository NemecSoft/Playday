// 系统托盘（Task 9）。移植自原 Tauri 的托盘逻辑。
// 应用最小化到托盘时，托盘图标右键菜单提供"显示窗口"和"退出"。
// 图标：开发态用项目内 public/ 或 node_modules 里 electron 自带的图标；
// 若无现成图标则用 Electron 内置默认图标，保证不因缺文件而崩。

import { Tray, Menu, nativeImage, app, BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";
import { APP_NAME } from "../config";
// 应用图标按等级取（黄金 1.ico / 钻石 2.ico，2026-09-16 需求）—— 见 core/appIcon.ts
import { currentLevelIconPath, registerTrayIconUpdater } from "./appIcon";

let tray: Tray | null = null;

// 找一个可用的托盘图标。
// **首选当前等级的应用图标**（黄金 1.ico / 钻石 2.ico）—— 2026-09-16 需求变更："图标按等级分"，
// 托盘与窗口/任务栏用**同一份文件**（都在 dev-tools/yungamestart/assets/ 下，随包发到 resources/）。
// 为什么以前专门有 tray.png/tray.ico：那时托盘显示空白，因为当时代用的 icon.png 是 256x256
// 的细线暗色 logo（96.5% 透明），缩到 16x16 基本看不见。现在 1.ico/2.ico 自带 16/24/32/48 帧
// （由 make-icons.mjs 生成），"尺寸不够"这件事已经解决；tray.* 保留为**兜底**
// （等级图标万一没随包发出来，托盘至少还有个图标，不会空）。
// 找不到再退回其他候选，最后兜底空图（不崩）。
function loadTrayIcon(): Electron.NativeImage {
  const tierIcon = currentLevelIconPath();
  const candidates = [
    ...(tierIcon ? [tierIcon] : []),
    // dev 模式：主进程在 dist-electron/electron/core/，__dirname 是 core 目录。
    // 上三级才到工程根（core→electron→dist-electron→工程根），再进 public/icons。
    // 之前用了上两级（到 dist-electron/），导致 dev 一直找不到图标、fallback 空图。
    path.join(__dirname, "..", "..", "..", "public", "icons", "tray.ico"),
    path.join(__dirname, "..", "..", "..", "public", "icons", "tray.png"),
    path.join(__dirname, "..", "..", "..", "public", "icons", "icon.ico"),
    path.join(__dirname, "..", "..", "..", "public", "icons", "icon.png"),
    path.join(__dirname, "..", "..", "..", "public", "icon.png"),
    // 打包模式：electron-builder 会把 resources 目录带进 app
    path.join(process.resourcesPath || "", "tray.ico"),
    path.join(process.resourcesPath || "", "tray.png"),
    path.join(process.resourcesPath || "", "icon.ico"),
    path.join(process.resourcesPath || "", "icon.png"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          // ⚠️ .ico **不要 resize**（2026-09-16 实测）：Electron 的 nativeImage 读 .ico 时
          // **只取最大那一帧**（四个 ico 都量到 256x256，多尺寸被压平），所以递给 shell 的
          // 就是一张 256 —— 由 Windows 按当前 DPI 自己缩到 16/20/24/32。
          // 我们主动 resize 到 16 反而更差：125%/150% 缩放下系统要把 16 放大，一定糊。
          if (p.toLowerCase().endsWith(".ico")) return img;
          // PNG：已经是 16x16 就不用 resize；若是大图则压到托盘标准大小
          const s = img.getSize();
          if (s.width > 16 || s.height > 16) return img.resize({ width: 16, height: 16 });
          return img;
        }
      }
    } catch {
      /* ignore */
    }
  }
  // 兜底：用 Electron 自带的应用图标（不崩就行）。
  return nativeImage.createEmpty();
}

// 创建托盘并挂上菜单。
export function createTray(): void {
  if (tray) return; // 已建过，避免重复
  tray = new Tray(loadTrayIcon());
  // 把"往托盘上画图标"的入口注册给 appIcon.ts：等级是开机后异步判出来的，
  // 判出来之后它那边会调 refreshAppIcons() → 这里换图（见 core/appIcon.ts 的说明）。
  registerTrayIconUpdater((img) => {
    try {
      tray?.setImage(img);
    } catch {
      /* ignore */
    }
  });
  tray.setToolTip(APP_NAME);
  const menu = Menu.buildFromTemplate([
    {
      // 文案是"显示 XX"而不是"打开 XX"（2026-09-18 用户要求）：这一步做的就是
      // 把**已经存在**的主窗口 show + focus —— "显示"才说得准确，
      // "打开"会让人以为是要重新拉起一个窗口。
      label: `显示${APP_NAME}`,
      click: () => {
        // 让渲染进程帮忙把主窗口显示并聚焦。
        for (const win of BrowserWindow.getAllWindows()) {
          win.show();
          win.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  // 单击托盘图标也显示窗口（Windows 常见行为）。
  tray.on("click", () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.show();
      win.focus();
    }
  });
}

// 销毁托盘（退出前）。
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
