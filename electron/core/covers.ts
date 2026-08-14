// 封面图库：把本地图片按文件名匹配到游戏。
// 移植自原 Rust 的 covers.rs。
//
// 用户把图片（如"星际争霸.png"）丢到应用根目录的 CoverImages 目录。
// 这里扫描一次目录，建一个"规范化文件名 → 文件路径"的索引（O(1) 查找），
// 再用每个游戏的中文名/别名/多语言名去索引里匹配。
// 只有 cover_image 为空（或指向的文件已不存在）的游戏才会被填，避免覆盖用户手动设的封面。

import * as fs from "fs";
import * as path from "path";
import { coverImagesDir } from "./paths";
import { getGames, upsertGame } from "./db";
import type { Game } from "./models";

// 我们当作封面的图片扩展名。
const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

// 同名的图，动画格式优先于静态（APNG > webp > gif > jpg > png）。
function formatPriority(ext: string, isApng: boolean): number {
  if (ext === "png" && isApng) return 100;
  if (ext === "webp") return 80;
  if (ext === "gif") return 60;
  if (ext === "jpg" || ext === "jpeg") return 40;
  if (ext === "png") return 20;
  if (ext === "bmp") return 10;
  return 0;
}

// 判断一个 .png 是不是真·动图（APNG）：看文件头 IHDR 后面紧跟的那块是不是 acTL。
// 只读前几十字节，很轻量。
function isApng(p: string): boolean {
  try {
    const fd = fs.openSync(p, "r");
    const head = Buffer.alloc(64);
    const n = fs.readSync(fd, head, 0, 64, 0);
    fs.closeSync(fd);
    if (n < 33) return false;
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!head.subarray(0, 8).equals(sig)) return false;
    // 第 12..16 字节应是 "IHDR"
    if (head.toString("ascii", 12, 16) !== "IHDR") return false;
    return head.includes(Buffer.from("acTL"));
  } catch {
    return false;
  }
}

// 名称规范化：转小写、全角转半角、去掉空格和标点括号，
// 这样"星际争霸 (2)"、"星际争霸-2"、"星际争霸"都能匹配到同一个键。
function normalizeName(s: string): string {
  const stripped = new Set(
    " \t\r\n　、，。：；！？·•（）【】《》「」『』〈〉()[]{}<>-_.,｜|&+'\"/`＊*＃#".split("")
  );
  let out = "";
  for (const ch of s) {
    let c = ch;
    // 全角数字/字母转半角
    if (c >= "０" && c <= "９") c = String.fromCharCode(c.charCodeAt(0) - "０".charCodeAt(0) + "0".charCodeAt(0));
    else if (c >= "Ａ" && c <= "Ｚ") c = String.fromCharCode(c.charCodeAt(0) - "Ａ".charCodeAt(0) + "A".charCodeAt(0));
    else if (c >= "ａ" && c <= "ｚ") c = String.fromCharCode(c.charCodeAt(0) - "ａ".charCodeAt(0) + "a".charCodeAt(0));
    if (stripped.has(c)) continue;
    out += c.toLocaleLowerCase();
  }
  return out;
}

// 简易目录修改时间，用来判断缓存是否还有效。
function dirMtime(dir: string): number {
  try {
    return Math.floor(fs.statSync(dir).mtimeMs / 1000);
  } catch {
    return 0;
  }
}

interface CoverIndex {
  byName: Map<string, string>;
  fileCount: number;
}

let indexCache: { dir: string; mtime: number; index: CoverIndex } | null = null;

// 扫描 CoverImages 目录，建"规范化名 → 路径"索引；目录没变就复用缓存。
function scanCoverIndex(): CoverIndex {
  const dir = coverImagesDir();
  const mtime = dirMtime(dir);
  if (indexCache && indexCache.dir === dir && indexCache.mtime === mtime) {
    return indexCache.index;
  }
  const byName = new Map<string, string>();
  let fileCount = 0;
  if (fs.existsSync(dir)) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const full = path.join(dir, entry.name);
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (!IMAGE_EXTS.includes(ext)) continue;
      const stem = path.basename(entry.name, path.extname(entry.name));
      const key = normalizeName(stem);
      if (!key) continue;
      fileCount++;
      const isAnimPng = ext === "png" && isApng(full);
      const prio = formatPriority(ext, isAnimPng);
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, full);
      } else {
        const eExt = path.extname(existing).slice(1).toLowerCase();
        const eAnim = eExt === "png" && isApng(existing);
        const ePrio = formatPriority(eExt, eAnim);
        if (prio > ePrio) byName.set(key, full);
      }
    }
  }
  const index = { byName, fileCount };
  indexCache = { dir, mtime, index };
  return index;
}

// 给单个游戏找一个匹配的封面路径（按候选名优先级依次试）。
function matchCover(index: CoverIndex, game: Game): string | undefined {
  const seen = new Set<string>();
  const candidates: string[] = [];
  // 1) 中文名（zh-CN 优先，再 zh-TW）
  for (const lang of ["zh-CN", "zh-TW"]) {
    const ln = game.localizedNames.find((n) => n.language === lang);
    if (ln) {
      const t = ln.name.trim();
      if (t && seen.add(t)) candidates.push(t);
    }
  }
  // 2) 其他多语言名
  for (const ln of game.localizedNames) {
    const t = ln.name.trim();
    if (t && seen.add(t)) candidates.push(t);
  }
  // 3) 别名
  for (const a of game.alternateNames || []) {
    const t = a.trim();
    if (t && seen.add(t)) candidates.push(t);
  }
  // 4) 原名
  if (seen.add(game.name.trim())) candidates.push(game.name.trim());

  for (const name of candidates) {
    const key = normalizeName(name);
    if (!key) continue;
    const p = index.byName.get(key);
    if (p) return p;
  }
  return undefined;
}

// 封面匹配结果摘要（给前端 UI 显示）。
export interface CoverScanResult {
  matched: number;
  coverFiles: number;
  considered: number;
  dirExists: boolean;
  dirPath: string;
}

// 给一批游戏套封面：空封面或封面文件已丢失的，重新匹配并填回。
export function applyCovers(games: Game[]): { games: Game[]; result: CoverScanResult } {
  const index = scanCoverIndex();
  let matched = 0;
  let considered = 0;
  const updated = games.map((g) => {
    const hasCover =
      g.coverImage != null && g.coverImage.trim() !== "" && fs.existsSync(g.coverImage.trim());
    if (hasCover) return g;
    considered++;
    const p = matchCover(index, g);
    if (p) {
      matched++;
      return { ...g, coverImage: p };
    }
    return g;
  });
  const dir = coverImagesDir();
  return {
    games: updated,
    result: {
      matched,
      coverFiles: index.fileCount,
      considered,
      dirExists: fs.existsSync(dir) && fs.statSync(dir).isDirectory(),
      dirPath: dir,
    },
  };
}

// 给库里所有游戏套封面，并只持久化"封面从空变成有"的游戏（避免无谓写库）。
export function applyCoversToDb(): { games: Game[]; result: CoverScanResult } {
  const games = getGames();
  const { games: updated, result } = applyCovers(games);
  updated.forEach((g, i) => {
    const before = games[i];
    if (g.coverImage !== before.coverImage && g.coverImage) {
      upsertGame(g);
    }
  });
  return { games: updated, result };
}
