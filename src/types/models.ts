// 前端用的数据类型定义，与主进程（electron/ipc 及 core 层）返回的结构保持一致。

export interface Platform {
  id: string;
  name: string;
  specificationId?: string;
  icon?: string;
}

export interface GameAction {
  id: string;
  name: string;
  type: "File" | "URL";
  path?: string;
  workingDir?: string;
  arguments?: string;
  isPlayAction: boolean;
  trackGame: boolean;
}

export interface GameLink {
  name: string;
  url: string;
}

/** A localized/alternate name tagged with a language code. */
export interface GameName {
  language: string;
  name: string;
}

// CardTextStyle 与 DEFAULT_CARD_TEXT 的单一事实来源在 shared/models.ts，
// 这里 re-export，保持前端引用方（AppSettings.cardText、settingsStore 等）无感知。
// isolatedModules 下 re-export 类型必须用 export type，值用 export。
export type { CardTextStyle, DesignerConfig, ErrorReportConfig, CrashReport } from "../../shared/models";
export { DEFAULT_CARD_TEXT } from "../../shared/models";
import type { CardTextStyle, DesignerConfig, ErrorReportConfig, CrashReport } from "../../shared/models";

export interface Game {
  id: string;
  /** Primary display name (usually the Chinese common name). */
  name: string;
  /** 原始英文名（origin_name）。老游戏为 NULL 不显示副标题，新游戏手动填英文原名。 */
  originName?: string;
  /** Localized names across languages (zh-CN, zh-TW, ja, ko, ...). */
  localizedNames?: GameName[];
  /** Unofficial nicknames / colloquial aliases without a language tag. */
  alternateNames?: string[];
  gameId?: string;
  /** 是否已安装。缺省视为未安装。 */
  installed?: boolean;
  installDirectory?: string;
  playTask?: string;
  otherTasks: string[];
  lastPlayed?: string;
  playCount: number;
  lastActivity?: string;
  playtime: number;
  added: string;
  modified: string;
  category: string[];
  genre: string[];
  developer: string[];
  publisher: string[];
  tags: string[];
  series: string[];
  ageRating: string[];
  region: string[];
  source: string[];
  features: string[];
  releaseDate?: string;
  communityScore?: number;
  criticScore?: number;
  userScore?: number;
  hidden: boolean;
  favorite: boolean;
  backgroundImage?: string;
  coverImage?: string;
  icon?: string;
  description?: string;
  /** 简介：Playday 用户维护的简短介绍（与 description「描述/版本信息」区分开）。 */
  intro?: string;
  notes?: string;
  version?: string;
  platform: string[];
  emulator?: string;
  completionStatus?: string;
  userScoreSet: boolean;
  manualGame: boolean;
  pluginId?: string;
  links: GameLink[];
  actions: GameAction[];
  featuresEnabled: boolean;
  /** HTML guide / how-to-play instructions shown on the detail page. */
  guide?: string;
  /** Screenshot / gallery image URLs (supports gif/png/jpg/...). */
  screenshots?: string[];
  /** Gameplay / live videos. */
  videos?: GameVideo[];
  /** Access level required to play: 1 | 2 | 3. */
  gameLevel: number;
  /** Script run before launching the game (one command per line). */
  preLaunchScript?: string;
  preLaunchEnabled: boolean;
  /** Script run after the game process started. */
  postLaunchScript?: string;
  postLaunchEnabled: boolean;
  /** Script run after the game exited. */
  postExitScript?: string;
  postExitEnabled: boolean;
  /** 存档路径（备份/恢复用，纯字符串数组，简洁存储）。支持 {游戏库名} 占位符和通配符。 */
  savePaths?: string[];
  /** 手动指定的"计时监控 exe"：`进程名|窗口标题关键字`（如 dotnet.exe|泰拉瑞亚）。
      仅少数用 start 启动游戏后自身提前退出的 bat 脚本需要填。留空=脚本退出即结算。 */
  monitorExe?: string;
}

/** A gameplay/live video attached to a game. */
export interface GameVideo {
  /** "youtube" | "file" | "url" */
  type: string;
  url: string;
  name?: string;
}

export interface AppSettings {
  startupBehavior: string;
  enableTray: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  /** 运行 .bat/.cmd 指令时是否显示控制台窗口（默认 false=隐藏）。 */
  showBatConsole: boolean;
  language: string;
  firstTimeWizardComplete: boolean;
  /** 【已废弃，不再读取】数据库路径固定为双库机制；读取配置时会剔除该键。 */
  databasePath?: string;
  autoBackupEnabled: boolean;
  gridViewImage: string;
  detailsViewImage: string;
  listViewImage: string;
  showInstalledOnly: boolean;
  showHidden: boolean;
  showFavorites: boolean;
  sortOrder: string;
  sortDirection: string;
  fullscreenMode: boolean;
  controllerSupport: boolean;
  /** Whether the login screen is shown on startup. */
  loginEnabled: boolean;
  /** Login method: "wechat" (QR scan) or "account" (username/password). */
  loginType: string;
  /** Whether the current session is logged in. */
  loggedIn: boolean;
  /** Logged-in username (for account login). */
  username?: string;
  /** Whether to record play time when launching games. */
  trackPlaytime: boolean;
  /** Grid card width in px. */
  cardWidth: number;
  /** Gap between grid cards in px (0..20) - horizontal (left-right). */
  cardGap: number;
  /** Vertical gap between card rows in px (0..60) - top-bottom. */
  cardRowGap: number;
  /** Left sidebar width in px (user-resizable, 160..600). */
  sidebarWidth: number;
  /** Path to the enterprise user config JSON. */
  enterpriseConfigPath: string;
  /** Current session user kind: "enterprise" | "personal" | "". */
  currentUserKind: string;
  /** Current session user display name. */
  currentUserName: string;
  /** Current session user level (1|2|3). */
  currentUserLevel: number;
  /** User-selected UI font family (empty = theme default). */
  fontFamily: string;
  /** 卡片上标题/别名的字号（px）。默认 15，比老版 12px 更易读。 */
  cardFontSize: number;
  /** 卡片简介（description）的字号（px）。默认 11，可设 9~16。 */
  cardDescFontSize: number;
  /** 卡片上文字是否加粗。 */
  cardFontBold: boolean;
  /** 卡片文字自定义样式（颜色/描边/发光/阴影/背景）。默认走 DEFAULT_CARD_TEXT。 */
  cardText: CardTextStyle;
  /** Selected theme palette id (themeLibrary). Persisted in config.json. */
  themeId?: string;
  /** Selected style id (styleLibrary). Persisted in config.json. */
  styleId?: string;
  /** Custom game detail pages dir (absolute or relative to data root). Empty = default data/Game_Details. */
  gameDetailsDir?: string;
  /** Custom cover images dir (absolute or relative to data root). Empty = default data/CoverImages. */
  coverImagesDir?: string;
  /** Path to GameSaveHelper.exe (save backup tool). Empty/unset = not configured. */
  gameSaveHelperPath?: string;
  /**
   * Game root: the base for game paths stored as *relative* paths
   * (production `X:\YunGame\Playnite`, test `D:\YunGame\Playnite`) — decoupled
   * via config instead of hard-coded. Empty/unset = fall back to the data root.
   */
  defaultGameRootPath?: string;
  /** Whether to show the description (简介) on grid cards. Persisted in config.json. */
  showCardDescription: boolean;
  /** 综合主题/配色/字体设计器配置（见 shared/models.ts DesignerConfig）。 */
  designer?: DesignerConfig;
  /** 社区氛围：是否开启"多人氛围"（在线/弹幕/活动流）。默认 false。 */
  communityEnabled: boolean;
  /** 氛围来源：mock（随机模拟）/ real（真实后端，预留）。默认 mock。 */
  communitySource: string;
  /** 错误上报/崩溃报告（SMTP 发邮件到收件人邮箱），默认关。 */
  errorReport: ErrorReportConfig;
}

/** The resolved current user (enterprise or personal or guest). */
export interface CurrentUser {
  kind: "enterprise" | "personal" | "guest";
  name: string;
  account: string;
  level: number;
  enterprise: boolean;
  configPath: string;
  configExists: boolean;
}

/** A personal user as exposed to the admin app (no password). */
export interface PublicUser {
  id: string;
  account: string;
  name: string;
  level: number;
  createdAt: string;
}

export interface EnterprisePreview {
  path: string;
  exists: boolean;
  records: number;
  matchedIp?: string;
  matchedName: string;
  matchedLevel: number;
}

export interface LibraryStats {
  totalGames: number;
  installedGames: number;
  installedPct: number;
  totalPlaytime: number;
  totalSize: number;
  favoriteGames: number;
  hiddenGames: number;
  platformBreakdown: { name: string; count: number }[];
  genreBreakdown: { name: string; count: number }[];
}

export interface LibraryPluginInfo {
  id: string;
  name: string;
  icon?: string;
  enabled: boolean;
}

export interface RunningGame {
  gameId: string;
  gameName: string;
  startedAt: number;
}
