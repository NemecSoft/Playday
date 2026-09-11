// 游戏"应用存档"（Apply Save）相关 IPC 命令。
//
// 业务与修改器（trainer.ts）完全一致，只是目录不同：
// 存档 exe 放在游戏详情目录下（<游戏详情目录>/<游戏名>/游戏存档/）的一堆 .exe，
// 常见于"通关存档.exe / 初始存档.exe / 网友1的存档.exe"等——每个 exe 是一个
// 可执行的"应用存档"脚本，点它就把对应存档写入游戏存档位置。
//
// 设计（成熟方案，对齐 trainer）：
//  - 存档目录 = 游戏详情目录根（gamesHtmlDir()，默认 <数据根>/Game_Details，
//    配置里可能是 D:/Addons）下、以游戏 id 或游戏名为名的子目录里的 "游戏存档" 子目录。
//  - 图标：用 Electron 的 app.getFileIcon() 提取每个 exe 自带图标转 dataURL。
//  - 启动：直接 spawn 该 exe，不做用户等级校验、不计时长。
//
// 说明：本功能只在 Electron 桌面端有意义（需要真实 exe 和 spawn），
//       Web 端（server.mjs）不注册这些命令。

import { ipcMain, app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { gamesHtmlDir } from "../core/paths";
import { registerCommand } from "./registry";

// 返回某游戏"游戏存档"目录的绝对路径（不存在返回 null）。
// 规则与详情页/修改器一致：优先游戏 id 子目录，其次游戏名子目录，再拼 "游戏存档"。
export function savesDir(gameId: string, gameName: string): string | null {
  const root = gamesHtmlDir();
  const candidates = [gameId, gameName];
  for (const c of candidates) {
    if (!c) continue;
    const dir = path.join(root, c, "游戏存档");
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }
  return null;
}

// 扫描"游戏存档"目录，列出所有 .exe（含图标 dataURL）。
// 返回 [{ name, exePath, icon }]；无存档 exe 或目录不存在返回 []。
async function listSaves(gameId: string, gameName: string) {
  const dir = savesDir(gameId, gameName);
  if (!dir) return [];
  const exes: { name: string; exePath: string }[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && /\.exe$/i.test(e.name)) {
      exes.push({ name: e.name, exePath: path.join(dir, e.name) });
    }
  }
  exes.sort((a, b) => a.name.localeCompare(b.name));

  // 提取每个 exe 的自带图标（失败就空串，前端用默认图标）。
  const out: { name: string; exePath: string; icon: string }[] = [];
  for (const ex of exes) {
    let icon = "";
    try {
      const img = await app.getFileIcon(ex.exePath, { size: "large" });
      if (!img.isEmpty()) icon = img.toDataURL();
    } catch {
      // 拿不到图标就留空，前端回退到默认存档图标。
    }
    out.push({ ...ex, icon });
  }
  return out;
}

export function registerSavesIpc(ipc: typeof ipcMain) {
  // 列出某游戏的所有"应用存档"exe（含图标）。前端详情页"应用存档"按钮展开用。
  registerCommand(
    ipc,
    "get_game_saves",
    async ({ gameId, gameName }: { gameId?: string; gameName?: string }) => {
      return listSaves(gameId ?? "", gameName ?? "");
    },
    { field: "gameId", log: true }
  );

  // 直接启动某个"应用存档"exe：不做等级校验、不计时长，spawn 即算成功。
  registerCommand(
    ipc,
    "launch_save",
    async ({ exePath }: { exePath?: string }) => {
      const p = exePath ?? "";
      if (!p) return { launched: false, error: "存档 exe 路径为空" };
      if (!fs.existsSync(p)) return { launched: false, error: `存档 exe 不存在：${p}` };
      try {
        const child = spawn(p, [], { cwd: path.dirname(p), stdio: "ignore" });
        child.on("error", (err) => {
          console.error("[saves] 启动应用存档失败:", p, err.message);
        });
        return { launched: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { launched: false, error: `启动应用存档失败：${msg}` };
      }
    },
    { field: "exePath", log: true }
  );
}
