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
  // 原始英文名（origin_name）。老游戏不回填（NULL），新游戏手动填入英文原名。
  originName?: string;
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
  // 存档路径配置（存档管理：备份-恢复）。纯字符串数组，含通配符。
  savePaths?: string[];
  // 手动指定的"计时监控 exe"：格式 `进程名|窗口标题关键字`（如 `dotnet.exe|泰拉瑞亚`）。
  // 仅少数用 start 启动游戏后自身提前退出的 bat 脚本才需要填。
  // 填了之后，启动脚本时不以 cmd 退出为计时终点，而是按 进程名(+可选窗口标题) 轮询
  // 该目标进程，直到它消失才结算时长。留空 = 保持现状（脚本退出即结算）。
  monitorExe?: string;
}

// 存档路径（备份-恢复用）——纯字符串数组，简洁存储，不存 id/type/note。
// 每条路径支持 {游戏库名} 占位符，可含通配符（如 *.*、*.save）。

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

// CardTextStyle 与 DEFAULT_CARD_TEXT 的单一事实来源在 shared/models.ts，
// 这里 re-export，保持后端引用方（AppSettings.cardText 等）无感知。
export { CardTextStyle, DEFAULT_CARD_TEXT } from "../../shared/models";
import type { CardTextStyle, DesignerConfig, ErrorReportConfig } from "../../shared/models";

export interface AppSettings {
  startupBehavior: string;
  enableTray: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  // 运行 .bat/.cmd 脚本指令时是否显示控制台窗口。默认 false=隐藏（幕后执行）。
  showBatConsole: boolean;
  language: string;
  firstTimeWizardComplete: boolean;
  // 【已废弃，不再读取】数据库路径曾一度支持配置，现固定为双库机制
  // （管理端 <数据根>/Admin/library.db、客户端 <数据根>/library/library.db）。
  // 读取配置时会主动剔除该键，保留类型仅为兼容旧组件编译。
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
  // 网格卡片水平间距（像素，0~20，卡片左右之间）。
  cardGap: number;
  // 网格卡片垂直间距（像素，0~60，卡片行与行之间的上下间距）。
  cardRowGap: number;
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
  // 卡片简介字号（px）。默认 11（紧凑 3 行截断），可设 9~16。
  // 变化时 GridView 的精确行高公式会同步刷新，避免虚拟列表排布错位。
  cardDescFontSize: number;
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
  // 支持绝对路径或相对路径（相对路径以数据根为基准解析）。
  // 设置后详情页全部改从该目录读（HTML + 视频都由内置 HTTP 服务器托管）。
  gameDetailsDir?: string;
  // 封面图目录。留空/未设置时用默认 <数据根>/CoverImages；
  // 支持绝对路径或相对路径（相对路径以数据根为基准解析）。
  // 封面按"游戏名同名文件"自动匹配；读图白名单跟随该目录（covers.ts isInCoverDir）。
  coverImagesDir?: string;
  // 存档备份工具 GameSaveHelper.exe 的路径（config.json → settings.gameSaveHelperPath）。
  // 空 / 未设置 = 未配置（备份时返回明确错误）。绝对路径原样；相对路径以数据根为基准。
  gameSaveHelperPath?: string;
  // 网格卡片上是否显示简介（description）。true=显示，false=隐藏。持久化到 config.json。
  showCardDescription: boolean;
  // 综合主题/配色/字体设计器配置（见 shared/models.ts DesignerConfig）。
  designer?: DesignerConfig;
  // 社区氛围：是否开启"多人氛围"（在线/弹幕/活动流）。默认 false。
  communityEnabled: boolean;
  // 氛围来源：mock（随机模拟）/ real（真实后端，预留）。默认 mock。
  communitySource: string;
  // 错误上报/崩溃报告（SMTP 发邮件到收件人邮箱），默认关。
  errorReport: ErrorReportConfig;
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
// 单一事实来源在 shared/models.ts 的 DEFAULT_SETTINGS，这里 re-export。
export { DEFAULT_SETTINGS } from "../../shared/models";
