// 游戏详情目录下的子路径解析（"优先游戏 id，其次游戏名"这条规则的单一来源）。
//
// 由来：这条规则原先在三个地方各写了一遍 ——
//   gameHtml.ts（找 index.html）、trainer.ts（找 修改器/）、saves.ts（找 游戏存档/）。
// 加"视频"时就会变成第 4 份，四份里任何一份改口径就会出现
// "修改器找得到、视频找不到"这类不一致。所以收敛到这里，调用方只声明"要什么子路径"。
//
// 目录根 = gamesHtmlDir()（默认 <数据根>/Game_Details，可在 config.json 用
// gameDetailsDir 改成别的绝对路径，例如 D:\Addons）。

import * as fs from "fs";
import * as path from "path";
import { gamesHtmlDir } from "./paths";
import { findVideoDir } from "./videoLibrary";

/** 候选子目录名：优先游戏 id，其次游戏名（空值跳过）。 */
export function gameDirCandidates(gameId: string, gameName: string): string[] {
  return [gameId, gameName].filter((c) => !!c);
}

/** 命中结果：`path` 是绝对路径，`dirName` 是实际命中的候选名。 */
export interface GameSubpathHit {
  path: string;
  dirName: string;
}

/**
 * 在详情页根目录下解析某游戏的子路径。
 *
 * @param rel  相对"游戏目录"的路径，如 `index.html` / `修改器` / `videos`
 * @param kind 要求命中文件（file）还是目录（dir），默认 dir
 * @returns 命中信息；找不到返回 null
 */
export function resolveGameSubpath(
  gameId: string,
  gameName: string,
  rel: string,
  kind: "dir" | "file" = "dir"
): GameSubpathHit | null {
  const root = gamesHtmlDir();
  for (const c of gameDirCandidates(gameId, gameName)) {
    const p = path.join(root, c, rel);
    try {
      const st = fs.statSync(p);
      if (kind === "file" ? st.isFile() : st.isDirectory()) return { path: p, dirName: c };
    } catch {
      // 这个候选不存在，试下一个（id 没命中就试游戏名）
    }
  }
  return null;
}

/**
 * 某游戏的**详情目录本身**（id 优先、其次游戏名）。
 *
 * 为什么单独有它（2026-09-18）：详情页改成"按数据现拼"之后，`<游戏目录>/index.html`
 * 这个文件**不存在了**（1285 个静态页已删，改由服务器现拼，见 gameServer.ts 的 buildDetailPage）。
 * 判定"这个游戏有没有资料"若还去看那个文件，**全库都会被判成没有资料** ——
 * 界面上就是一句"详情内容正在建设中"（实测踩过，见 docs/design/game-details.md）。
 * 正确的判据是**目录在不在**：目录里放着 images/、视频、修改器、存档，文字数据在库里。
 */
export function resolveGameDir(gameId: string, gameName: string): GameSubpathHit | null {
  return resolveGameSubpath(gameId, gameName, "", "dir");
}

/** 命中的视频目录：比 `GameSubpathHit` 多一个"视频目录叫什么"。 */
export interface GameVideoDirHit {
  /** 视频目录绝对路径。 */
  path: string;
  /** 命中的视频目录名（`视频攻略&游戏实况` / `videos`）—— 拼给浏览器的相对 URL 前缀要用它。 */
  videoDirName: string;
  /** 命中的游戏目录名（id 或游戏名）。 */
  gameDirName: string;
}

/**
 * 某游戏的**视频目录**：游戏目录（id 优先、其次游戏名）× 视频目录名
 * （`视频攻略&游戏实况` 优先、`videos` 兜底 —— 候选名单与探测都在 core/videoLibrary.ts）。
 *
 * 为什么单独一个函数、而不是让调用方自己写 `resolveGameSubpath(gameId, gameName, "…")`：
 * 目录名现在有**两个候选**，写在调用方就会变成"详情页注入用一套、IPC 用另一套" ——
 * 正是本文件顶部那条教训（同一条规则被抄成四份，改一处就出现"修改器找得到、视频找不到"）。
 */
export function resolveGameVideoDir(gameId: string, gameName: string): GameVideoDirHit | null {
  const root = gamesHtmlDir();
  for (const c of gameDirCandidates(gameId, gameName)) {
    const hit = findVideoDir(path.join(root, c));
    if (hit) return { path: hit.path, videoDirName: hit.name, gameDirName: c };
  }
  return null;
}
