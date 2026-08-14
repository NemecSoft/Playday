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

export interface Game {
  id: string;
  /** Primary display name (usually the original English title). */
  name: string;
  sortName?: string;
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
  language: string;
  firstTimeWizardComplete: boolean;
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
  /** Gap between grid cards in px (0..20). */
  cardGap: number;
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
  /** Selected theme palette id (themeLibrary). Persisted in config.json. */
  themeId?: string;
  /** Selected style id (styleLibrary). Persisted in config.json. */
  styleId?: string;
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
