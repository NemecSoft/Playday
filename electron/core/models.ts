// 核心数据模型（后端用，对齐 Rust 的 models.rs 与前端 src/types/models.ts）。
// 这些接口是"单一事实来源"：前端类型从 src/types/models.ts 导入，
// 后端 IPC 读写也用这里的接口，保证前后端字段完全一致。

// 一个游戏运行所依赖的平台（PC / Steam / PS4 / Switch…）。
export interface Platform {
  id: string;
  name: string;
  specificationId?: string;
  icon?: string;
}

// 启动游戏的一个动作（点"开始游戏"实际执行的东西）。
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

// 一组游戏（按根目录组织），name 是占位符，用在启动路径的 {name} 里。
export interface GameLibrary {
  id: string;
  name: string;
  path: string;
}

// 游戏的某个语言的名字（如中文名、日文名）。
export interface GameName {
  language: string;
  name: string;
}

// 游戏相关的视频（YouTube 链接 / 本地文件 / 普通网址）。
export interface GameVideo {
  type: string; // "youtube" | "file" | "url"
  url: string;
  name?: string;
}

// 游戏的一条外链（官网、商店页…）。
export interface GameLink {
  name: string;
  url: string;
}

// 主游戏实体。在 Playnite.SDK.Game 基础上扩展出"多名称"支持。
export interface Game {
  id: string;
  name: string;
  sortName?: string;
  localizedNames: GameName[];
  alternateNames: string[];
  gameId?: string;
  installed: boolean;
  installDirectory?: string;
  playTask?: string;
  otherTasks: string[];
  lastPlayed?: string;
  playCount: number;
  lastActivity?: string;
  playtime: number;
  // 最近一次会话运行了多少秒（进程退出时由后台监控写入）。
  lastSessionSeconds: number;
  // 最近一次会话结束时间（ISO8601）。
  lastSessionEndedAt?: string;
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
  guide?: string;
  screenshots: string[];
  videos: GameVideo[];
  // 这个游戏属于哪个游戏库（按名字匹配 GameLibrary）。
  gameLibrary?: string;
  // 玩这个游戏需要的权限等级：1 / 2 / 3。
  // 用户等级 N 可以玩 gameLevel <= N 的游戏。
  gameLevel: number;
  // 启动前执行的脚本（每行一条命令）。
  preLaunchScript?: string;
  preLaunchEnabled: boolean;
  // 游戏进程启动后执行的脚本。
  postLaunchScript?: string;
  postLaunchEnabled: boolean;
  // 游戏退出后执行的脚本。
  postExitScript?: string;
  postExitEnabled: boolean;
  // 存档路径配置（存档管理：备份-恢复）。最多 3 条，含通配符。
  savePaths?: SavePath[];
}

// 一个游戏的存档路径（备份-恢复用）。
// path 支持 {游戏库名} 占位符，可含通配符（如 *.*、*.save）。
export interface SavePath {
  id: string;          // 唯一 id（编辑时增删）
  path: string;        // 存档路径（可含通配符、{游戏库名} 占位符）
  type: "file" | "dir"; // 目标类型（有通配符时按通配符匹配）
  note?: string;       // 备注（可选）
}

// 统一用户记录：企业用户（按公网 IP 匹配）和个人用户（账号登录）都存这张表。
export interface AppUser {
  id: string;
  account: string;
  passwordHash: string;
  name: string;
  level: number;
  kind: string; // "enterprise" | "personal"
  ipAddress: string;
  createdAt: string;
  // 软删除标记：有值表示已删除（保留用于撤销），空表示正常。
  deletedAt?: string;
}

// 当前会话登录的用户信息（登录时确定）。
export interface CurrentUser {
  kind: string; // "enterprise" | "personal"
  name: string;
  account: string;
  level: number;
}

// 应用设置（存 config.json，不在数据库里）。

// 卡片文字样式：完整自定义——颜色/描边/发光/阴影/背景填充。
// 所有字段都有默认值；缺字段时前端用 DEFAULT_CARD_TEXT 兜底。
export interface CardTextStyle {
  /** 主文字颜色（hex，如 "#fff8e7"） */
  color: string;
  /** 描边启用开关 */
  stroke: boolean;
  /** 描边颜色 hex */
  strokeColor: string;
  /** 描边粗细 px（0..3） */
  strokeWidth: number;
  /** 文字发光启用 */
  glow: boolean;
  /** 发光颜色 hex */
  glowColor: string;
  /** 发光模糊半径 px（0..30） */
  glowBlur: number;
  /** 文字阴影启用 */
  shadow: boolean;
  /** 阴影颜色 hex */
  shadowColor: string;
  /** 阴影水平偏移 px（-10..10） */
  shadowOffsetX: number;
  /** 阴影垂直偏移 px（-10..10） */
  shadowOffsetY: number;
  /** 阴影模糊 px（0..20） */
  shadowBlur: number;
  /** 文字背景填充启用（卡在卡面上的色块底） */
  bg: boolean;
  /** 背景颜色 hex */
  bgColor: string;
  /** 背景不透明度 0..1 */
  bgOpacity: number;
}

/** 默认卡片文字样式：暖白 + 紫光 + 黑色描边（接近"史诗紫金"预设） */
export const DEFAULT_CARD_TEXT: CardTextStyle = {
  color: "#fff8e7",
  stroke: true,
  strokeColor: "#000000",
  strokeWidth: 1.5,
  glow: true,
  glowColor: "#a040c8",
  glowBlur: 10,
  shadow: true,
  shadowColor: "#000000",
  shadowOffsetX: 0,
  shadowOffsetY: 1,
  shadowBlur: 2,
  bg: false,
  bgColor: "#000000",
  bgOpacity: 0.5,
};

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
  // 启动时是否显示登录界面。
  loginEnabled: boolean;
  // 登录方式："wechat"（扫码）或 "account"（账号密码）。
  loginType: string;
  // 当前会话是否已登录。
  loggedIn: boolean;
  // 登录用户名（账号登录时填）。
  username?: string;
  // 启动游戏时是否记录游戏时长。
  trackPlaytime: boolean;
  // 网格卡片宽度（像素）。
  cardWidth: number;
  // 网格卡片间距（像素，0~20）。
  cardGap: number;
  // 左侧边栏宽度（像素，160~600）。
  sidebarWidth: number;
  // 企业用户配置文件 JSON 路径（默认 D:/1.json）。
  enterpriseConfigPath: string;
  // 注意：游戏库列表不放在 settings（config.json）里。
  // 游戏库是"业务数据"，单一数据源是数据库 game_libraries 表，
  // 通过 getLibraries()/getGameLibraries() 读取。放配置里会造成双份存储混乱。
  // 当前会话用户类型："enterprise" | "personal" | ""。
  currentUserKind: string;
  // 当前会话用户显示名。
  currentUserName: string;
  // 当前会话用户等级（1 | 2 | 3），默认 3 = 全部可玩。
  currentUserLevel: number;
  // 用户选择的界面字体（空 = 用主题默认字体）。
  fontFamily: string;
  // 卡片标题/别名字号（px）。默认 15（比老版 12px 更易读，可设 12~22）。
  cardFontSize: number;
  // 卡片标题/别名是否加粗（true=700，false=500）。
  cardFontBold: boolean;
  // 卡片文字自定义样式（颜色/描边/发光/阴影/背景填充）。
  // 用户在"外观"里逐项调，结果存这里。CSS 直接读这里 4 个属性：
  // --card-text-color / --card-stroke-* / --card-glow-* / --card-shadow-* / --card-bg-*
  cardText: CardTextStyle;
  // 用户选择的主题调色板 id（对应 themeLibrary 的某个 palette id）。
  // 存 config.json 而不是 localStorage，保证打包版(file://)下重启也不丢。
  themeId?: string;
  // 用户选择的风格 id（对应 styleLibrary 的某个 style id）。
  styleId?: string;
  // 游戏静态详情页目录。留空/未设置时用默认 <数据根>/Game_Details；
  // 设置了绝对路径则详情页全部改从该目录读（HTML + 视频都由内置 HTTP 服务器托管）。
  gameDetailsDir?: string;
}

// 库统计信息（library_stats 命令返回）。
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

// 库插件注册信息（对应 Playnite 的库插件概念）。
export interface LibraryPluginInfo {
  id: string;
  name: string;
  icon?: string;
  enabled: boolean;
}

// 应用的默认设置（config.json 不存在时用这份默认值）。
export const DEFAULT_SETTINGS: AppSettings = {
  startupBehavior: "StartNormal",
  enableTray: true,
  minimizeToTray: false,
  closeToTray: false,
  language: "en-US",
  firstTimeWizardComplete: false,
  databasePath: undefined,
  autoBackupEnabled: true,
  gridViewImage: "Cover",
  detailsViewImage: "Background",
  listViewImage: "Icon",
  showInstalledOnly: false,
  showHidden: false,
  showFavorites: false,
  sortOrder: "Name",
  sortDirection: "Ascending",
  fullscreenMode: false,
  controllerSupport: false,
  loginEnabled: false,
  loginType: "wechat",
  loggedIn: false,
  username: undefined,
  trackPlaytime: true,
  cardWidth: 180,
  cardGap: 8,
  sidebarWidth: 210,
  enterpriseConfigPath: "D:/1.json",
  currentUserKind: "",
  currentUserName: "",
  currentUserLevel: 3,
  fontFamily: "",
  cardFontSize: 15,
  cardFontBold: false,
  cardText: DEFAULT_CARD_TEXT,
  // 主题/风格默认空 = 用内置静态主题（dark/light 等），不额外套动态调色板。
  themeId: undefined,
  styleId: undefined,
  // 详情页目录默认空 = 用 <数据根>/Game_Details；设置后覆盖到指定绝对路径。
  gameDetailsDir: undefined,
};
