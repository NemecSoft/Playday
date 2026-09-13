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
