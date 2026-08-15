// 公告相关 IPC 命令（Task 8）。移植自原 Rust 的 commands/announcement.rs。
// 公告就是一个放在应用根目录 announcements/announcement.html 的网页文件，
// 没有就返回默认的"暂无公告"页。

import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { announcementFile, announcementsDir } from "../core/paths";
import { registerCommand } from "./registry";

// 当没有公告文件时，给前端一个简洁的默认页（带一点样式，中文友好）。
const DEFAULT_ANNOUNCEMENT = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>公告</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f1115;color:#e6e8eb;
       display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .box{text-align:center;color:#8a919c;font-size:16px}
</style>
</head>
<body><div class="box">暂无公告</div></body>
</html>`;

export function registerAnnouncementIpc(ipc: typeof ipcMain) {
  // 返回公告 HTML 全文。文件不存在返回默认页。
  registerCommand(ipc, "get_announcement", async () => {
    const file = announcementFile();
    if (fs.existsSync(file)) {
      try {
        return fs.readFileSync(file, "utf-8");
      } catch {
        return DEFAULT_ANNOUNCEMENT;
      }
    }
    return DEFAULT_ANNOUNCEMENT;
  });

  // 返回公告目录信息（是否可写、最后修改时间等），供设置页展示。
  registerCommand(ipc, "get_announcement_info", async () => {
    const dir = announcementsDir();
    const file = announcementFile();
    let modifiedAt: number | null = null;
    try {
      modifiedAt = fs.statSync(file).mtimeMs;
    } catch {
      modifiedAt = null;
    }
    return {
      dir,
      file,
      exists: fs.existsSync(file),
      modifiedAt,
      directoryExists: fs.existsSync(dir),
    };
  });
}
