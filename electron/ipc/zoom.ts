// Ctrl+滚轮整页缩放（等价浏览器的 Ctrl+滚轮）。
// 渲染进程是沙箱拿不到 webFrame，所以拦到 Ctrl 滚轮后发 IPC 过来，
// 直接调"发送方"webContents 的 zoomLevel —— Chromium 原生缩放，
// 和网页里 Ctrl+滚轮行为一致（含模糊放大的整页 layout 缩放）。
//
// 注意必须用原生 ipcMain.handle（而不是 registerCommand 包装）：
// 需要拿到 event.sender 来缩放"发起调用的那个窗口"。
import { ipcMain } from "electron";

// 浏览器 Ctrl+滚轮一档 ≈ zoomLevel ±0.5（zoomLevel = ln(zoomFactor)）。
// 范围 clamp 到 22% ~ 550%，与浏览器缩放上下限接近。
const STEP = 0.5;
const MIN_LEVEL = -1.5;
const MAX_LEVEL = 1.7;

export function registerZoomIpc(): void {
  ipcMain.handle("zoom_page", (event, args: unknown) => {
    const wc = event.sender;
    // 两种传法：
    //   { delta: 0.5 }   相对调整（滚轮/加减按钮）
    //   { level: 0 }     绝对设置（重置 = level 0 = 100%）
    let next: number;
    if (args && typeof args === "object" && "level" in args) {
      const lv = Number((args as { level: unknown }).level) || 0;
      next = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, lv));
    } else {
      const raw =
        args && typeof args === "object" && "delta" in args
          ? (args as { delta: unknown }).delta
          : args;
      const d = typeof raw === "number" ? raw : Number(raw) || 0;
      next = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, wc.getZoomLevel() + d));
    }
    wc.setZoomLevel(next);
    return wc.getZoomLevel();
  });
}
