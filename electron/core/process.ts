// 游戏进程启动与运行状态追踪。
// 移植自原 Rust 的 process.rs + commands/games.rs 里的启动/监控逻辑。
//
// 用 Node 的 child_process.spawn 启动游戏进程，再监听子进程的 'exit' 事件
// 得知退出（比原 Rust 每 2 秒轮询 try_wait 更省资源、也更及时），退出时把
// 本次运行时长写回数据库。内存里维护一张"运行中游戏"表，供 running_games /
// get_run_state 查询。

import { spawn, type ChildProcess } from "child_process";
import * as path from "path";
import { defaultGameRootPath } from "./paths";
import {
  batConsoleArgs,
  resolveActionPath,
  resolvePath as resolvePathPure,
  resolveShowBatConsole,
  toCmdPath,
} from "../../shared/launchPaths";
import { getGame, upsertGame } from "./db";
import type { Game, GameAction } from "./models";
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

// ---- 路径解析 ----
//
// 规则本体（三种基准、{InstallDir} 缺失报错、词法规范化）已抽到
// shared/launchPaths.ts：零依赖纯函数、有单测（launchPaths.test.ts）、
// 并由 docs/design/launch-and-paths.md 作为权威说明。
// 这里只负责把"游戏上下文 + config.json 里的游戏根"喂给它。

// 单参数版本：基准取 config.json 的 defaultGameRootPath（相对路径的锚）。
// 2026-09-16 起不再传"游戏库列表"——库占位符随 game_libraries 一起废弃。
export function resolvePath(p: string): string {
  return resolvePathPure(p, defaultGameRootPath());
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
// 导出给 --check 自检复用（electron/core/checkMode.ts）——"动作怎么选"必须与真实启动完全一致。
export function resolveAction(game: Game, actionId?: string): GameAction | undefined {
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
    // .bat/.cmd 控制台窗口的**全局默认值**（设置界面「运行 .bat/.cmd 指令时显示控制台窗口」）。
    // 默认 false=隐藏。⚠️ 它只是默认值 —— 逐游戏配了就以逐游戏为准（见下面的归并）。
    showBatConsole?: boolean;
    // 手动指定的"计时监控 exe"：`进程名|窗口标题关键字`。设置后脚本不再以 cmd
    // 退出为计时终点，改为轮询该目标进程（见 doSpawn 说明）。
    monitorExe?: string;
  }
): LaunchResult {
  // 权限校验：用户等级必须 >= 游戏等级。
  if (!canPlay(options.userLevel, game.gameLevel)) {
    // 用户可见文案不带等级数字（前端有一模一样的提示，这里只是后端口径的兜底）
    return { launched: false, error: "需要升级为钻石版网吧（网咖）才能玩" };
  }

  // 是否显示 .bat/.cmd 控制台：逐游戏三态覆盖全局默认（库里没配 → 用全局设置）。
  // 刻意在**这一处**归并，而不是让两个调用点各自算一遍 —— 将来多一个调用点也不会漏。
  // 规则与两个会静默失效的写法见 shared/launchPaths.ts 的 resolveShowBatConsole。
  const showBatConsole = resolveShowBatConsole(game.showBatConsole, options.showBatConsole ?? false);

  // 有启动动作就按动作启动；没有则尝试在安装目录自动找 exe。
  const action = resolveAction(game, options.actionId);
  let childStarted = false;

  if (action) {
    if (action.type === "File") {
      const p = action.path || "";
      if (!p) return { launched: false, error: "启动指令路径为空" };
      const fs = require("fs");
      // 先展开 {InstallDir} 等占位符，再交给 resolvePath 解析 {游戏库名}。
      // 设计上 {InstallDir} 就该在启动时展开（见 scripts/migrate-playnite/README.md
      // 与 docs/design/data-models.md），但这里以前漏了这一步：字面的
      // "{InstallDir}\game.exe" 会被 resolvePath 当成相对路径拼到数据根上，
      // 导致所有用该占位符的游玩指令（实测 755 个）一律报"文件不存在"。
      const installDirRaw = (game.installDirectory ?? "").trim();
      // 解析后的安装目录：既用于拼相对动作路径，也用于后面的进程监控。
      const installAbs = installDirRaw ? resolvePath(expandVariables(installDirRaw, game)) : "";
      // 路径规则统一交给 shared/launchPaths.ts（纯函数 + 单测）：各基准、
      // {InstallDir} 展开、以及"需要安装目录但没配"的明确报错都在那里。
      const resolvedAction = resolveActionPath({
        actionPath: p,
        installDir: installAbs,
        gameRoot: defaultGameRootPath(),
        expand: (s) => expandVariables(s, game),
      });
      if (resolvedAction.error) return { launched: false, error: resolvedAction.error };
      const resolved = resolvedAction.path;
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
      const precheck = validateLaunchPath(exeResolved, "File");
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
      const spawned = doSpawn(game, exeResolved, args, exeDir, options.track, showBatConsole, options.monitorExe, installAbs);
      if (!spawned.ok) {
        // 把 spawn 的真实原因带出去，别再让前端只显示"未知错误"。
        return { launched: false, error: `启动进程失败：${spawned.error ?? "未知原因"}（${exeResolved}）` };
      }
      childStarted = true;
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
    // 安装目录本身可能是 {InstallDir} 写法，先展开占位符再解析。
    const installDir = resolvePath(expandVariables(game.installDirectory, game));
    const found = findGameExecutable(installDir);
    if (found) {
      const spawned = doSpawn(game, found.exe, [], found.wd, options.track, showBatConsole, options.monitorExe, installDir);
      if (!spawned.ok) {
        return { launched: false, error: `启动进程失败：${spawned.error ?? "未知原因"}（${found.exe}）` };
      }
      childStarted = true;
    } else {
      return {
        launched: false,
        error: `未配置启动指令，且在安装目录 ${installDir} 中也找不到可执行文件`,
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
function doSpawn(game: Game, exe: string, args: string[], cwd: string, track: boolean, showBatConsole?: boolean, monitorExe?: string, installDirAbs?: string): { ok: boolean; error?: string } {
  try {
    // .bat/.cmd 作为游戏指令调用时的两种形态：
    //   显示控制台（showBatConsole=true）：网吧脚本基本都带菜单（选单人/联机），
    //     必须让玩家看到并操作那个窗口。
    //   隐藏（false）：幕后执行，多见于纯启动包装脚本。
    // 真 exe（游戏主程序）正常显示窗口，不受本开关影响。
    const isScript = /\.(bat|cmd)$/i.test(exe);
    const isWin = process.platform === "win32";
    const wantConsole = isScript && !!showBatConsole;

    let child;
    if (isScript && isWin && wantConsole) {
      // 要显示窗口：参数由纯函数 batConsoleArgs 拼（规则与实测记录在
      // shared/launchPaths.ts / docs/design/launch-and-paths.md §5）。
      // 关键一条：**`start` 里还要再套一层 `cmd /c`** —— `start` 对 .bat 是用
      // `cmd /K` 跑的，脚本结束后那个 shell 不退，控制台窗口会卡住、外层 `/wait`
      // 也永远不返回（2026-09-14 用户报"退出游戏后窗口不关"就是这个）。
      // 外层 cmd 自己隐藏（windowsHide: true），免得再多出一个空白控制台窗口。
      const comspec = process.env.ComSpec || "cmd.exe";
      child = spawn(comspec, batConsoleArgs(comspec, exe, args), {
        cwd,
        stdio: "ignore",
        windowsHide: true,
      });
    } else if (isScript && isWin) {
      // 幕后执行：Windows 上 Node 不能直接 spawn .bat/.cmd —— CreateProcess 不认
      // 脚本文件，会抛 EINVAL（实测所有用 bat 启动的游戏都卡在这里）。必须经
      // cmd.exe：用 shell: true 让 Node 走 `cmd.exe /d /s /c "..."`，并把脚本路径
      // 自带引号，避免路径含空格时被 cmd 拆成多个参数。
      child = spawn(`"${toCmdPath(exe)}"`, args, {
        cwd,
        stdio: "ignore",
        windowsHide: true,
        shell: true,
      });
    } else {
      child = spawn(exe, args, { cwd, stdio: "ignore" });
    }
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

    child.on("error", (e) => {
      console.error("[process] 游戏进程启动错误:", game.name, e.message);
      onProcessExit(game, started);
    });

    // ---- 计时（进程监控）策略，对齐 Playnite ----
    //   1) 有安装目录（且没手工配 monitorExe）→ 组合监控：
    //      启动器进程 或 安装目录内进程 任一还活着，就算在运行。
    //      这样"关掉 bat 的控制台窗口"不会被误判成游戏退出。
    //   2) 手工配了 monitorExe → 脚本退出后轮询该进程（历史行为，逐游戏可覆盖）。
    //   3) 都没有 → 启动器进程退出即结算（旧行为）。
    if (track && isWin && !monitorExe && installDirAbs) {
      startCombinedPolling(game, started, child, installDirAbs);
      return { ok: true };
    }

    const useMonitor = isScript && !!monitorExe && isWin;
    child.on("exit", () => {
      if (!useMonitor || !track) {
        onProcessExit(game, started);
        return;
      }
      // 脚本已退出，但需要监控的目标进程可能还在（start 启动的游戏）。轮询它。
      startMonitorPolling(game, started, monitorExe!);
    });
    return { ok: true };
  } catch (e) {
    const message = (e as Error).message;
    console.error("[process] 启动游戏失败:", game.name, message);
    return { ok: false, error: message };
  }
}

// ---- 组合进程监控（对齐 Playnite 的进程监控思路）----
//
// 为什么需要：用 .bat 启动时，cmd.exe 只是"启动器"，真正的游戏是它拉起的另一个
// 进程。只监听启动器的 exit，会在"玩家关掉控制台窗口"时误判成游戏退出（计时中断）。
// Playnite 默认用 MonitorProcessTree（启动进程 + 全部子孙都退出才算退出）；在 Node
// 里拿进程父子关系要走 WMI、还可能因权限读不到，所以这里用等价的、不需要提权的做法：
//   启动器进程还活着                        → 仍在运行（bat 菜单阶段 / start 之前）
//   或安装目录下任一 .exe 对应的进程在运行   → 仍在运行（游戏本体）
// 两者都不成立才算退出。进程名用 tasklist 一次取全量（Playnite MonitorProcessNames）。

// 安装目录 → 目录下所有 exe 文件名（小写）。按目录缓存，避免反复扫盘。
const exeNameCache = new Map<string, string[]>();

function installDirExeNames(dir: string): string[] {
  const cached = exeNameCache.get(dir);
  if (cached) return cached;
  const nodeFs = require("fs");
  const names = new Set<string>();
  const walk = (d: string, depth: number): void => {
    if (depth > 4 || names.size > 400) return;
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try {
      entries = nodeFs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) walk(path.join(d, e.name), depth + 1);
      else if (/\.exe$/i.test(e.name)) names.add(e.name.toLowerCase());
    }
  };
  walk(dir, 0);
  const list = [...names];
  exeNameCache.set(dir, list);
  return list;
}

// 一次 tasklist 拿到所有运行中进程的映像名（小写）。失败返回 null。
function runningImageNames(): Set<string> | null {
  try {
    const { execSync } = require("child_process");
    const text: string = execSync("tasklist /fo csv /nh", {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    const out = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const m = /^"([^"]+)"/.exec(line);
      if (m) out.add(m[1].toLowerCase());
    }
    return out;
  } catch {
    // 拿不到进程列表（极少见）：让调用方保守处理，宁可多算也别误判退出。
    return null;
  }
}

// 安装目录里的 exe 是否有任意一个正在运行。
function isAnyInstallExeRunning(exeNames: string[]): boolean {
  const procs = runningImageNames();
  if (procs === null) return true; // 查询失败：保守当作还在运行
  return exeNames.some((n) => procs.has(n));
}

// 组合轮询：启动器进程与安装目录内进程都不在了，才判定游戏退出。
function startCombinedPolling(game: Game, started: number, child: ChildProcess, installDir: string): void {
  const exeNames = installDirExeNames(installDir);
  let launcherAlive = true;
  child.on("exit", () => {
    launcherAlive = false;
  });
  const timer = setInterval(() => {
    // 已被其它路径结算（例如手动停止游戏）：收工。
    if (!running.has(game.id)) {
      clearInterval(timer);
      return;
    }
    if (launcherAlive) return;
    if (exeNames.length > 0 && isAnyInstallExeRunning(exeNames)) return;
    clearInterval(timer);
    onProcessExit(game, started);
  }, 3000);
  // 不让定时器阻止进程退出。
  if (typeof timer.unref === "function") timer.unref();
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

export function validateLaunchPath(p: string, actionType: string | undefined): ActionValidation {
  if (actionType && actionType.toUpperCase() === "URL") {
    return { valid: p.trim() !== "", resolved: p, reason: "", extension: "" };
  }
  const resolved = resolvePath(p);
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
