// 游戏脚本执行：变量展开 + 按行解析逐条执行。
// 移植自原 Rust 的 script_runner.rs。
//
// 采用"每行一条命令"的简单方式（参考 Playnite 的全局脚本，但更简化、跨平台）。
// 每行非空、非 # 注释的会被解析成"程序 参数..."，用系统命令逐条执行。

import { spawnSync } from "child_process";
import { configRoot } from "./paths";
import type { Game } from "./models";

// 单行脚本的执行结果。
export interface ScriptLineResult {
  line: string;
  ok: boolean;
  error: string | null;
}

// 把脚本里的占位符替换成实际值。
// 支持：{InstallDir} {GameName} {GameId} {LibraryName} {AppDir}，大小写不敏感。
export function expandVariables(script: string, game: Game): string {
  const installDir = game.installDirectory || "";
  const lib = game.gameLibrary || "";
  const appDir = configRoot();
  let out = replaceCi(script, "{InstallDir}", installDir);
  out = replaceCi(out, "{GameName}", game.name);
  out = replaceCi(out, "{GameId}", game.id);
  out = replaceCi(out, "{LibraryName}", lib);
  out = replaceCi(out, "{AppDir}", appDir);
  return out;
}

// 大小写不敏感的全局替换。
function replaceCi(hay: string, from: string, to: string): string {
  const lower = hay.toLowerCase();
  const lowerFrom = from.toLowerCase();
  let out = "";
  let i = 0;
  let pos = lower.indexOf(lowerFrom, i);
  while (pos >= 0) {
    out += hay.slice(i, pos) + to;
    i = pos + from.length;
    pos = lower.indexOf(lowerFrom, i);
  }
  out += hay.slice(i);
  return out;
}

// 执行一段多行脚本。每行非空、非 # 注释，解析成"程序 参数..."执行。
// 逐行独立，单行失败不影响后续行。返回每行结果，供上层展示。
export function runScript(script: string, cwd?: string): ScriptLineResult[] {
  const results: ScriptLineResult[] = [];
  for (const raw of script.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    // 简单按空白切分：第一段是程序，其余是参数。
    const parts = line.split(/\s+/);
    const program = parts[0];
    const args = parts.slice(1);
    // 用 spawnSync 同步执行，逐行拿到结果（对齐 Rust 的 Command::output()）。
    try {
      const res = spawnSync(program, args, { cwd: cwd || undefined, encoding: "utf-8", shell: false });
      if (res.error) {
        results.push({ line, ok: false, error: res.error.message });
      } else {
        results.push({ line, ok: res.status === 0, error: res.status === 0 ? null : `退出码 ${res.status}` });
      }
    } catch (e) {
      results.push({ line, ok: false, error: (e as Error).message });
    }
  }
  return results;
}
