// 应用自带字体（fonts 目录）的解析与扫描。
//
// 需求：界面字体用**我们自己的字体**（默认 fonts\字酷堂清楷 简.ttf），不依赖系统字体；
// 只有 fonts 文件夹不存在时才回退系统字体。
//
// 目录查找顺序（第一个存在的生效）：
//   1) <应用 exe 同级>/fonts   —— 绿色版里运维直接往这里丢字体（开发态 = 工程根/fonts）
//   2) <resources>/fonts       —— 打包时用 extraResources 带进去的那份（兜底）
// 两者都不存在 → 返回 null：前端保持系统字体（见 src/utils/uiFont.ts）。
//
// 字体文件怎么送到渲染进程：本地 HTTP 服务器按 /fonts/<文件名> 提供（见 gameServer.ts）。
// 为什么不直接给渲染进程 file:// 路径：开发态页面是 http://localhost:5173，
// Chromium 不允许 http 页面加载 file:// 子资源（字体同样被拦），走 HTTP 才是两个形态都稳。

import * as fs from "fs";
import * as path from "path";
import { fontsDir } from "./paths";

/** 默认字体文件名（需求指定）。找不到就按"归一化名字"再找一遍，最后才回退系统字体。 */
export const DEFAULT_FONT_FILE = "字酷堂清楷 简.ttf";

/** 认的字体扩展名（.ttc 是字体集合，浏览器支持率一般，但列出来不影响）。 */
const FONT_EXTS = [".ttf", ".otf", ".ttc"];

export interface FontFile {
  /** 磁盘上的文件名（含扩展名），服务器 URL 用它。 */
  fileName: string;
  /** 文件名去掉扩展名 —— 同时用作 CSS 的 font-family 名，改文件名就等于改字体名。 */
  family: string;
}

/**
 * 把字体名归一化后比较：去掉所有空白（含全角空格）与加号、统一小写。
 * 由来：同一款字体的文件名写法五花八门（`字酷堂清楷 简.ttf` / `字酷堂清楷简.TTF` /
 * `方正聚珍新仿+GBK.TTF`），按原样比会"明明在却找不到"。
 */
function normalizeFontKey(name: string): string {
  return name
    .replace(/[\s\u3000]+/g, "")
    .replace(/[+＋]/g, "")
    .toLowerCase();
}

/**
 * 候选字体目录（按优先级）：
 *   1) settings.fontsDir（可配置；未配置 = <应用 exe 同级>/fonts）—— 见 paths.ts 的 fontsDir()
 *   2) <resources>/fonts —— 打包时 extraResources 带进去的兜底
 */
export function fontsDirCandidates(): string[] {
  const out = [fontsDir()];
  const resources = process.resourcesPath;
  if (resources) {
    const packaged = path.join(resources, "fonts");
    if (!out.includes(packaged)) out.push(packaged);
  }
  return out;
}

/** 当前生效的字体目录；一个都不存在时返回 null（= 用系统字体）。 */
export function activeFontsDir(): string | null {
  for (const dir of fontsDirCandidates()) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      /* 不存在就试下一个 */
    }
  }
  return null;
}

/** 列出目录里的字体文件（不存在/读不到 → 空数组）。 */
export function listFontFiles(dir: string): FontFile[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: FontFile[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!FONT_EXTS.includes(ext)) continue;
    files.push({ fileName: e.name, family: path.basename(e.name, ext) });
  }
  // 按名字排，保证下拉里的顺序稳定（不会每次启动都变）。
  return files.sort((a, b) => a.family.localeCompare(b.family, "zh"));
}

/**
 * 默认字体的 family：先精确找 `字酷堂清楷 简.ttf`（按归一化名比），
 * 再退一步找任何同系列的"字酷堂清楷*"；都没有返回 ""（前端用它判"要不要回退系统字体"）。
 */
export function pickDefaultFontFamily(files: FontFile[]): string {
  if (files.length === 0) return "";
  const want = normalizeFontKey(path.basename(DEFAULT_FONT_FILE, path.extname(DEFAULT_FONT_FILE)));
  const exact = files.find((f) => normalizeFontKey(f.family) === want);
  if (exact) return exact.family;
  const series = files.find((f) => f.family.includes("字酷堂清楷"));
  return series ? series.family : "";
}

export interface FontDirInfo {
  /** 生效的字体目录（null = 没有，用系统字体）。 */
  dir: string | null;
  files: FontFile[];
  /** 默认字体的 family（"" = 没找到）。 */
  defaultFamily: string;
}

/** 一次性拿到"字体目录 + 文件列表 + 默认字体"。 */
export function fontDirInfo(): FontDirInfo {
  const dir = activeFontsDir();
  if (!dir) return { dir: null, files: [], defaultFamily: "" };
  const files = listFontFiles(dir);
  return { dir, files, defaultFamily: pickDefaultFontFamily(files) };
}

/**
 * 把 `/fonts/<文件名>` 的请求路径解析成磁盘绝对路径。
 * 防路径穿越：只接受目录下的裸文件名（不允许子目录、`..`、绝对路径）。
 * 返回 null 表示"不放行"。
 */
export function resolveFontRequest(rel: string): string | null {
  const dir = activeFontsDir();
  if (!dir) return null;
  const name = rel.replace(/^\/+/, "");
  if (!name || name.split(/[\\/]/).some((s) => s === "..") || path.isAbsolute(name)) return null;
  if (path.basename(name) !== name) return null; // 只允许裸文件名
  const ext = path.extname(name).toLowerCase();
  if (!FONT_EXTS.includes(ext)) return null;
  const full = path.join(dir, name);
  try {
    if (!fs.statSync(full).isFile()) return null;
  } catch {
    return null;
  }
  return full;
}
