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
import { autoTagsFor } from "../core/tags";
import { applyCoversToDb } from "../core/covers";
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
import type { AppSettings, Game, GameLibrary } from "../core/models";

export function registerGamesIpc(ipc: typeof ipcMain) {
  // ---------- 游戏 ----------
  ipc.handle("get_games", async () => {
    // 库为空就返回空列表，前端会显示"没有游戏"的占位提示；不塞示例数据。
    // 自动给游戏套封面（空封面/封面文件丢失的重新匹配 CoverImages 目录）。
    const { games } = applyCoversToDb();
    return games;
  });

  ipc.handle("get_game", async (_e, a: string | { id: string }) => {
    const id = typeof a === "string" ? a : a?.id ?? "";
    return getGame(id);
  });

  ipc.handle("upsert_game", async (_e, a: Game | { game: Game }) => {
    // 兼容两种：直接传 Game 对象，或前端对象包装 { game }
    const game = a && "game" in a ? a.game : a;
    upsertGame(game);
    return true;
  });

  ipc.handle("delete_game", async (_e, a: string | { id: string }) => {
    const id = typeof a === "string" ? a : a?.id ?? "";
    deleteGame(id);
    return true;
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

  ipc.handle(
    "launch_game",
    async (_e, a: string | { id: string; actionId?: string }, b?: string) => {
      const id = typeof a === "string" ? a : a?.id ?? "";
      const actionId =
        typeof a === "string" ? b ?? undefined : a?.actionId ?? undefined;
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
      });
      // 启动成功后再执行启动后脚本（异步）。
      if (result.launched && game.postLaunchEnabled && game.postLaunchScript) {
        runScript(expandVariables(game.postLaunchScript, game), game.installDirectory);
      }
      return result;
    }
  );

  ipc.handle(
    "launch_game_path",
    async (_e, a: string | { id: string; path: string }, b?: string) => {
      const id = typeof a === "string" ? a : a?.id ?? "";
      const p = typeof a === "string" ? b ?? "" : a?.path ?? "";
      // 用指定路径直接启动游戏文件（不走动作解析，供"以文件方式启动"场景）。
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
      });
      return result;
    }
  );

  ipc.handle("is_game_running", async (_e, a: string | { id: string }) => {
    const id = typeof a === "string" ? a : a?.id ?? "";
    return isGameRunning(id);
  });

  ipc.handle("stop_game", async (_e, a: string | { id: string }) => {
    const id = typeof a === "string" ? a : a?.id ?? "";
    // 手动停止追踪（结算时长），并执行退出后脚本。
    const game = getGame(id);
    if (game && game.postExitEnabled && game.postExitScript) {
      runScript(expandVariables(game.postExitScript, game), game.installDirectory);
    }
    return stopGameTracking(id);
  });

  // ---------- 库统计 / 自动标签 ----------
  ipc.handle("library_stats", async () => {
    return libraryStats();
  });

  ipc.handle("regenerate_tags", async () => {
    // 重新计算所有游戏的自动标签（带 Tag: 前缀），并合并到各自 tags 列表。
    const games = getGames();
    let updated = 0;
    for (const g of games) {
      const text = [g.name, ...(g.alternateNames || []), ...g.localizedNames.map((n) => n.name)].join(" ");
      const auto = autoTagsFor(text).map((t) => "Tag: " + t);
      const manual = (g.tags || []).filter((t) => !t.startsWith("Tag:"));
      const merged = [...new Set([...manual, ...auto])];
      if (merged.length !== g.tags.length) {
        g.tags = merged;
        upsertGame(g);
        updated++;
      }
    }
    return { updated };
  });

  // ---------- 游戏库（按根目录组织） ----------
  ipc.handle("get_game_libraries", async () => {
    return getGameLibraries();
  });

  ipc.handle("upsert_game_library", async (_e, lib: GameLibrary) => {
    // 游戏库是"数据"，权威存数据库 game_libraries 表，config.json 不再写（历史双写已去掉）。
    upsertGameLibrary(lib);
    return true;
  });

  ipc.handle("delete_game_library", async (_e, id: string) => {
    deleteGameLibrary(id);
    return true;
  });

  // ---------- 平台 / 库插件 ----------
  ipc.handle("get_platforms", async () => {
    // TODO(Task: covers): 平台表已迁移，这里直接查库。先返回空（封面匹配会用到）。
    return [];
  });

  ipc.handle("get_library_plugins", async () => {
    // TODO(Task: library 插件): 返回已注册库插件（如 Steam/Origin 概念）。先返回空。
    return [];
  });

  // ---------- 设置 ----------
  ipc.handle("get_settings", async () => {
    return readSettings();
  });

  ipc.handle("save_settings", async (_e, patch: Partial<AppSettings>) => {
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
    const safePatch: Partial<AppSettings> = {};
    for (const [k, v] of Object.entries(patch ?? {})) {
      if (!SECURE_KEYS.has(k)) {
        (safePatch as Record<string, unknown>)[k] = v;
      }
    }
    return writeSettings(safePatch);
  });

  ipc.handle("get_config_dir", async () => {
    // 返回数据根目录，方便前端拼封面/详情页静态资源地址（后续 Task 用）。
    const { configRoot } = await import("../core/paths");
    return configRoot();
  });

  // ---------- 运行状态（Task 5） ----------
  // 运行中的游戏列表（前端顶部/详情页展示）。
  ipc.handle("running_games", async () => {
    return runningGames();
  });

  // 查询某游戏的运行状态（详情页进入时轮询）。三种状态：
  //   running：正在运行，elapsedSec 为已运行秒数（前端实时计时）。
  //   stopped：本会话内退出过一次，lastSessionSec 为最近一次运行时长。
  //   never：从没运行过。
  ipc.handle("get_run_state", async (_e, a: string | { gameId: string }) => {
    const gameId = typeof a === "string" ? a : a?.gameId ?? "";
    const g = getGame(gameId);
    const persistedLast = g?.lastSessionSeconds ?? 0;
    if (isGameRunning(gameId)) {
      return { state: "running", elapsedSec: elapsedSeconds(gameId), lastSessionSec: persistedLast };
    }
    const last = lastExitSeconds(gameId);
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
  ipc.handle("test_script", async (_e, script: string, gameId?: string) => {
    let cwd: string | undefined;
    if (gameId) {
      const game = getGame(gameId);
      const settings = readSettings();
      const libs = getLibraries();
      const libRoot = game?.gameLibrary ? libs.find((l) => l.name === game.gameLibrary)?.path : undefined;
      // 从"作为启动指令"的路径解析出工作目录（去掉文件名）。
      const playAction = game?.actions.find((a) => a.isPlayAction && a.type === "File");
      const workdirFromAction = playAction?.path
        ? path.dirname(playAction.path)
        : undefined;
      cwd = workdirFromAction || libRoot || game?.installDirectory;
    }
    return runScript(script, cwd);
  });
}
