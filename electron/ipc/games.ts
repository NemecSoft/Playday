// 游戏库相关 IPC 命令（Task 3 + Task 5）：覆盖原 Rust 的 games.rs / library.rs / plugins.rs / settings.rs。
// 命令名与 Tauri 版本 1:1 对齐，前端 api/client.ts 调用时不用改。

import { ipcMain } from "electron";
import * as path from "path";
import {
  getGames,
  getGame,
  upsertGame,
  deleteGame,
  updateGamePlaytime,
  updateGameLastSession,
  setGameFavorite,
  setGameHidden,
  libraryStats,
  getGameLibraries,
  upsertGameLibrary,
  deleteGameLibrary,
} from "../core/db";
import { readSettings, writeSettings, getLibraries } from "../core/settings";
import { applyCoversToLibrary } from "../core/covers";
import {
  launchGame,
  isGameRunning,
  runningGames,
  stopGameTracking,
  elapsedSeconds,
  lastExitSeconds,
  validateLaunchPath,
} from "../core/process";
import { expandVariables, runScript } from "../core/scriptRunner";
import type { AppSettings, DeepPartial, Game, GameLibrary } from "../core/models";
import { registerCommand } from "./registry";

export function registerGamesIpc(ipc: typeof ipcMain) {
  // ---------- 游戏 ----------
  registerCommand(ipc, "get_games", async () => {
    // 库为空就返回空列表，前端会显示"没有游戏"的占位提示；不塞示例数据。
    // 自动给游戏套封面（空封面/封面文件丢失的重新匹配 CoverImages 目录，只算不落库）。
    const { games } = applyCoversToLibrary();
    return games;
  });

  // 中间件按 field="id" 自动解包：兼容前端对象包装 { id } 和 spread 传字符串。
  registerCommand(ipc, "get_game", async ({ id }: { id?: string }) => getGame(id ?? ""), {
    field: "id",
  });

  registerCommand(ipc, "upsert_game", async (a: Game | { game: Game }) => {
    // 兼容两种：直接传 Game 对象，或前端对象包装 { game }
    const game = a && "game" in a ? a.game : a;
    upsertGame(game);
    return true;
  });

  registerCommand(ipc, "delete_game", async ({ id }: { id?: string }) => {
    deleteGame(id ?? "");
    return true;
  }, {
    field: "id",
  });

  ipc.handle(
    "update_game_playtime",
    async (_e, a: string | { id: string; playtime: number; lastPlayed?: string }, b?: number, c?: string) => {
      const id = typeof a === "string" ? a : a?.id ?? "";
      const playtime = typeof a === "string" ? b ?? 0 : a?.playtime ?? 0;
      const lastPlayed = typeof a === "string" ? c : a?.lastPlayed;
      updateGamePlaytime(id, playtime, lastPlayed);
      return true;
    }
  );

  ipc.handle(
    "update_game_last_session",
    async (_e, a: string | { id: string; seconds: number; endedAt?: string }, b?: number, c?: string) => {
      const id = typeof a === "string" ? a : a?.id ?? "";
      const seconds = typeof a === "string" ? b ?? 0 : a?.seconds ?? 0;
      const endedAt = typeof a === "string" ? c : a?.endedAt;
      updateGameLastSession(id, seconds, endedAt);
      return true;
    }
  );

  ipc.handle(
    "set_game_favorite",
    async (_e, a: string | { id: string; favorite: boolean }, b?: boolean) => {
      const id = typeof a === "string" ? a : a?.id ?? "";
      const favorite = typeof a === "string" ? b ?? false : a?.favorite ?? false;
      setGameFavorite(id, favorite);
      return true;
    }
  );

  ipc.handle(
    "set_game_hidden",
    async (_e, a: string | { id: string; hidden: boolean }, b?: boolean) => {
      const id = typeof a === "string" ? a : a?.id ?? "";
      const hidden = typeof a === "string" ? b ?? false : a?.hidden ?? false;
      setGameHidden(id, hidden);
      return true;
    }
  );

  // 启动游戏。中间件统一解包 { id, actionId }，并开启耗时日志（启动是慢操作）。
  // 说明：真正权限校验（用户等级 vs 游戏等级）在 launchGame 内部做，
  //      这里不再重复，保持单点校验，避免逻辑分散。
  registerCommand(
    ipc,
    "launch_game",
    async (args: { id?: string; actionId?: string | null }) => {
      const id = args?.id ?? "";
      const actionId = args?.actionId ?? undefined;
      const game = getGame(id);
      if (!game) return { launched: false, error: `游戏不存在：${id}` };
      const settings = readSettings();
      // 执行启动前脚本（变量展开后同步跑完，失败也继续）。
      if (game.preLaunchEnabled && game.preLaunchScript) {
        runScript(expandVariables(game.preLaunchScript, game), game.installDirectory);
      }
      const result = launchGame(game, {
        actionId,
        userLevel: settings.currentUserLevel,
        track: settings.trackPlaytime,
        gameLibraries: getLibraries(),
        showBatConsole: settings.showBatConsole,
        monitorExe: game.monitorExe,
      });
      // 启动成功后再执行启动后脚本（异步）。
      if (result.launched && game.postLaunchEnabled && game.postLaunchScript) {
        runScript(expandVariables(game.postLaunchScript, game), game.installDirectory);
      }
      return result;
    },
    { field: "id", log: true }
  );

  // 用指定路径直接启动游戏文件（不走动作解析，供"以文件方式启动"场景）。
  registerCommand(
    ipc,
    "launch_game_path",
    async (args: { id?: string; path?: string }) => {
      const id = args?.id ?? "";
      const p = args?.path ?? "";
      const game = getGame(id);
      if (!game) return { launched: false, error: `游戏不存在：${id}` };
      const settings = readSettings();
      // 把相对路径/占位符解析成绝对路径，再当成一个临时 File 动作启动。
      const { resolvePath } = await import("../core/process");
      const resolved = resolvePath(p, getLibraries());
      const precheck = validateLaunchPath(resolved, "File", getLibraries());
      if (!precheck.valid) {
        return { launched: false, error: `启动前检测未通过：${precheck.reason}` };
      }
      const tmpAction = { id: "tmp", name: "Play", type: "File" as const, path: resolved, isPlayAction: true, trackGame: true };
      const result = launchGame({ ...game, actions: [tmpAction], playTask: "tmp" }, {
        actionId: "tmp",
        userLevel: settings.currentUserLevel,
        track: settings.trackPlaytime,
        gameLibraries: getLibraries(),
        showBatConsole: settings.showBatConsole,
        monitorExe: game.monitorExe,
      });
      return result;
    },
    { field: "id", log: true }
  );

  registerCommand(ipc, "is_game_running", async ({ id }: { id?: string }) => {
    return isGameRunning(id ?? "");
  }, { field: "id" });

  registerCommand(ipc, "stop_game", async ({ id }: { id?: string }) => {
    const gid = id ?? "";
    // 手动停止追踪（结算时长），并执行退出后脚本。
    const game = getGame(gid);
    if (game && game.postExitEnabled && game.postExitScript) {
      runScript(expandVariables(game.postExitScript, game), game.installDirectory);
    }
    return stopGameTracking(gid);
  }, { field: "id" });

  // ---------- 库统计 ----------
  registerCommand(ipc, "library_stats", async () => {
    return libraryStats();
  });

  // ---------- 游戏库（按根目录组织） ----------
  registerCommand(ipc, "get_game_libraries", async () => {
    return getGameLibraries();
  });

  registerCommand(ipc, "upsert_game_library", async (lib: GameLibrary) => {
    // 游戏库是"数据"，权威存数据库 game_libraries 表，config.json 不再写（历史双写已去掉）。
    upsertGameLibrary(lib);
    return true;
  });

  // 用 field="id" 解包：兼容对象包装 { id } 和 spread 传字符串，避免参数错位。
  registerCommand(ipc, "delete_game_library", async ({ id }: { id?: string }) => {
    deleteGameLibrary(id ?? "");
    return true;
  }, { field: "id" });

  // ---------- 平台 / 库插件 ----------
  registerCommand(ipc, "get_platforms", async () => {
    // TODO(Task: covers): 平台表已迁移，这里直接查库。先返回空（封面匹配会用到）。
    return [];
  });

  registerCommand(ipc, "get_library_plugins", async () => {
    // TODO(Task: library 插件): 返回已注册库插件（如 Steam/Origin 概念）。先返回空。
    return [];
  });

  // ---------- 设置 ----------
  registerCommand(ipc, "get_settings", async () => {
    return readSettings();
  });

  registerCommand(ipc, "save_settings", async (patch: Partial<AppSettings>) => {
    // 安全：这些"会话/登录态"字段只能由 auth 流程（login/logout/resolve_enterprise）
    // 写入，绝不能信任渲染进程通过 save_settings 伪造。这里直接剥离，防止
    // 前端把自己改成"已登录 / 等级3全权限"绕过权限控制。
    const SECURE_KEYS = new Set([
      "loggedIn",
      "username",
      "password",
      "currentUserKind",
      "currentUserName",
      "currentUserAccount",
      "currentUserLevel",
    ]);
    const safePatch: DeepPartial<AppSettings> = {};
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (!SECURE_KEYS.has(k)) {
        (safePatch as Record<string, unknown>)[k] = v;
      }
    }
    return writeSettings(safePatch);
  });

  // 说明：原 get_config_dir（返回数据根目录）已删除——名字与实际含义不符
  // （它返回的是数据根而不是配置目录），且全项目没有任何调用方。

  // ---------- 运行状态（Task 5） ----------
  // 运行中的游戏列表（前端顶部/详情页展示）。
  registerCommand(ipc, "running_games", async () => {
    return runningGames();
  });

  // 查询某游戏的运行状态（详情页进入时轮询）。三种状态：
  //   running：正在运行，elapsedSec 为已运行秒数（前端实时计时）。
  //   stopped：本会话内退出过一次，lastSessionSec 为最近一次运行时长。
  //   never：从没运行过。
  registerCommand(ipc, "get_run_state", async ({ gameId }: { gameId?: string }) => {
    const id = gameId ?? "";
    const g = getGame(id);
    const persistedLast = g?.lastSessionSeconds ?? 0;
    if (isGameRunning(id)) {
      return { state: "running", elapsedSec: elapsedSeconds(id), lastSessionSec: persistedLast };
    }
    const last = lastExitSeconds(id);
    if (last > 0) {
      return { state: "stopped", elapsedSec: 0, lastSessionSec: Math.max(last, persistedLast) };
    }
    if (persistedLast > 0) {
      return { state: "stopped", elapsedSec: 0, lastSessionSec: persistedLast };
    }
    return { state: "never", elapsedSec: 0, lastSessionSec: 0 };
  });

  // 管理端"测试脚本"：不启动游戏，只执行传入脚本并返回每行结果。
  // 工作目录优先级：游戏所属游戏库根目录 → 安装目录 → 应用目录。
  // 入参兼容两种风格：spread (script, gameId)，或对象包装 { script, gameId }（管理端前端用）。
  ipc.handle(
    "test_script",
    async (_e, a: string | { script: string; gameId?: string | null }, b?: string) => {
      const script = typeof a === "string" ? a : a?.script ?? "";
      const gameId = typeof a === "string" ? b : a?.gameId ?? undefined;
    let cwd: string | undefined;
    if (gameId) {
      const game = getGame(gameId);
      const libs = getLibraries();
      // 脚本统一在"安装目录"执行（game.installDirectory，如 {Gamelibrary1}\game1），
      // 而不是 exe 所在目录（可能是 bin 子目录）。很多游戏（尤其网吧联机版）需要在
      // 安装目录跑一个启动脚本，脚本 cwd 应与安装目录一致，与 exe 的 cwd 无关。
      cwd = game?.installDirectory || undefined;
    }
    return runScript(script, cwd);
  });
}
