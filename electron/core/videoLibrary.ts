// 游戏本地视频的扫描与分类（单一来源）。
//
// 为什么单独成模块：同一套"哪些文件算视频、子文件夹怎么分组、怎么排序"的逻辑有
// 两个消费者 —— 详情页 HTTP 服务器的 `/api/videos`（electron/core/gameServer.ts）
// 和详情页前端的 IPC（electron/ipc/gameVideos.ts）。两边各写一份必然漂移成
// "接口列得出来、界面列不出来"，所以收敛到这里。
//
// 只依赖 node:fs / node:path，不引 electron：这样能被 vitest 直接 import 单测
// （见 videoLibrary.test.ts），也不会把 electron 拖进测试环境。

import * as fs from "fs";
import * as path from "path";

/** 作为"视频"列出的扩展名（只看文件名后缀，不解析容器内容）。 */
export const VIDEO_EXTS = [".mp4", ".webm", ".ogv", ".mov", ".m4v", ".mkv", ".flv", ".avi"];

/**
 * Chromium 能内置播放的扩展名。
 *  - .mp4 / .m4v → H.264 + AAC（最常见，最稳）
 *  - .webm → VP8/VP9，.ogv → Theora
 * 其余（.mov / .mkv / .flv / .avi）放不放得出取决于封装与编码，实际基本放不了，
 * 所以这里判 false —— 前端会改成"用系统播放器打开"，不会甩给用户一个黑屏播放器。
 */
const WEB_PLAYABLE_EXTS = [".mp4", ".m4v", ".webm", ".ogv"];

/** 是否算视频文件（按扩展名）。 */
export function isVideoFile(name: string): boolean {
  return VIDEO_EXTS.includes(path.extname(name).toLowerCase());
}

/** 是否能被内置 `<video>` 直接播。 */
export function isWebPlayable(name: string): boolean {
  return WEB_PLAYABLE_EXTS.includes(path.extname(name).toLowerCase());
}

/** 与视频同名的图片当作预览封面（`1.mp4` 旁边的 `1.jpg`）。 */
export const POSTER_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

/** 一条视频文件（相对 videos 目录）。 */
export interface ScannedVideo {
  /** 显示名（纯文件名，不含子目录）。 */
  name: string;
  /** 相对 videos 目录的路径，统一用 `/` 分隔（如 `实况/第1期.mp4`）。 */
  rel: string;
  /** 所在子文件夹名；直接放在 videos/ 下时为 ""。 */
  group: string;
}

/** 扫描结果：`root` 是 videos/ 下直接放的，`dirs` 是按子文件夹分好的组。 */
export interface VideoScan {
  root: string[];
  dirs: { name: string; files: string[] }[];
}

/**
 * 生成"自然排序"键：把数字段补零到定宽，让字符串比较也按数值排。
 * 例：实况2.mp4 要排在 实况10.mp4 前 —— 直接 localeCompare 会得到相反顺序。
 */
export function naturalKey(s: string): string {
  let out = "";
  let digits = "";
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
    } else {
      if (digits) {
        out += digits.padStart(12, "0");
        digits = "";
      }
      out += ch;
    }
  }
  if (digits) out += digits.padStart(12, "0");
  return out;
}

/** 按自然序比较两个名字。 */
export function compareNatural(a: string, b: string): number {
  return naturalKey(a).localeCompare(naturalKey(b));
}

/**
 * 视频目录的**候选名**（按优先级，第一个存在的生效）。
 *
 * 2026-09-17 需求：视频攻略 / 游戏实况的目录从 `videos` 改成 **`视频攻略&游戏实况`**
 * （视频数据太大，用中文目录名把"攻略/实况"和别的素材区分开，见 docs/design/game-details.md）。
 * `videos` **保留为兜底**：老数据没搬完的机器、或个别游戏还叫旧名，照样能看 —— 检测谁存在用谁，
 * 不看配置、不加开关（需求原话："默认用检测是不是有 视频攻略&游戏实况，有就把这个文件夹下的视频罗列出来"）。
 *
 * ⚠️ 它只是**磁盘上的目录名**。拼给浏览器的 URL 前缀用的是**实际命中的那个名字**
 * （`VideoDirHit.name` → `buildVideoSection` 的 `videoDirName`），所以两个名字并存时不会串台。
 */
export const VIDEO_DIR_NAMES = ["视频攻略&游戏实况", "videos"] as const;

/** 命中的视频目录。 */
export interface VideoDirHit {
  /** 目录路径（拼在调用方给的"游戏目录"下）。 */
  path: string;
  /** 命中的目录名 —— 拼相对 URL 时**必须**用它，否则 URL 指不到真实位置。 */
  name: string;
}

/**
 * 在某个"游戏目录"下找视频目录：按 VIDEO_DIR_NAMES 顺序，第一个真实存在的目录生效。
 * 都不存在 → null（没有视频是正常状态，不是错误）。
 */
export function findVideoDir(gameDir: string): VideoDirHit | null {
  for (const name of VIDEO_DIR_NAMES) {
    const p = path.join(gameDir, name);
    try {
      if (fs.statSync(p).isDirectory()) return { path: p, name };
    } catch {
      // 这个候选不存在，试下一个（新名没命中就试旧的 videos）
    }
  }
  return null;
}

/**
 * 扫描某游戏的视频目录（含一层子文件夹分组）。
 * 目录不存在 / 读不了 → 返回空结果，**不抛错**：没有视频是正常状态，不是错误。
 */
export function scanVideos(videosRoot: string): VideoScan {
  const root: string[] = [];
  const dirs: { name: string; files: string[] }[] = [];
  try {
    for (const entry of fs.readdirSync(videosRoot, { withFileTypes: true })) {
      if (entry.isFile() && isVideoFile(entry.name)) {
        root.push(entry.name);
      } else if (entry.isDirectory()) {
        const files: string[] = [];
        try {
          for (const se of fs.readdirSync(path.join(videosRoot, entry.name), {
            withFileTypes: true,
          })) {
            if (se.isFile() && isVideoFile(se.name)) files.push(`${entry.name}/${se.name}`);
          }
        } catch {
          // 子目录读不了（权限 / 被占用）：跳过这一组，不影响其它视频
        }
        // 只收"真有视频"的组，空目录不占位（否则前端会列出空分组）。
        if (files.length) dirs.push({ name: entry.name, files });
      }
    }
  } catch {
    // videos 目录不存在
  }
  root.sort(compareNatural);
  dirs.sort((a, b) => compareNatural(a.name, b.name));
  for (const d of dirs) d.files.sort(compareNatural);
  return { root, dirs };
}

/**
 * 找某条视频的"同名封面图"（返回**相对 videos 目录**的路径；没有返回 null）。
 * 例如 `1.mp4` 旁边放了 `1.jpg` → 用 `1.jpg` 当预览封面。
 *
 * 为什么放在这里：注入模块要保持"纯字符串处理"才好单测，而"同名图片存在吗"必须看磁盘；
 * 扫描/封面都属于"视频目录里有什么"，归到一处。
 */
export function findVideoPoster(videosDir: string, rel: string): string | null {
  const dot = rel.lastIndexOf(".");
  const base = dot > 0 ? rel.slice(0, dot) : rel;
  for (const ext of POSTER_EXTS) {
    const candidate = `${base}${ext}`;
    try {
      if (fs.statSync(path.join(videosDir, ...candidate.split("/"))).isFile()) return candidate;
    } catch {
      // 这个扩展名没有，试下一个
    }
  }
  return null;
}

/**
 * 把扫描结果摊平成一维列表（前端下拉 / 播放列表用）。
 * 顺序：先是 videos/ 根下的，再按组依次展开 —— 与用户在资源管理器里看到的层级一致。
 */
export function flattenVideos(scan: VideoScan): ScannedVideo[] {
  const out: ScannedVideo[] = scan.root.map((name) => ({ name, rel: name, group: "" }));
  for (const d of scan.dirs) {
    for (const rel of d.files) {
      out.push({ name: rel.slice(d.name.length + 1), rel, group: d.name });
    }
  }
  return out;
}
