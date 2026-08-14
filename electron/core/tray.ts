// 系统托盘（Task 9）。移植自原 Tauri 的托盘逻辑。
// 应用最小化到托盘时，托盘图标右键菜单提供"显示窗口"和"退出"。
// 图标：开发态用项目内 public/ 或 node_modules 里 electron 自带的图标；
// 若无现成图标则用 Electron 内置默认图标，保证不因缺文件而崩。

import { Tray, Menu, nativeImage, app, BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";
import { APP_NAME } from "../config";

let tray: Tray | null = null;

// 找一个可用的托盘图标。
// 关键：原本的 public/icons/icon.png 是 256x256 的细线暗色 logo（96.5% 透明、
// 主体是暗色），缩到 Windows 托盘(16x16) 后几乎看不见，所以显示空白。
// 因此专门生成一个 16x16 的高对比托盘图标 public/icons/tray.png
// （主题蓝色实心圆角方块 + 白色播放三角），托盘上清晰可见，优先用它。
// 找不到再退回其他候选，最后兜底空图（不崩）。
function loadTrayIcon(): Electron.NativeImage {
  const candidates = [
    // dev 模式：主进程在 dist-electron/electron/core/，__dirname 是 core 目录。
    // 上三级才到工程根（core→electron→dist-electron→工程根），再进 public/icons。
    // 之前用了上两级（到 dist-electron/），导致 dev 一直找不到图标、fallback 空图。
    path.join(__dirname, "..", "..", "..", "public", "icons", "tray.png"),
    path.join(__dirname, "..", "..", "..", "public", "icons", "icon.png"),
    path.join(__dirname, "..", "..", "..", "public", "icon.png"),
    // 打包模式：electron-builder 会把 resources 目录带进 app
    path.join(process.resourcesPath || "", "tray.png"),
    path.join(process.resourcesPath || "", "icon.png"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) {
          // 已经是 16x16 就不用 resize；若是大图则压到托盘标准大小
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
  tray.setToolTip(APP_NAME);
  const menu = Menu.buildFromTemplate([
    {
      label: `打开 ${APP_NAME}`,
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
