// 背景音乐目录的解析与扫描。
//
// 需求：背景音乐文件夹可配置 + 随机循环播放。
//   目录：settings.musicDir（见 electron/core/paths.ts 的 musicDir()），未配置 = <数据根>/music；
//         目录不存在 / 里面没有音频文件 → 视为没有背景音乐（前端干脆不显示音乐控件）。
//   播放：音频文件由详情页那个本地 HTTP 服务器按 `/music/<相对路径>` 提供（带 Range，可拖进度）。
//         为什么不让 <audio> 直接读 file://：开发态页面是 http://localhost:5173，
//         Chromium 不允许 http 页面加载 file:// 子资源；而打包态虽然是 file:// 能用，
//         两态不一致以后更难查。与自带字体是同一套做法（见 electron/core/fonts.ts 的说明）。

import * as fs from "fs";
import * as path from "path";
import { musicDir } from "./paths";

/**
 * 认的音频扩展名。
 * Chromium 原生能解 mp3 / flac / wav / m4a(aac) / ogg / opus；wma 一般不认但列着无害
 * （列表里有它、播不出来会自己跳到下一首，不会卡住）。
 */
const AUDIO_EXTS = [".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".wma"];

/** 递归扫描的最大深度：有人把音乐目录指向盘根时，别把整块盘翻一遍。 */
const MAX_DEPTH = 4;

export interface MusicFile {
  /** 相对音乐目录的路径（统一用 `/` 分隔）—— URL 与请求校验都用它。 */
  rel: string;
  /** 显示用标题（文件名去掉扩展名）。 */
  title: string;
  /** 字节数（排查"为什么这首放不出来"时有用；也用于排序稳定性）。 */
  size: number;
}

function isAudioFile(name: string): boolean {
  return AUDIO_EXTS.includes(path.extname(name).toLowerCase());
}

/** 列出音乐目录里的音频文件（递归子目录，跳过以 . 开头的隐藏项）。 */
export function listMusicFiles(dir: string, depth = 0): MusicFile[] {
  if (depth > MAX_DEPTH) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: MusicFile[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...listMusicFiles(full, depth + 1));
      continue;
    }
    if (!e.isFile() || !isAudioFile(e.name)) continue;
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      /* 读不到大小不影响播放 */
    }
    out.push({
      rel: path.relative(dir, full).split(path.sep).join("/"),
      title: path.basename(e.name, path.extname(e.name)),
      size,
    });
  }
  // 按相对路径（含子目录）稳定排序；随机顺序由前端负责，这里只保证"每次启动顺序一致"。
  return out.sort((a, b) => a.rel.localeCompare(b.rel, "zh"));
}

export interface MusicDirInfo {
  /** 音乐目录（配置解析结果，"配了但不存在"也会如实返回，便于排查）。 */
  dir: string;
  exists: boolean;
  files: MusicFile[];
}

/** 一次性拿到"音乐目录 + 是否存在 + 曲目列表"。 */
export function musicDirInfo(): MusicDirInfo {
  const dir = musicDir();
  let exists = false;
  try {
    exists = fs.statSync(dir).isDirectory();
  } catch {
    exists = false;
  }
  return { dir, exists, files: exists ? listMusicFiles(dir) : [] };
}

/**
 * 把 `/music/<相对路径>` 的请求解析成磁盘绝对路径。
 * 防路径穿越：不允许 `..`、不允许绝对路径；只放行音乐目录下、扩展名在白名单里的真实文件。
 * 返回 null 表示"不放行"。
 */
export function resolveMusicRequest(rel: string): string | null {
  const dir = musicDir();
  const name = String(rel ?? "").replace(/^\/+/, "");
  if (!name) return null;
  if (name.split(/[\\/]/).some((s) => s === ".." || s === "")) return null;
  const normalized = name.split("\\").join("/");
  if (path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized)) return null;
  if (!isAudioFile(normalized)) return null;
  const full = path.join(dir, ...normalized.split("/"));
  // 再确认一次没跑出音乐目录（防奇怪的编码绕过）。
  const relCheck = path.relative(dir, full);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) return null;
  try {
    if (!fs.statSync(full).isFile()) return null;
  } catch {
    return null;
  }
  return full;
}
