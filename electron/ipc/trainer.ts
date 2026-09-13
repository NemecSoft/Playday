// 游戏修改器（Trainer）相关 IPC 命令。
//
// 修改器是游戏详情目录下（<游戏详情目录>/<游戏名>/修改器/）放的一堆 .exe，
// 常见于单机游戏的 Cheat Engine 脚本、修改器工具等。
//
// 设计（成熟方案）：
//  - 修改器目录 = 游戏详情目录根（gamesHtmlDir()，默认 <数据根>/Game_Details，
//    配置里可能是 D:/Addons）下、以游戏 id 或游戏名为名的子目录里的 "修改器" 子目录。
//  - 图标：用 Electron 的 app.getFileIcon() 提取每个 exe 自带的图标，
//    转成 dataURL 给前端展示，最还原（解析 Windows PE 的 .ico 资源）。
//  - 启动：直接 spawn 该 exe，不做用户等级校验、不计时长——
//    修改器不是主游戏，不应受等级/计时限制。
//
// 说明：本功能只在 Electron 桌面端有意义（需要真实 exe 和 spawn），
//       Web 端（server.mjs）不注册这些命令。

import { ipcMain, app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { resolveGameSubpath } from "../core/gameDirs";
import { registerCommand } from "./registry";

// 返回某游戏"修改器"目录的绝对路径（不存在返回 null）。
// "优先游戏 id 子目录，其次游戏名子目录"这条规则统一在 core/gameDirs.ts。
export function trainerDir(gameId: string, gameName: string): string | null {
  return resolveGameSubpath(gameId, gameName, "修改器")?.path ?? null;
}

// 扫描修改器目录，列出所有 .exe（含图标 dataURL）。
// 返回 [{ name, exePath, icon }]；无修改器或目录不存在返回 []。
async function listTrainers(gameId: string, gameName: string) {
  const dir = trainerDir(gameId, gameName);
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
      // 拿不到图标就留空，前端回退到默认修改器图标。
    }
    out.push({ ...ex, icon });
  }
  return out;
}

export function registerTrainerIpc(ipc: typeof ipcMain) {
  // 列出某游戏的所有修改器 exe（含图标）。前端详情页"修改器"按钮展开用。
  registerCommand(
    ipc,
    "get_game_trainers",
    async ({ gameId, gameName }: { gameId?: string; gameName?: string }) => {
      return listTrainers(gameId ?? "", gameName ?? "");
    },
    { field: "gameId", log: true }
  );

  // 直接启动某个修改器 exe：不做等级校验、不计时长，spawn 即算成功。
  registerCommand(
    ipc,
    "launch_trainer",
    async ({ exePath }: { exePath?: string }) => {
      const p = exePath ?? "";
      if (!p) return { launched: false, error: "修改器路径为空" };
      if (!fs.existsSync(p)) return { launched: false, error: `修改器不存在：${p}` };
      try {
        const child = spawn(p, [], { cwd: path.dirname(p), stdio: "ignore" });
        // 反注册错误监听，避免未捕获异常；进程可能立即退出（无窗口修改器），
        // 这里只关心能否拉起，不追踪状态。
        child.on("error", (err) => {
          console.error("[trainer] 启动修改器失败:", p, err.message);
        });
        return { launched: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { launched: false, error: `启动修改器失败：${msg}` };
      }
    },
    { field: "exePath", log: true }
  );
}
