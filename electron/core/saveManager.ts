// 存档管理核心：备份-恢复游戏存档。
// 职责：解析存档路径（含通配符 + {游戏库名} 占位符）、校验哪些路径有匹配文件、
//       生成备份文件名 / 默认输出位置。
// 打包成自解压 exe 见 nsis.ts；进程退出自动备份见 process.ts。
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { resolvePath } from "./process";
import type { GameLibrary } from "./models";

// 一个"备份路径"匹配到的文件结果。
export interface SavePathCollect {
  savePath: string;            // 原始配置（含通配符）
  resolved: string;            // 占位符展开后的路径（可能仍含通配符）
  matches: string[];           // 实际匹配到的文件/目录（绝对路径）
  skipped: string;             // 无匹配时的提示（可空）
}

// 把带 {游戏库名} 占位符 + 可能带通配符的路径，拆成"目录"和"匹配模式"两部分。
// 返回 { dir, pattern }：dir 是绝对目录，pattern 是文件名通配符（null 表示整个目录）。
function splitDirPattern(raw: string): { dir: string; pattern: string | null } {
  const hasGlob = /[*?]/.test(raw);
  if (!hasGlob) return { dir: raw, pattern: null };
  const parts = raw.split(/[\\/]/);
  let globIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/[*?]/.test(parts[i])) { globIdx = i; break; }
  }
  if (globIdx < 0) return { dir: raw, pattern: null };
  const dir = parts.slice(0, globIdx).join(path.sep) || path.sep;
  const pattern = parts[globIdx];
  return { dir, pattern };
}

// 用 glob 匹配 dir 下的文件。pattern 支持 * ?。
function globMatch(dir: string, pattern: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const rx = new RegExp(
    "^" + pattern.split("").map((c) => {
      if (c === "*") return "[^\\\\/]*";
      if (c === "?") return "[^\\\\/]";
      return c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("") + "$",
    "i"
  );
  try {
    return fs.readdirSync(dir)
      .filter((name) => rx.test(name))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

// 校验一个存档路径是否有匹配文件（供打包前预检：无匹配的路径不写进 NSIS 脚本，
// 避免 makensis 因 File 找不到文件而编译失败）。
export function collectSavePath(savePath: string, gameLibraries: GameLibrary[]): SavePathCollect {
  const resolvedBase = resolvePath(savePath, gameLibraries);
  const { dir, pattern } = splitDirPattern(resolvedBase);

  if (pattern === null) {
    // 无通配符：整个目录或单个文件
    if (fs.existsSync(resolvedBase)) {
      return { savePath, resolved: resolvedBase, matches: [resolvedBase], skipped: "" };
    }
    return { savePath, resolved: resolvedBase, matches: [], skipped: `路径不存在: ${resolvedBase}` };
  }

  const matches = globMatch(dir, pattern);
  return {
    savePath,
    resolved: resolvedBase,
    matches,
    skipped: matches.length === 0 ? `无匹配: ${resolvedBase}` : "",
  };
}

// 生成备份文件名：<游戏名>——游戏存档<时间戳>.exe
export function backupFileName(gameName: string, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${gameName}——游戏存档${ts}.exe`;
}

// 用户桌面路径（默认备份输出位置）。
export function desktopPath(): string {
  return path.join(os.homedir(), "Desktop");
}
