// 自检（`--check` 模式）的**规则层**：纯函数，不 import electron、不碰 fs。
//
// 检查两件事（需求原话）：
//   1) 每个游戏，action 指定的启动项不存在；
//   2) 每个游戏，savePaths 不存在。
//
// ⚠️ 判据**必须与真实启动链路共用同一份实现**，理由是本仓库真实踩过的坑：
//    `scripts/migrate-playnite/README.md` 写着 `{InstallDir}` 启动时会展开，而代码里从没展开过
//    —— 755 个游戏的启动全是坏的，靠人肉排查才发现。所以这里**不许**自己重写一遍路径规则：
//    路径解析（shared/launchPaths.resolveActionPath）、存在性/可执行校验（process.validateLaunchPath）、
//    动作选择（process.resolveAction）、自动找 exe（process.findGameExecutable）全部由调用方
//    注入**生产函数**（见 electron/core/checkMode.ts）。本文件只负责组织判据、产出可读清单。
//
// 副作用（判存在、列目录）同样走注入，于是本文件能被单测完全覆盖（launchCheck.test.ts）。

import { resolveActionPath, resolvePath, normalizePath } from "../../shared/launchPaths";
import type { Game, GameAction } from "./models";

export type FindingKind =
  | "no-play-action" // 没有任何可用启动项
  | "action-resolve-error" // 启动项解析失败（如需要 {InstallDir} 但没配安装目录）
  | "action-missing" // 解析出来了，但目标不存在 / 不是可执行文件
  | "action-unknown-type" // 启动项类型不认识（只支持 File / URL）
  | "save-path-missing" // 存档路径（目录或具体文件）不存在
  | "save-no-match"; // 存档目录在，但通配符一个文件都没匹配到

export const KIND_LABEL: Record<FindingKind, string> = {
  "no-play-action": "没有可用启动项",
  "action-resolve-error": "启动项无法解析",
  "action-missing": "启动项目标不存在",
  "action-unknown-type": "启动项类型不支持",
  "save-path-missing": "存档路径不存在",
  "save-no-match": "存档路径无匹配文件",
};

export interface Finding {
  gameId: string;
  gameName: string;
  kind: FindingKind;
  /** 一行说明（含解析后的绝对路径，便于直接复制去核） */
  detail: string;
}

export interface CheckSummary {
  /** 检查了多少个游戏 */
  checked: number;
  findings: Finding[];
  counts: Record<FindingKind, number>;
}

/** 注入的生产函数（checkMode.ts 传真实的那些，单测传假的）。 */
export interface CheckDeps {
  /** config.json 的 defaultGameRootPath（相对路径的基准） */
  gameRoot: string;
  /** 占位符展开（{InstallDir}/{GameName}/…）——生产传 scriptRunner.expandVariables */
  expandVariables: (s: string, game: Game) => string;
  /** 选游玩动作（actionId → playTask → isPlayAction）——生产传 process.resolveAction */
  resolveAction: (game: Game) => GameAction | undefined;
  /** 启动前检测（存在 + 可执行）——生产传 process.validateLaunchPath */
  validateAction: (
    p: string,
    actionType: string | undefined,
  ) => { valid: boolean; resolved: string; reason: string };
  /** 在目录里找一个可执行文件——生产传 process.findGameExecutable */
  findExecutable: (dir: string) => { exe: string } | null;
  exists: (p: string) => boolean;
  isDir: (p: string) => boolean;
  /** 列目录；失败返回 null（无权限 / 不存在） */
  listDir: (p: string) => string[] | null;
}

export function emptyCounts(): Record<FindingKind, number> {
  return {
    "no-play-action": 0,
    "action-resolve-error": 0,
    "action-missing": 0,
    "action-unknown-type": 0,
    "save-path-missing": 0,
    "save-no-match": 0,
  };
}

/**
 * Windows 风格的单文件名通配匹配（`*` / `?`），与备份工具 FindFirstFile 的用法对齐。
 *
 * ⚠️ `*.*` 特例不能省：Windows 的 FindFirstFile 里 `*.*` 匹配**所有**文件，
 * 包括没有扩展名的（如 `save1`、`profile`）—— 按正则字面翻译会漏掉它们，
 * 把"其实有存档"报成"没匹配到"。本仓库的存档路径绝大多数就是 `*.*`（见 dev-data/library-json/games.json 的 save_paths）。
 */
export function matchWildcard(name: string, pattern: string): boolean {
  const raw = (pattern ?? "").trim();
  if (!raw) return false;
  if (raw === "*" || raw === "*.*") return true;
  const escaped = raw.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + escaped.replace(/\*/g, "[^\\\\/]*").replace(/\?/g, "[^\\\\/]") + "$", "i");
  return re.test(name);
}

/** 检查一个游戏，返回它的问题清单（空数组 = 没问题）。 */
export function checkGame(game: Game, deps: CheckDeps): Finding[] {
  const out: Finding[] = [];
  const push = (kind: FindingKind, detail: string) =>
    out.push({ gameId: game.id, gameName: game.name, kind, detail });
  const expand = (s: string) => deps.expandVariables(s, game);
  const installRaw = (game.installDirectory ?? "").trim();

  // ---- 1) 启动项 ----
  const action = deps.resolveAction(game);
  if (!action) {
    // 与 launchGame 的真实行为一致：没有动作时会去安装目录里自动找 exe。
    if (!installRaw) {
      push("no-play-action", "游戏未配置启动指令且没有安装目录");
    } else {
      const installAbs = resolvePath(expand(installRaw), deps.gameRoot);
      if (!deps.findExecutable(installAbs)) {
        push("no-play-action", `未配置启动指令，且在安装目录 ${installAbs} 中也找不到可执行文件`);
      }
    }
  } else if (action.type === "URL") {
    // URL 启动没有本地文件可查，不算问题（与 launchGame 的行为一致）。
  } else if (action.type !== "File") {
    push("action-unknown-type", `启动项类型 ${String(action.type)} 不认识（只支持 File / URL）`);
  } else {
    const installAbs = installRaw ? resolvePath(expand(installRaw), deps.gameRoot) : "";
    const resolvedAction = resolveActionPath({
      actionPath: action.path || "",
      installDir: installAbs,
      gameRoot: deps.gameRoot,
      expand,
    });
    if (resolvedAction.error) {
      push("action-resolve-error", `${resolvedAction.error}（原始路径：${action.path || "(空)"}）`);
    } else {
      let target = resolvedAction.path;
      // 与 launchGame 一致：path 可能配成目录，这时要在里面自动找一个可执行文件。
      if (deps.isDir(target)) {
        const found = deps.findExecutable(target);
        if (!found) {
          push("action-missing", `启动目录里找不到可执行文件：${target}`);
          target = "";
        } else {
          target = found.exe;
        }
      }
      if (target) {
        const v = deps.validateAction(target, "File");
        if (!v.valid) {
          push("action-missing", `启动前检测未通过：${v.reason}（解析路径：${v.resolved || target}）`);
        }
      }
    }
  }

  // ---- 2) 存档路径 ----
  for (const sp of game.savePaths ?? []) {
    const raw = (sp ?? "").trim();
    if (!raw) continue;
    // ⚠️ 与真实备份链路完全一致：只用 resolvePath，**不做** {InstallDir} 展开
    // —— 自检要回答的是"用户点备份时会不会成功"，不是"理想情况下应该是什么路径"。
    // 见 electron/ipc/saveManager.ts 的 backupGameSaveNow。
    const abs = normalizePath(resolvePath(raw, deps.gameRoot));
    const cut = abs.lastIndexOf("/");
    const dir = cut > 0 ? abs.slice(0, cut) : abs;
    const leaf = cut > 0 ? abs.slice(cut + 1) : "";

    if (!leaf || !/[*?]/.test(leaf)) {
      // 具体文件（或整条就是目录）：看它在不在。
      if (!deps.exists(abs)) push("save-path-missing", abs);
      continue;
    }
    if (!deps.isDir(dir)) {
      push("save-path-missing", `${abs}（目录不存在：${dir}）`);
      continue;
    }
    const names = deps.listDir(dir);
    if (!names || !names.some((n) => matchWildcard(n, leaf))) {
      push("save-no-match", `${abs}（目录存在，但没有匹配的文件）`);
    }
  }

  return out;
}

/**
 * 启动项相关的 finding kind —— 只有这几类会让"点开始游戏"起不来。
 *
 * 存档路径那两类（save-path-missing / save-no-match）**不属于启动问题**：
 * 它们影响的是"备份存档"，没有它们游戏照样能开。点「开始游戏」时不该被它们拦下。
 */
export const LAUNCH_KINDS: readonly FindingKind[] = [
  "no-play-action",
  "action-resolve-error",
  "action-missing",
  "action-unknown-type",
];

/**
 * 只回答一个问题：**这个游戏在当前这台机器上点「开始游戏」能不能起来**。
 *
 * 返回第一个启动项问题；返回 undefined = 能起来。
 *
 * 为什么复用 checkGame 而不是另写一套判据：它必须与"上线前体检"（`exe --check`）
 * 完全一致 —— 否则会出现"体检说没问题、点了却起不来"这种最坏情况（本仓库真踩过：
 * `{InstallDir}` 没展开，755 个游戏全坏）。这里只是把存档路径那部分滤掉。
 */
export function checkLaunchAction(game: Game, deps: CheckDeps): Finding | undefined {
  return checkGame(game, deps).find((f) => LAUNCH_KINDS.includes(f.kind));
}

/** 检查一批游戏，汇总。 */
export function checkGames(games: readonly Game[], deps: CheckDeps): CheckSummary {
  const findings: Finding[] = [];
  for (const g of games) findings.push(...checkGame(g, deps));
  const counts = emptyCounts();
  for (const f of findings) counts[f.kind]++;
  return { checked: games.length, findings, counts };
}
