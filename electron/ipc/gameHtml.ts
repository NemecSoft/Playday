// 游戏详情页（静态 HTML）相关 IPC 命令（Task 8）。移植自原 Rust 的 commands/game_html.rs。
// 详情页是放在数据根目录 Game_Details/<游戏名>/ 下的静态网页，
// 由本机 HTTP 服务器托管；命令返回页面文件路径或服务器 base URL，前端据此打开。

import { ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { gamesHtmlDir } from "../core/paths";
import { resolveGameDir } from "../core/gameDirs";
import { startGameServer, getGameServerBaseUrl } from "../core/gameServer";
import { setDetailTheme } from "../core/detailTheme";
import { registerCommand } from "./registry";

// 返回某游戏的详情页路径。规则：
//   1. 有 id 子目录 `<详情根>/<id>/` → 用它
//   2. 否则用游戏名子目录 `<详情根>/<name>/`
//   3. 都没有 → 返回 null（前端显示"详情内容正在建设中"）
// 这条"优先 id、其次游戏名"的规则统一在 core/gameDirs.ts。
//
// ⚠️ 2026-09-18：**判据从"index.html 文件在不在"改成了"目录在不在"**。
//   详情页已改为按数据现拼（服务器现拼，见 core/gameServer.ts 的 buildDetailPage），
//   1285 个静态 index.html 全部删除 —— 还看文件的话全库都会被判成"没有资料"，
//   界面上只剩"《xxx》的详情内容正在建设中"（实测就是这个症状）。
//   返回的路径照旧是 `<目录>/index.html`：那个文件虽不存在，但服务器会现拼出来发，
//   前端拿它拼 iframe 地址的逻辑一行都不用改。
export function gameHtmlPagePath(gameId: string, gameName: string): string | null {
  return gameHtmlPageHit(gameId, gameName)?.path ?? null;
}

/**
 * 同上，但**把实际命中的目录名一起带出来**。
 *
 * 为什么必须带：详情页 iframe 的地址是 `<服务器>/games/<目录名>/index.html`，而这个目录名
 * 可能就是**游戏 id**（命中规则第 1 条）。前端以前拿 `game.name` 自己猜 —— 命中 id 目录的
 * 游戏拼出来必然 404，这就是"详情页有时打不开"的第二个来源。目录名只有主进程知道，就由它给。
 */
export function gameHtmlPageHit(
  gameId: string,
  gameName: string
): { path: string; dir: string } | null {
  const hit = resolveGameDir(gameId, gameName);
  return hit ? { path: path.join(hit.path, "index.html"), dir: hit.dirName } : null;
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
      // 返回 { path, dir }：dir 是实际命中的目录名，前端拿它拼 iframe 地址。
      return gameHtmlPageHit(gameId, gameName);
    }
  );

  // 返回本机详情页 HTTP 服务器的 base URL。
  // 惰性启动：应用启动时不再预启动这个服务器（缩短启动时间），而是第一次
  // 打开详情页调用本命令时，若服务器还没起来就现场启动它再返回 URL。
  // startGameServer 内部有"已启动就复用"的守卫，重复调用是安全的。
  registerCommand(ipc, "get_game_server_url", async () => {
    if (getGameServerBaseUrl()) {
      return getGameServerBaseUrl();
    }
    try {
      return await startGameServer(gamesHtmlDir());
    } catch (e) {
      console.error("[get_game_server_url] 惰性启动详情页服务器失败:", e);
      return "";
    }
  });

  // 渲染层把"当前生效的主题配色"送过来，供详情页注入（见 core/detailTheme.ts）。
  //
  // 为什么走 IPC 而不是塞进详情页 iframe 的 URL（`?lang=` 那条路子）：
  //   URL 上的查询串在**页面自己内部跳转**时会丢 —— 详情页里点标签、点"返回全部游戏"
  //   都会重新请求 index.html，新 URL 上没有 theme 参数了。放进主进程状态里，每一页都带上。
  // 返回值只是"采纳与否"，前端 fire-and-forget 不关心。
  registerCommand(
    ipc,
    "set_detail_theme",
    (payload: unknown) => setDetailTheme(payload),
    { unwrap: "object" }
  );

  // 列出 Game_Details/ 目录下有哪些游戏（诊断用）。
  // 判据同 gameHtmlPageHit：只要**目录在**就算（详情页是现拼的，没有 index.html 文件）。
  registerCommand(ipc, "list_game_html_dirs", async () => {
    const root = gamesHtmlDir();
    if (!fs.existsSync(root)) return [];
    const dirs: string[] = [];
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (e.isDirectory() && e.name !== "_shared") dirs.push(e.name);
    }
    dirs.sort();
    return dirs;
  });
}
