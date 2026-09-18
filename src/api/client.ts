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
/** 一条游戏本地视频（来自 `get_game_videos`；对应详情目录下的 videos/ 文件）。 */
export interface GameVideoItem {
  /** 显示名（纯文件名，不含子目录）。 */
  name: string;
  /** 相对 videos 目录的路径（`/` 分隔）。 */
  rel: string;
  /** 所在子文件夹名；直接放在 videos/ 下时为 ""。 */
  group: string;
  /** 相对游戏目录、且已做 URL 编码的路径 —— 直接拼 base URL 就能播。 */
  urlPath: string;
  /** 绝对路径（"用系统播放器打开"时回传给主进程）。 */
  absPath: string;
  /** 能否被内置 `<video>` 直接播；false → 走系统播放器。 */
  playable: boolean;
}
export interface GameVideosResult {
  /** 是否真有视频（目录不存在或里面没视频都是 false，不算错误）。 */
  found: boolean;
  /** 实际命中的子目录名（游戏 id 或游戏名）—— 拼播放 URL 必须用它。 */
  dirName: string;
  /** videos 目录的绝对路径（排查"到底看的是哪个目录"）。 */
  dir: string;
  items: GameVideoItem[];
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
  /**
   * 启动前检测（只看启动项，不看存档路径）。
   *
   * 与 launch_game 里的检测是**同一份判据**（主进程 launchCheck.checkLaunchAction），
   * 区别只是时机：这个在弹"正在启动"横幅**之前**问，找不到就直接报"找不到"。
   */
  checkGameLaunch: (id: string, actionId?: string) =>
    call<{ ok: boolean; reason?: string }>("check_game_launch", { id, actionId: actionId ?? null }),
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
  // data 的形态两端不同：桌面端是裸字节（Uint8Array，结构化克隆），网站端是 base64 字符串
  // （HTTP JSON 传不了二进制）。转换在 utils/assets.ts 里统一处理。
  readImage: (path: string) =>
    call<{ data: string | Uint8Array; mime: string }>("read_image", { path }),
  readImagesBatch: (paths: string[]) =>
    call<Array<{ data: string | Uint8Array; mime: string } | null>>("read_images_batch", { paths }),
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
    }>("get_status_bar"),

  // 说明：管理端相关命令（admin_*）已随管理端应用一并移除——
  // 数据改由手工维护的 games.json + 脚本写入源库（import-games.bat）。

  // —— 公告 ——
  // 原版返回 {html, fromFile}，新版本返回 html 字符串，统一返回 {html: string}。
  getAnnouncement: () => call<string>("get_announcement").then((html) => ({ html, fromFile: !!html })),

  // 公告窗口点"进入系统"：通知主进程关闭公告窗口并创建主窗口。
  // 被拒时返回 {ok:false, reason}（"maintenance" 维护中 / "outdated" 库过旧），
  // 前端据此切到对应拦截态，避免"点了没反应"。
  enterSystem: () =>
    call<{
      ok: boolean;
      reason?: string;
      level?: number;
      status?: number | null;
      ageDays?: number | null;
    }>("enter_system"),

  // 服务器维护状态（公告窗口一启动就问一次）：Status=0 = 该等级维护中，不允许进入系统。
  // 按用户等级分别控（黄金版定期维护只关黄金版）。见 docs/design/user-level-detection.md
  getServerStatus: () =>
    call<{
      maintenance: boolean;
      status: number | null;
      level: number;
      filePath: string;
      fileExists: boolean;
      recordCount: number;
      parseError?: string;
    }>("get_server_status"),

  // 游戏库"年龄"（公告窗口一启动就问一次）：权威库文件超过 30 天没变化 = 系统过旧，
  // 不允许进入系统（只能退出，去找管理员要新版）。规则与单测见 shared/libraryAge.ts
  getLibraryAge: () =>
    call<{
      outdated: boolean;
      ageDays: number | null;
      mtimeMs: number | null;
      filePath: string;
      fileExists: boolean;
    }>("get_library_age"),

  // —— 游戏详情页 ——
  // `dir` = 主进程实际命中的那个目录名（**优先游戏 id、其次游戏名**）—— 详情页 iframe 的
  // URL 必须用它，不能拿 game.name 猜：命中 id 目录的游戏用 game.name 拼出来就是 404。
  // 兼容旧返回：网站端（server.mjs）这条命令可能仍返回裸路径字符串。
  getGameHtmlPage: (gameId: string, gameName?: string) =>
    call<{ path?: string; dir?: string } | string | null>("get_game_html_page", {
      gameId,
      gameName: gameName ?? null,
    }).then((r) => {
      const hit = typeof r === "string" ? { path: r, dir: "" } : r;
      return {
        found: !!hit?.path,
        name: gameName || gameId,
        path: hit?.path || "",
        dir: hit?.dir || "",
      };
    }),
  getGameServerUrl: () => call<string>("get_game_server_url"),
  // 把"当前生效的主题配色"交给主进程，供详情页 HTML 注入（见 electron/core/detailTheme.ts）。
  // fire-and-forget：详情页注入失败最多是"页面保持它自己的颜色"，不该影响主界面，
  // 所以调用方不 await、也不提示。网站端（server.mjs）没有这条命令 → 调用方要吞掉异常。
  setDetailTheme: (vars: Record<string, string>, dark: boolean) =>
    call<boolean>("set_detail_theme", { vars, dark }),

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

  // —— 游戏本地视频（详情目录下的 videos/ 文件夹）——
  // 列出某游戏 videos/ 里的视频（含子文件夹分组、自然序）。
  // 播放地址 = `${serverUrl}/games/${encodeURIComponent(dirName)}/${item.urlPath}`
  // （走本地 HTTP 服务器，支持 Range，进度条可拖）。
  // ⚠️ Web 端（server.mjs）不实现这条命令、返回 null，这里兜底成空列表 ——
  //    否则调用方 `.items` 会直接抛错。
  getGameVideos: (gameId: string, gameName: string) =>
    call<GameVideosResult | null>("get_game_videos", {
      gameId,
      gameName: gameName ?? null,
    }).then((r) => r ?? { found: false, dirName: "", dir: "", items: [] }),
  // 用系统默认播放器打开某个视频（浏览器放不了的封装走这条路）。
  openVideoExternal: (path: string) =>
    call<{ opened: boolean; error?: string }>("open_video_external", { path }),

  // —— 存档备份 ——
  // 备份某游戏的存档：启动 GameSaveHelper.exe，由它生成自解压恢复包。
  // 返回的 ok 只表示"工具已启动"；备份是否成功由工具窗口自己呈现。
  backupGameSave: (gameId: string) =>
    call<{ ok: boolean; error?: string }>("backup_game_save", { gameId }),

  // —— 应用自带字体 ——
  // 主进程扫描 <应用目录>/fonts（找不到再看 <resources>/fonts），返回字体清单 +
  // 默认字体 + 每个字体的可访问 URL（走本地 HTTP 服务器）。
  // fonts 目录不存在 → found:false、fonts 为空 → 前端保持系统字体。
  getUiFonts: () =>
    call<{
      found: boolean;
      dir: string;
      defaultFamily: string;
      fonts: { family: string; fileName: string; url: string }[];
    }>("get_ui_fonts"),

  // —— 背景音乐 ——
  // 主进程扫描配置的音乐目录（settings.musicDir，未配置 = <数据根>/music），
  // 返回曲目列表 + 每首可播放的 URL（走本地 HTTP 服务器，支持 Range）。
  // 目录不存在/没有音频 → tracks 为空，前端不显示音乐控件。
  getMusicLibrary: () =>
    call<{
      dir: string;
      exists: boolean;
      tracks: { name: string; rel: string; url: string }[];
    }>("get_music_library"),

  // —— 目录/文件选择 ——
  // 主进程系统对话框（设置里的"浏览…"按钮用）。返回绝对路径；用户取消返回 null。
  pickDirectory: (title?: string, defaultPath?: string) =>
    call<string | null>("open_dialog", { mode: "directory", title, defaultPath }),

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