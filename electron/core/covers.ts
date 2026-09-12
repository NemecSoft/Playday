// 封面图库：把本地图片按文件名匹配到游戏。
// 移植自原 Rust 的 covers.rs。
//
// 用户把图片（如"星际争霸.png"）丢到应用根目录的 CoverImages 目录。
// 这里扫描一次目录，建一个"规范化文件名 → 文件路径"的索引（O(1) 查找），
// 再用每个游戏的中文名/别名/多语言名去索引里匹配。
// 只有 cover_image 为空（或指向的文件已不存在）的游戏才会被填，避免覆盖用户手动设的封面。

import * as fs from "fs";
import * as path from "path";
import { normalizePath } from "../../shared/launchPaths";
import {
  COVER_IMAGE_EXTS,
  coverCandidateNames,
  extOf,
  isBetterCover,
  normalizeCoverName,
} from "../../shared/coverMatch";
import { coverImagesDir } from "./paths";
import { getGames } from "./db";
import type { Game } from "./models";

/**
 * 路径是否位于"当前配置的封面目录"内（Windows 大小写不敏感 + 目录边界检查）。
 *
 * 这是唯一事实来源，两处共用：
 *   1) 读图白名单（ipc/covers.ts isAllowed）——决定这张图能不能读出来；
 *   2) 封面是否有效（下面 applyCovers 的 hasCover）——决定要不要重新匹配。
 * 两者判断必须一致。踩过的坑：只判断"文件是否存在"时，用户把封面目录改成新路径后，
 * 老路径的文件还在 → 游戏继续指着旧目录 → 白名单不放行 → 全部显示占位符。
 */
export function isInCoverDir(p: string): boolean {
  let canonical: string;
  try {
    canonical = fs.realpathSync(p); // 顺带校验文件存在
  } catch {
    return false;
  }
  // ⚠️ 两侧都必须过**同一个**规范化函数：realpathSync 返回系统原生分隔符（`\`），
  // 而 coverImagesDir() 现在统一是 `/` —— 不统一就会出现"图明明在目录里却判不在"，
  // 白名单全否 → 界面一片占位符（这个坑踩过一次，见上面注释）。
  const norm = (s: string) => {
    const r = normalizePath(s);
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  const a = norm(canonical);
  const b = norm(coverImagesDir());
  return a === b || a.startsWith(b.endsWith("/") ? b : b + "/");
}

// 格式优先级（动图 png > webp > gif > jpg > png > bmp）与名称规范化都在
// shared/coverMatch.ts —— 网站端 server/server.mjs 也用同一套规则匹配封面，
// 规则必须唯一，否则会出现"桌面能看到封面、网站看不到"。
//
// 判断一个 .png 是不是真·动图（APNG）：看文件头 IHDR 后面紧跟的那块是不是 acTL。
// 只读前几十字节，很轻量。（这段要读盘，所以留在主进程侧，由它把 isApng 结果喂给共享规则。）
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
      if (!COVER_IMAGE_EXTS.includes(ext)) continue;
      const stem = path.basename(entry.name, path.extname(entry.name));
      const key = normalizeCoverName(stem);
      if (!key) continue;
      fileCount++;
      const isAnimPng = ext === "png" && isApng(full);
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, full);
      } else {
        // 同名多格式：取优先级最高者（规则在 shared/coverMatch.ts，与网站端共用）。
        const eAnim = extOf(existing) === "png" && isApng(existing);
        if (isBetterCover({ file: full, isApng: isAnimPng }, { file: existing, isApng: eAnim })) {
          byName.set(key, full);
        }
      }
    }
  }
  const index = { byName, fileCount };
  indexCache = { dir, mtime, index };
  return index;
}

// 给单个游戏找一个匹配的封面路径（按候选名优先级依次试）。
// 候选名的顺序规则（zh-CN → zh-TW → 其它多语言名 → 别名 → 主名）在
// shared/coverMatch.ts，与网站端共用同一份。
function matchCover(index: CoverIndex, game: Game): string | undefined {
  for (const name of coverCandidateNames(game)) {
    const key = normalizeCoverName(name);
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
    // 封面"有效"= 文件存在 **且** 位于当前配置的封面目录内。
    // 只看文件是否存在的话，用户换掉封面目录后老路径仍然有效 → 不会被重新匹配 →
    // 而白名单只放行新目录 → 界面上一片占位符。
    const raw = g.coverImage?.trim();
    const hasCover = !!raw && isInCoverDir(raw);
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

// 给库里所有游戏套封面（读时计算：只改内存里的 Game 对象，不写回数据库）。
//
// 历史：这里原名 applyCoversToDb，会把匹配到的封面写回 cover_image 列。现在
// cover_image 字段不再使用（导出/入库都以空值处理），写回没有意义，反而每次
// 读游戏列表都要全库序列化一次，因此改为纯计算。games 表的 cover_image 列保留
// 不删（旧库兼容），只是不再写入。
export function applyCoversToLibrary(): { games: Game[]; result: CoverScanResult } {
  return applyCovers(getGames());
}
