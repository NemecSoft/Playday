// 游戏进程启动与运行状态追踪。
// 移植自原 Rust 的 process.rs + commands/games.rs 里的启动/监控逻辑。
//
// 用 Node 的 child_process.spawn 启动游戏进程，再监听子进程的 'exit' 事件
// 得知退出（比原 Rust 每 2 秒轮询 try_wait 更省资源、也更及时），退出时把
// 本次运行时长写回数据库。内存里维护一张"运行中游戏"表，供 running_games /
// get_run_state 查询。

import { spawn } from "child_process";
import * as path from "path";
import { configRoot } from "./paths";
import { getGame, upsertGame } from "./db";
import type { Game, GameAction, GameLibrary } from "./models";
import { expandVariables, runScript } from "./scriptRunner";
import { collectSavePath, backupFileName } from "./saveManager";
import { compileBackupToExe, nsisAvailable, type NsisEntry } from "./nsis";
import { getLibraries as getLibrariesFromSettings } from "./settings";

// 运行中游戏的记录。
export interface RunningGame {
  gameId: string;
  gameName: string;
  startedAt: number; // 启动时间戳（秒）
  elapsedStart: number; // 开始计时的毫秒时间点（用于算已运行秒数）
}

// 一张"运行中游戏"表：游戏 id → 运行状态。
const running = new Map<string, RunningGame>();
// 每个游戏本会话"最近一次退出"的时长（秒）。
const lastExit = new Map<string, number>();

// ---- 路径解析（移植 process.rs 的 resolve_path / resolve_library_placeholder）----

// 解析启动路径：
//   - `{游戏库名}\rest` → 用该库根目录拼上 rest
//   - 绝对路径 → 原样
//   - 相对路径（. / ..）→ 相对应用数据根目录
export function resolvePath(p: string, gameLibraries: GameLibrary[]): string {
  if (!p) return p;
  const root = configRoot();
  const lib = resolveLibraryPlaceholder(p, gameLibraries);
  if (lib) {
    const [rest, libRoot] = lib;
    return normalizePath(path.join(libRoot, rest));
  }
  if (path.isAbsolute(p)) return p;
  return normalizePath(path.join(root, p));
}

// 如果路径以 `{库名}` 开头，返回"占位符之后的路径"和"该库根目录"。
function resolveLibraryPlaceholder(p: string, gameLibraries: GameLibrary[]): [string, string] | null {
  const trimmed = p.trimStart();
  if (!trimmed.startsWith("{")) return null;
  const end = trimmed.indexOf("}");
  if (end < 0) return null;
  const token = trimmed.slice(1, end);
  if (!token) return null;
  const lib = gameLibraries.find((l) => l.name.toLowerCase() === token.toLowerCase());
  if (!lib || !lib.path.trim()) return null;
  const rest = trimmed.slice(end + 1).replace(/^[\\/]+/, "");
  return [rest, lib.path];
}

// 把路径词法规范化（折叠 . 和 .. 段，不碰磁盘）。
function normalizePath(p: string): string {
  const parts = p.split(/[\\/]/);
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (out.length) out.pop();
      else out.push("..");
    } else {
      out.push(part);
    }
  }
  return out.join(path.sep);
}

// 在安装目录里找一个可执行文件（移植 find_game_executable）。
// 优先找"文件名和目录名相同"的，否则找体积最大的 exe/bat/cmd/lnk。
export function findGameExecutable(installDir: string): { exe: string; wd: string } | null {
  const fs = require("fs");
  if (!fs.existsSync(installDir) || !fs.statSync(installDir).isDirectory()) return null;
  const exts = ["exe", "bat", "cmd", "lnk"];
  const candidates: { size: number; file: string }[] = [];
  for (const ext of exts) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(installDir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = path.join(installDir, name);
      let isFile = false;
      try {
        isFile = fs.statSync(full).isFile();
      } catch {
        continue;
      }
      if (isFile && name.toLowerCase().endsWith("." + ext)) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          /* ignore */
        }
        candidates.push({ size, file: full });
      }
    }
  }
  if (candidates.length === 0) return null;
  const dirName = path.basename(installDir).toLowerCase();
  for (const c of candidates) {
    const stem = path.basename(c.file, path.extname(c.file)).toLowerCase();
    if (stem === dirName) {
      return { exe: c.file, wd: path.dirname(c.file) };
    }
  }
  candidates.sort((a, b) => b.size - a.size);
  return { exe: candidates[0].file, wd: path.dirname(candidates[0].file) };
}

// ---- 运行状态管理 ----

// 判断某游戏当前是否在运行。
export function isGameRunning(gameId: string): boolean {
  return running.has(gameId);
}

// 已运行的秒数（从开始计时到现在）。
export function elapsedSeconds(gameId: string): number {
  const r = running.get(gameId);
  if (!r) return 0;
  return Math.floor((Date.now() - r.elapsedStart) / 1000);
}

// 本会话"最近一次退出"的时长（秒），没有则返回 0。
export function lastExitSeconds(gameId: string): number {
  return lastExit.get(gameId) ?? 0;
}

// 运行中的游戏列表。
export function runningGames(): RunningGame[] {
  return [...running.values()];
}

// 停止追踪（结算时长），返回本次运行秒数。进程退出或用户手动停止时调用。
function stopTracking(gameId: string): number {
  const r = running.get(gameId);
  let played = 0;
  if (r) {
    played = Math.floor((Date.now() - r.elapsedStart) / 1000);
    running.delete(gameId);
  }
  return played;
}

// ---- 启动动作解析 ----

// 找游戏的启动动作：优先指定的 actionId，否则用 playTask，最后用默认 play action。
function resolveAction(game: Game, actionId?: string): GameAction | undefined {
  if (actionId) {
    const byId = game.actions.find((a) => a.id === actionId);
    if (byId) return byId;
  }
  if (game.playTask) {
    const byTask = game.actions.find((a) => a.id === game.playTask);
    if (byTask) return byTask;
  }
  return game.actions.find((a) => a.isPlayAction);
}

// ---- 权限检查（对齐 auth::can_play）----
export function canPlay(userLevel: number, gameLevel: number): boolean {
  return userLevel >= gameLevel;
}

// ---- 启动主入口 ----

export interface LaunchResult {
  launched: boolean;
  error?: string;
}

// 启动游戏。userLevel 用于权限校验；track 是否累计时长。
export function launchGame(
  game: Game,
  options: { actionId?: string; userLevel: number; track: boolean; gameLibraries: GameLibrary[] }
): LaunchResult {
  // 权限校验：用户等级必须 >= 游戏等级。
  if (!canPlay(options.userLevel, game.gameLevel)) {
    return {
      launched: false,
      error: `用户等级 ${options.userLevel} 不够，无法游玩等级 ${game.gameLevel} 的游戏`,
    };
  }

  const libs = options.gameLibraries;
  // 有启动动作就按动作启动；没有则尝试在安装目录自动找 exe。
  const action = resolveAction(game, options.actionId);
  let childStarted = false;

  if (action) {
    if (action.type === "File") {
      const exe = action.path || "";
      if (!exe) return { launched: false, error: "启动指令路径为空" };
      // 运行前检测：目标必须存在且是可执行文件。
      const precheck = validateLaunchPath(exe, "File", libs);
      if (!precheck.valid) {
        return {
          launched: false,
          error: `启动前检测未通过：${precheck.reason}（解析路径：${precheck.resolved}）`,
        };
      }
      const exeResolved = precheck.resolved;
      const args = action.arguments ? action.arguments.split(/\s+/).filter(Boolean) : [];
      const wd = action.workingDir?.trim() ? resolvePath(action.workingDir, libs) : path.dirname(exeResolved);
      childStarted = doSpawn(game, exeResolved, args, wd, options.track);
    } else if (action.type === "URL") {
      const url = action.path;
      if (!url) return { launched: false, error: "URL 启动指令的地址为空" };
      openUrl(url);
      childStarted = true; // URL 没有进程可监控，视为已启动
    } else {
      return { launched: false, error: `未知的启动指令类型：${action.type}` };
    }
  } else if (game.installDirectory) {
    // 没有启动动作：在安装目录里自动找 exe。
    const found = findGameExecutable(game.installDirectory);
    if (found) {
      childStarted = doSpawn(game, found.exe, [], found.wd, options.track);
    } else {
      return {
        launched: false,
        error: `未配置启动指令，且在安装目录 ${game.installDirectory} 中也找不到可执行文件`,
      };
    }
  } else {
    return { launched: false, error: "游戏未配置启动指令且没有安装目录" };
  }

  return { launched: childStarted };
}

// 真正 spawn 游戏进程，登记运行状态，监听退出写回时长。
// 返回是否成功拉起进程。
function doSpawn(game: Game, exe: string, args: string[], cwd: string, track: boolean): boolean {
  try {
    const child = spawn(exe, args, { cwd, stdio: "ignore" });
    // 游戏再次启动，清掉上次"最近退出"标记。
    lastExit.delete(game.id);
    const started = Date.now();
    if (track) {
      running.set(game.id, {
        gameId: game.id,
        gameName: game.name,
        startedAt: Math.floor(started / 1000),
        elapsedStart: started,
      });
    }
    // 监听进程退出，把运行时长写回库。
    child.on("exit", () => {
      onProcessExit(game, started);
    });
    child.on("error", (e) => {
      console.error("[process] 游戏进程启动错误:", game.name, e.message);
      onProcessExit(game, started);
    });
    return true;
  } catch (e) {
    console.error("[process] 启动游戏失败:", game.name, (e as Error).message);
    return false;
  }
}

// 进程退出回调：结算时长，写回库（最近一次会话时长 + 退出时间 + 累加 playtime）。
function onProcessExit(game: Game, started: number): void {
  const seconds = Math.max(1, Math.floor((Date.now() - started) / 1000));
  lastExit.set(game.id, seconds);
  stopTracking(game.id);
  try {
    const g = getGame(game.id);
    if (g) {
      g.lastSessionSeconds = seconds;
      g.lastSessionEndedAt = new Date().toISOString();
      g.playtime = (g.playtime || 0) + seconds;
      upsertGame(g);
    }
  } catch (e) {
    console.error("[process] 写回游戏时长失败:", e);
  }
  // 游戏退出后自动备份存档（若该游戏配置了存档路径）。
  // 这是后台异步任务，失败不打扰用户，只记日志。
  autoBackupOnExit(game);
}

// 游戏退出时自动备份存档：生成 NSIS 自解压 exe 到 <数据根>/backups/。
// 仅当游戏配了 savePaths 且本机有 NSIS 编译器时才做。fire-and-forget。
function autoBackupOnExit(game: Game): void {
  const savePaths = game.savePaths ?? [];
  if (savePaths.length === 0) return; // 没配存档路径，跳过
  if (!nsisAvailable()) {
    console.warn("[backup] 未安装 NSIS，跳过自动存档备份:", game.name);
    return;
  }
  // 后台异步执行，不阻塞退出回调
  setTimeout(() => {
    try {
      const fs = require("fs") as typeof import("fs");
      // 预检：只保留有匹配文件的路径
      const entries: NsisEntry[] = [];
      for (const sp of savePaths) {
        const col = collectSavePath(sp, getLibrariesForBackup());
        if (col.matches.length > 0) entries.push({ savePath: sp, resolved: col.resolved, collect: col });
      }
      if (entries.length === 0) return; // 没有匹配文件，跳过

      const outDir = path.join(configRoot(), "backups");
      fs.mkdirSync(outDir, { recursive: true });
      const fileName = backupFileName(game.name);
      const outFile = path.join(outDir, fileName);
      compileBackupToExe({ entries, gameName: game.name, outFile });
      console.log("[backup] 自动备份完成:", outFile);
    } catch (e) {
      console.error("[backup] 自动备份失败:", game.name, (e as Error).message);
    }
  }, 1500); // 延迟 1.5s，避免刚退出就抢文件
}

// 自动备份用的游戏库列表（从 settings 读）。已顶部导入 getLibrariesFromSettings。
function getLibrariesForBackup(): GameLibrary[] {
  try {
    return getLibrariesFromSettings();
  } catch {
    return [];
  }
}

// 手动停止追踪某游戏，返回累计秒数（若配置了退出后脚本由调用方执行）。
export function stopGameTracking(gameId: string): number {
  return stopTracking(gameId);
}

// 打开一个网址（Windows 用 start，其他平台用 xdg-open）。
function openUrl(url: string): void {
  const { spawn: sp } = require("child_process");
  if (process.platform === "win32") {
    sp("cmd", ["/C", "start", "", url]);
  } else {
    sp("xdg-open", [url]);
  }
}

// ---- 启动路径校验（移植 validation.rs）----

export interface ActionValidation {
  valid: boolean;
  resolved: string;
  reason: string;
  extension: string;
}

const EXECUTABLE_EXTS = ["exe", "bat", "cmd", "lnk", "com"];

export function validateLaunchPath(p: string, actionType: string | undefined, libs: GameLibrary[]): ActionValidation {
  if (actionType && actionType.toUpperCase() === "URL") {
    return { valid: p.trim() !== "", resolved: p, reason: "", extension: "" };
  }
  const resolved = resolvePath(p, libs);
  if (!resolved.trim()) {
    return { valid: false, resolved, reason: "路径为空", extension: "" };
  }
  const ext = path.extname(resolved).slice(1).toLowerCase();
  const fs = require("fs");
  let exists = false;
  let isDir = false;
  try {
    exists = fs.existsSync(resolved);
    isDir = fs.statSync(resolved).isDirectory();
  } catch {
    exists = false;
  }
  if (!exists) {
    return { valid: false, resolved, reason: `文件不存在：${resolved}`, extension: ext };
  }
  if (isDir) {
    return { valid: false, resolved, reason: "是目录而非可执行文件", extension: ext };
  }
  if (!EXECUTABLE_EXTS.includes(ext)) {
    return { valid: false, resolved, reason: `不是可执行文件（.exe/.bat/.cmd/.lnk/.com，当前是 .${ext}）`, extension: ext };
  }
  return { valid: true, resolved, reason: "", extension: ext };
}
