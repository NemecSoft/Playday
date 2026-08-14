// 类型化 API 客户端：暴露给 stores/components 调用。
// 命令名与主进程 ipcMain.handle 注册的名字保持一致，client 在这里统一封装。
// 调用约定：call<T>("命令名", args) → Promise<T>。

import { call } from "./ipc";
import type {
  AppSettings,
  CurrentUser,
  Game,
  LibraryStats,
  Platform,
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
  regenerateTags: () =>
    call<{ updated: number }>("regenerate_tags").then((r) => r.updated),

  // —— 库统计 ——
  libraryStats: () => call<LibraryStats>("library_stats"),

  // —— 设置 ——
  getSettings: () => call<AppSettings>("get_settings"),
  // 原 saveSettings 接完整 settings → 新版接 patch（部分），内部展开成完整。
  saveSettings: (settings: AppSettings) => call<AppSettings>("save_settings", settings),

  // —— 平台 / 插件（Playday 暂未实现，返回空；管理端单独有命令） ——
  getPlatforms: () => call<Platform[]>("get_platforms").catch(() => [] as Platform[]),
  getBuiltinPlatforms: () => Promise.resolve([] as Platform[]),
  savePlatform: (platform: Platform) => Promise.resolve(platform),
  discoverPlugins: () => call<unknown[]>("get_library_plugins").catch(() => [] as unknown[]),
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

  // —— 管理端（客户端窗口通常不调用，但 API 类型保持一致） ——
  adminListUsers: () => call<PublicUser[]>("admin_list_users"),
  adminSaveUser: (args: { id?: string; account: string; name: string; level: number; kind: string; password: string }) =>
    call<PublicUser>("admin_save_user", args),
  adminDeleteUser: (id: string) => call<void>("admin_delete_user", { id }),
  adminRestoreUser: (id: string) => call<PublicUser>("admin_restore_user", { id }),
  adminGetSettings: () => call<AppSettings>("admin_get_settings"),
  adminSetEnterpriseConfig: (configPath: string) =>
    call<AppSettings>("admin_set_enterprise_config", { configPath }),
  adminPreviewEnterprise: (configPath: string) =>
    call<EnterprisePreview>("admin_preview_enterprise", { configPath }),
  adminImportEnterpriseUsers: (jsonPath: string) =>
    call<{ imported: number; skippedEmpty: number }>("admin_import_enterprise_users", { jsonPath }),
  adminListEnterpriseUsers: () => call<PublicUser[]>("admin_list_enterprise_users"),
  adminDeleteEnterpriseUser: (id: string) => call<void>("admin_delete_enterprise_user", { id }),
  adminSetGameLevel: (gameId: string, level: number) =>
    call<void>("admin_set_game_level", { gameId, level }),
  adminGetAllGames: () => call<Game[]>("admin_get_all_games"),
  adminGetGameLibraries: () =>
    call<{ id: string; name: string; path: string }[]>("admin_get_game_libraries"),
  adminSaveGameLibrary: (lib: { id: string; name: string; path: string }) =>
    call<{ id: string; name: string; path: string }[]>("admin_save_game_library", lib),
  adminDeleteGameLibrary: (id: string) =>
    call<{ id: string; name: string; path: string }[]>("admin_delete_game_library", { id }),
  adminValidateAction: (p: string, type?: string) =>
    call<{ valid: boolean; resolved: string; reason: string; extension: string }>(
      "admin_validate_action",
      { p, type: type ?? null }
    ),
  validateSelectedActions: (gameIds: string[]) =>
    call<
      {
        gameId: string;
        gameName: string;
        actionName: string;
        exePath: string;
        exists: boolean;
        reason: string;
      }[]
    >("validate_selected_actions", { gameIds }),

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

  // —— 系统 ——
  getAppInfo: () =>
    call<{ appName: string; version: string; os: string; arch: string; dataDir: string; configDir: string }>("get_app_info"),
  minimizeWindow: () => call<void>("minimize_window"),
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