// 类型化 API 客户端：暴露给 stores/components 调用。
// 命令名与主进程 ipcMain.handle 注册的名字保持一致，client 在这里统一封装。
// 调用约定：call<T>("命令名", args) → Promise<T>。

import { call } from "./ipc";
import type {
  AppSettings,
  CurrentUser,
  DeepPartial,
  Game,
  LibraryPluginInfo,
  LibraryStats,
  Platform,
  CrashReport,
} from "../types/models";

// —— 客户端可见的小类型（对齐原 client.ts）——
export interface CoverScanOutcome {
  matched: number;
  coverFiles: number;
  considered: number;
  dirExists: boolean;
  dirPath: string;
}
export interface CoverDirInfo {
  dirPath: string;
  dirExists: boolean;
  coverFiles: number;
  images: string[];
}
export interface PublicUser {
  id: string;
  account: string;
  name: string;
  level: number;
  kind: string;
  createdAt: string;
}
export interface EnterprisePreview {
  path: string;
  exists: boolean;
  records: number;
  matchedIp: string | null;
  matchedName: string;
  matchedLevel: number;
}
export interface RunState {
  state: "running" | "stopped" | "never";
  elapsedSec: number;
  lastSessionSec: number;
}
export interface ScriptLineResult {
  line: string;
  ok: boolean;
  error?: string | null;
}

export const api = {
  // —— 游戏 ——
  getGames: () => call<Game[]>("get_games"),
  getGame: (id: string) => call<Game | null>("get_game", { id }),
  saveGame: (game: Game) => call<Game>("upsert_game", { game }),
  deleteGame: (id: string) => call<void>("delete_game", { id }),
  launchGame: (id: string, actionId?: string) =>
    call<{ launched: boolean; error?: string }>("launch_game", { id, actionId: actionId ?? null }),
  // 旧版本名 stop_game_tracking → 新命令 stop_game；返回累计秒数。
  stopGameTracking: (id: string) => call<number>("stop_game", { id }),
  runningGames: () => call<{ gameId: string; gameName: string; startedAt: number }[]>("running_games"),
  getRunState: (gameId: string) => call<RunState>("get_run_state", { gameId }),
  testScript: (script: string, gameId?: string) =>
    call<ScriptLineResult[]>("test_script", { script, gameId: gameId ?? null }),

  // —— 库统计 ——
  libraryStats: () => call<LibraryStats>("library_stats"),

  // —— 设置 ——
  getSettings: () => call<AppSettings>("get_settings"),
  // 只提交"改动的字段"（patch）：主进程读盘后再合并，避免覆盖用户手改的 config.json。
  // 返回值是合并后的完整设置。
  saveSettings: (settings: DeepPartial<AppSettings>) =>
    call<AppSettings>("save_settings", settings as Record<string, unknown>),

  // —— 平台 / 插件（Playday 暂未实现，返回空；管理端单独有命令） ——
  getPlatforms: () => call<Platform[]>("get_platforms").catch(() => [] as Platform[]),
  getBuiltinPlatforms: () => Promise.resolve([] as Platform[]),
  savePlatform: (platform: Platform) => Promise.resolve(platform),
  discoverPlugins: () =>
    call<LibraryPluginInfo[]>("get_library_plugins").catch(() => [] as LibraryPluginInfo[]),
  getPluginGames: () => Promise.resolve([] as Game[]),
  saveLibraryPlugin: (p: unknown) => Promise.resolve(p),
  deleteLibraryPlugin: (_id: string) => Promise.resolve(),

  // —— 封面 ——
  scanCovers: () =>
    call<{ games: Game[]; outcome: CoverScanOutcome }>("scan_covers"),
  getCoverDirInfo: () => call<CoverDirInfo>("get_cover_dir_info"),
  readImage: (path: string) =>
    call<{ data: string; mime: string }>("read_image", { path }),
  readImagesBatch: (paths: string[]) =>
    call<Array<{ data: string; mime: string } | null>>("read_images_batch", { paths }),
  clearImageCache: () => call<number>("clear_image_cache"),

  // —— 登录 / 权限（客户端） ——
  getCurrentUser: () => call<CurrentUser>("get_current_user"),
  resolveEnterprise: () => call<CurrentUser | null>("resolve_enterprise"),
  loginPersonal: (account: string, password: string) =>
    call<CurrentUser | null>("login_personal", { account, password }),
  logout: () => call<void>("logout"),
  checkCanPlay: (gameLevel: number) => call<boolean>("check_can_play", { gameLevel }),
  getStatusBar: () =>
    call<{
      localIp: string;
      publicIp: string;
      cafeName: string;
      cafeMatched: boolean;
      configPath: string;
      configExists: boolean;
    }>("get_status_bar"),

  // 说明：管理端相关命令（admin_*）已随管理端应用一并移除——
  // 数据改由手工维护的 games.json + 脚本写入源库（import-games.bat）。

  // —— 公告 ——
  // 原版返回 {html, fromFile}，新版本返回 html 字符串，统一返回 {html: string}。
  getAnnouncement: () => call<string>("get_announcement").then((html) => ({ html, fromFile: !!html })),

  // 公告窗口点"进入系统"：通知主进程关闭公告窗口并创建主窗口。
  enterSystem: () => call<boolean>("enter_system"),

  // —— 游戏详情页 ——
  getGameHtmlPage: (gameId: string, gameName?: string) =>
    call<string | null>("get_game_html_page", { gameId, gameName: gameName ?? null }).then(
      (path) => ({ found: !!path, name: gameName || gameId, path: path || "" })
    ),
  getGameServerUrl: () => call<string>("get_game_server_url"),

  // —— 修改器 ——
  // 列出某游戏的修改器 exe（含图标 dataURL）；无修改器返回空数组。
  getTrainers: (gameId: string, gameName: string) =>
    call<{ name: string; exePath: string; icon: string }[]>("get_game_trainers", {
      gameId,
      gameName: gameName ?? null,
    }),
  // 直接启动某个修改器 exe（不做等级校验、不计时长）。
  launchTrainer: (exePath: string) =>
    call<{ launched: boolean; error?: string }>("launch_trainer", { exePath }),

  // —— 应用存档（与修改器同逻辑，目录换成"游戏存档"）——
  // 列出某游戏的"应用存档"exe（含图标 dataURL）；无则返回空数组。
  getGameSaves: (gameId: string, gameName: string) =>
    call<{ name: string; exePath: string; icon: string }[]>("get_game_saves", {
      gameId,
      gameName: gameName ?? null,
    }),
  // 直接启动某个"应用存档"exe（不做等级校验、不计时长）。
  launchSave: (exePath: string) =>
    call<{ launched: boolean; error?: string }>("launch_save", { exePath }),

  // —— 存档备份 ——
  // 备份某游戏的存档：启动 GameSaveHelper.exe，由它生成自解压恢复包。
  // 返回的 ok 只表示"工具已启动"；备份是否成功由工具窗口自己呈现。
  backupGameSave: (gameId: string) =>
    call<{ ok: boolean; error?: string }>("backup_game_save", { gameId }),

  // —— 系统 ——
  getAppInfo: () =>
    call<{ appName: string; version: string; os: string; arch: string; dataDir: string; configDir: string }>("get_app_info"),
  minimizeWindow: () => call<void>("minimize_window"),

  // —— 崩溃报告 ——
  callCrashReport: () => call<CrashReport | null>("get_crash_report"),
  sendCrashReport: (report: CrashReport) =>
    call<{ ok: boolean; error?: string }>("send_crash_report", { report }),
  saveCrashLocally: (report: CrashReport) =>
    call<{ ok: boolean }>("save_crash_locally", { report }),
  maximizeWindow: () => call<boolean>("maximize_window"),
  isMaximized: () => call<boolean>("is_maximized"),
  isFullscreen: () => call<boolean>("is_fullscreen"),
  toggleFullscreen: () => call<boolean>("toggle_fullscreen"),
  closeWindow: () => call<void>("close_window"),
  hideWindow: () => call<void>("hide_window"),
  showWindow: () => call<void>("show_window"),
  showNotification: (title: string, body: string) => call<void>("show_notification", { title, body }),
  quit: () => call<void>("quit"),
};