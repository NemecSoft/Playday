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
import { canPlay } from "./auth";

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

// 权限检查统一走 auth.canPlay（单一数据源，避免与 auth.ts 重复实现）。

// ---- 启动主入口 ----

export interface LaunchResult {
  launched: boolean;
  error?: string;
}

// 启动游戏。userLevel 用于权限校验；track 是否累计时长。
export function launchGame(
  game: Game,
  options: {
    actionId?: string;
    userLevel: number;
    track: boolean;
    gameLibraries: GameLibrary[];
    // 是否显示 .bat/.cmd 脚本的控制台窗口。默认 false=隐藏。
    showBatConsole?: boolean;
    // 手动指定的"计时监控 exe"：`进程名|窗口标题关键字`。设置后脚本不再以 cmd
    // 退出为计时终点，改为轮询该目标进程（见 doSpawn 说明）。
    monitorExe?: string;
  }
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
      const p = action.path || "";
      if (!p) return { launched: false, error: "启动指令路径为空" };
      const fs = require("fs");
      const resolved = resolvePath(p, libs);
      // path 可能是目录（如安装目录），也可能是 exe 文件。若是目录，自动在其中找
      // 真正的可执行文件（兼容 path 配成目录的情况），并让工作目录跟随该 exe。
      let exeResolved = resolved;
      let exeDir = "";
      try {
        if (fs.statSync(resolved).isDirectory()) {
          const found = findGameExecutable(resolved);
          if (!found) {
            return { launched: false, error: `启动目录中找不到可执行文件：${resolved}` };
          }
          exeResolved = found.exe;
          exeDir = found.wd; // findGameExecutable 返回 exe 所在目录作为工作目录
        }
      } catch {
        /* 路径不存在等情况交给下面的 validateLaunchPath 报具体错误 */
      }
      if (!exeDir) exeDir = path.dirname(exeResolved);
      // 运行前检测：目标必须存在且是可执行文件。
      const precheck = validateLaunchPath(exeResolved, "File", libs);
      if (!precheck.valid) {
        return {
          launched: false,
          error: `启动前检测未通过：${precheck.reason}（解析路径：${precheck.resolved}）`,
        };
      }
      const args = action.arguments ? action.arguments.split(/\s+/).filter(Boolean) : [];
      // 工作目录：永远 = exe 所在目录（自动切过去）。不再使用 action.workingDir 字段
      // （用户决定不用这个数据，cwd 统一跟随 exe）。脚本需要安装目录时由脚本系统
      // 用 install_directory 单独指定，与 exe 的 cwd 无关。
      childStarted = doSpawn(game, exeResolved, args, exeDir, options.track, options.showBatConsole, options.monitorExe);
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
      childStarted = doSpawn(game, found.exe, [], found.wd, options.track, options.showBatConsole, options.monitorExe);
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
// monitorExe 传 `进程名|窗口标题关键字`（如 `dotnet.exe|泰拉瑞亚`）时，说明该游戏用
// bat 脚本且脚本内部用 start 启动游戏后自身会提前退出——这时不能以 cmd 退出为计时
// 终点（否则时长只算脚本那几秒）。改为：cmd 退出后继续每隔 3 秒用 tasklist /v 轮询
// 目标进程（按进程名 + 可选窗口标题关键字判断），直到目标进程消失才结算时长。
function doSpawn(game: Game, exe: string, args: string[], cwd: string, track: boolean, showBatConsole?: boolean, monitorExe?: string): boolean {
  try {
    // .bat/.cmd 作为游戏指令调用时，默认会弹出一个控制台黑窗（cmd.exe 的子窗口）。
    // 默认隐藏（showBatConsole=false），符合多数玩家的幕后执行需求；
    // 用户可在"设置-通用"里打开 showBatConsole，则 .bat/.cmd 显示控制台窗口
    // （方便看脚本提示/进度）。真 exe（游戏主程序）正常显示窗口不受影响。
    // windowsHide 是 Windows 专属选项，非 Windows 平台自动忽略，跨平台写安全。
    const isScript = /\.(bat|cmd)$/i.test(exe);
    const child = spawn(exe, args, {
      cwd,
      stdio: "ignore",
      windowsHide: isScript && !showBatConsole,
    });
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

    // 是否启用"额外监控 exe"计时：只有脚本(bat/cmd)才可能提前退出，真 exe 不需要。
    const useMonitor = isScript && !!monitorExe && process.platform === "win32";

    // cmd 退出后的结算逻辑。若启用了 monitorExe，则等到目标进程消失才真正结算。
    const onCmdExit = () => {
      if (!useMonitor || !track) {
        onProcessExit(game, started);
        return;
      }
      // 脚本已退出，但需要监控的目标进程可能还在（start 启动的游戏）。轮询它。
      startMonitorPolling(game, started, monitorExe!);
    };

    // 监听进程退出，把运行时长写回库。
    child.on("exit", onCmdExit);
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

// 解析 monitorExe 字符串，得到进程名和可选的窗口标题关键字。
function parseMonitorExe(monitorExe: string): { image: string; title: string } {
  // 格式：`进程名|窗口标题关键字`。只处理一个 |；多个取第一个 |。
  const idx = monitorExe.indexOf("|");
  if (idx >= 0) {
    return {
      image: monitorExe.slice(0, idx).trim(),
      title: monitorExe.slice(idx + 1).trim(),
    };
  }
  return { image: monitorExe.trim(), title: "" };
}

// 用 tasklist /v 检查目标进程（进程名 + 可选窗口标题关键字）是否还在运行。
function isMonitorTargetRunning(image: string, title: string): boolean {
  try {
    const cp = require("child_process");
    const { execSync } = cp;
    // /v 输出才含窗口标题（Window Title 列）；/fo csv 方便解析。
    let out = "";
    try {
      out = execSync(`tasklist /v /fo csv /fi "imagename eq ${image}"`, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      });
    } catch {
      // tasklist 出错或没找到进程（非零退出码）都视为"没匹配到"，返回 false。
      return false;
    }
    // 没有窗口标题过滤：进程名存在即可。
    if (!title) return out.includes(image.toLowerCase());
    // 有窗口标题过滤：任意一行的"窗口标题"列含关键字就算在运行（与 bat 的 findstr 一致）。
    const lines = out.split(/\r?\n/);
    for (const line of lines) {
      if (line.toLowerCase().includes(image.toLowerCase()) && line.toLowerCase().includes(title.toLowerCase())) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// 轮询监控目标进程，直到它消失才结算时长。只对启用了 monitorExe 的脚本调用。
function startMonitorPolling(game: Game, started: number, monitorExe: string): void {
  const { image, title } = parseMonitorExe(monitorExe);
  if (!image) {
    // 没填进程名：退化为脚本退出即结算，别卡住。
    onProcessExit(game, started);
    return;
  }
  // 先延迟一小段（等脚本真正把游戏拉起来），再开始轮询。
  const timer = setInterval(() => {
    if (isMonitorTargetRunning(image, title)) {
      return; // 目标进程还在，继续等
    }
    clearInterval(timer);
    // 目标进程已消失：结算时长。
    onProcessExit(game, started);
  }, 3000);
  // 不让定时器阻止进程退出。
  if (typeof timer.unref === "function") timer.unref();
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
  // 游戏退出后【不自动备份】存档——改为通知前端弹"是否备份存档"的确认框，
  // 由用户决定要不要备份。原因：游戏中直接自动备份可能因存档文件被游戏进程
  // 锁定而失败；退出时让用户确认也更符合预期（避免每次都生成 exe 垃圾文件）。
  notifyGameExit(game);
}

// —— 游戏退出事件订阅器 ——
// core 层不依赖 electron，无法直接向渲染进程发消息。这里暴露一个订阅器，
// 由 ipc 层（能拿到 BrowserWindow）注册回调，游戏退出时把信息推给前端。
type GameExitListener = (payload: { gameId: string; gameName: string; hasSavePaths: boolean }) => void;
const gameExitListeners: GameExitListener[] = [];

export function subscribeGameExit(fn: GameExitListener): void {
  gameExitListeners.push(fn);
}

// 通知所有订阅者：某游戏刚退出（携带是否有存档路径，前端据此决定要不要提示）。
function notifyGameExit(game: Game): void {
  const hasSavePaths = (game.savePaths ?? []).length > 0;
  for (const fn of gameExitListeners) {
    try {
      fn({ gameId: game.id, gameName: game.name, hasSavePaths });
    } catch (e) {
      console.error("[process] 通知游戏退出失败:", game.name, (e as Error).message);
    }
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
