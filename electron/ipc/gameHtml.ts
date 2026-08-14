// 游戏详情页（静态 HTML）相关 IPC 命令（Task 8）。移植自原 Rust 的 commands/game_html.rs。
// 详情页是放在数据根目录 Game_Details/<游戏名>/ 下的静态网页，
// 由本机 HTTP 服务器托管；命令返回页面文件路径或服务器 base URL，前端据此打开。

import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { gamesHtmlDir } from "../core/paths";
import { getGameServerBaseUrl } from "../core/gameServer";

// 返回某游戏的详情页 HTML 文件路径。规则：
//   1. 有 id 子目录 `Game_Details/<id>/index.html` → 用它
//   2. 否则用游戏名子目录 `Game_Details/<name>/index.html`
//   3. 都没有 → 返回 null（前端显示"未找到详情页"）
export function gameHtmlPagePath(gameId: string, gameName: string): string | null {
  const root = gamesHtmlDir();
  const idCandidates = [gameId, gameName];
  for (const c of idCandidates) {
    if (!c) continue;
    const p = path.join(root, c, "index.html");
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return p;
    }
  }
  return null;
}

export function registerGameHtmlIpc(ipc: typeof ipcMain) {
  // 返回某游戏详情页的本地路径。
  ipc.handle(
    "get_game_html_page",
    async (
      _e,
      a: string | { gameId: string; gameName: string },
      b?: string,
    ) => {
      const gameId = typeof a === "string" ? a : a?.gameId ?? "";
      const gameName = typeof a === "string" ? b ?? "" : a?.gameName ?? "";
      return gameHtmlPagePath(gameId, gameName);
    }
  );

  // 返回本机详情页 HTTP 服务器的 base URL；未启动返回空串。
  ipc.handle("get_game_server_url", async () => {
    return getGameServerBaseUrl();
  });

  // 列出 Game_Details/ 目录下有哪些游戏的详情页（管理端诊断用）。
  ipc.handle("list_game_html_dirs", async () => {
    const root = gamesHtmlDir();
    if (!fs.existsSync(root)) return [];
    const dirs: string[] = [];
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const idx = path.join(root, e.name, "index.html");
        if (fs.existsSync(idx)) dirs.push(e.name);
      }
    }
    dirs.sort();
    return dirs;
  });
}
