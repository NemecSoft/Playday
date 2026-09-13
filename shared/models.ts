// 前后端共享的"纯数据模型与常量"——单一事实来源（SoT）。
// 背景：CardTextStyle 和 DEFAULT_CARD_TEXT 之前在主进程 electron/core/models.ts
// 和前端 src/types/models.ts 各定义一份（完全相同的副本），改一处漏一处。
// 现在收敛到这里，主进程和前端都从本文件 re-export，消除重复。
// 注意：Game/AppSettings 等主实体接口前后端字段已分叉（前端宽松可选、后端完整必填），
// 不适合强行合并，仍各自保留在各自层。

/**
 * 递归可选（补丁类型）：表达"只改嵌套对象里的一两个字段"的部分更新语义。
 * 例：save({ cardText: { color: "#f00" } }) —— cardText 其余字段保持不动。
 * 只递归普通对象；数组按整体替换处理（补丁不应该去改数组的某一项）。
 */
export type DeepPartial<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends readonly unknown[]
    ? T[K]
    : NonNullable<T[K]> extends object
      ? DeepPartial<NonNullable<T[K]>>
      : T[K];
};

/** 卡片文字自定义样式：颜色/描边/发光/阴影/背景填充。所有字段都有默认值。 */
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
  /** 标题配色模式：
   *  - "theme"：标题字色跟随主题（--ui-accent），描边色用 strokeColor。
   *  - "random"：每行从 utils/titlePalette 的预设里取一组彩色（字色 + 描边色）。
   *  可选字段：老 config.json 没有它，缺省按 "theme" 处理。 */
  colorMode?: "theme" | "random";
}

/**
 * 背景音乐播放模式（设置项 `AppSettings.musicMode`）：
 *   shuffle    随机循环 —— 洗一轮 → 放完重新洗牌（默认，保持原有行为）
 *   sequential 顺序循环 —— 按曲库顺序，到末尾回第一首
 *   single     单曲循环 —— 自动播完重放这首；手动点"下一首"仍然换曲
 * 定义放这里（而不是 src/utils/musicQueue.ts）是因为它要存进 config.json：
 * 设置字段的类型（AppSettings）与实现分居两处时，最容易出现"存得进读不出"。
 */
export type MusicMode = "shuffle" | "sequential" | "single";

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
  colorMode: "theme",
};

/** 应用的默认设置（config.json 缺失字段时用的兜底值）。
 *  前后端各有一份 AppSettings 接口（字段一致但语义宽松/完整不同），
 *  这里只存"默认值"这份常量，前后端各自 re-export 并标注为自己的 AppSettings 类型。 */
export const DEFAULT_SETTINGS = {
  startupBehavior: "StartNormal",
  enableTray: true,
  minimizeToTray: false,
  closeToTray: false,
  showBatConsole: false,
  language: "zh-CN",
  firstTimeWizardComplete: false,
  // 说明：数据库路径不做配置（固定双库机制：管理端 Admin/library.db、
  // 客户端 library/library.db 每次启动从 Admin 下发复制）。
  // 允许自定义会让"配置的库"和"下发的库"变成两个不同文件，数据来源就不唯一了。
  // 游戏退出后的存档备份：默认"每次都问"（需求指定）。
  // as const：这是**联合类型**字段，不加就会被推宽成 string，赋值给 AppSettings 时类型报错。
  saveBackupMode: "ask" as const,
  // 字体大小（百分比；100 = 原始大小）。
  // 只放大文字，不动界面尺寸（实现见 postcss-font-scale.cjs + src/utils/uiFont.ts）。
  uiFontScale: 100,
  // 自带字体目录（可配置）。空 = <应用 exe 同级>/fonts；打包版另有 <resources>/fonts 兜底。
  fontsDir: "",
  // 背景音乐目录（可配置）。空 = <数据根>/music；目录不存在 = 没有音乐（界面不显示控件）。
  musicDir: "",
  // 背景音乐：是否启用 + 音量（0~100）+ 播放模式。
  musicEnabled: true,
  musicVolume: 50,
  // 播放模式：单曲 / 顺序 / 随机。as const 是因为它是**联合类型**字段，
  // 不加会被推宽成 string，赋回 AppSettings 时报类型错（同 saveBackupMode）。
  musicMode: "shuffle" as const,
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
  cardRowGap: 8,
  sidebarWidth: 210,
  // 用户表（YunGame_UserList.json，明文或原版 JsonCrypt 加密版都能吃）：按本机 IP 判定
  // 黄金版/钻石版。相对路径以「应用 exe 所在目录」为基准（与其它路径字段一致）。
  // 见 docs/design/user-level-detection.md
  yunGameUserListPath: "YunGame_UserList.json",
  // 服务器维护状态表（YunGame_ServerStatus.json）：按用户等级分别控状态，
  // Status=0 表示该等级正在维护（公告窗口会提示并禁止进入系统）。
  // 相对路径同样以「应用 exe 所在目录」为基准。
  yunGameServerStatusPath: "YunGame_ServerStatus.json",
  // 0 = 关闭（默认，按用户表 IP 判定）；非 0 时强制使用该等级：
  // 1 黄金 / 2 钻石 / 3 全解锁。**仅用于本机调试与排障**（没有它，没进名单的开发机
  // 会被判成黄金版，连自测都跑不起来）。
  userLevelOverride: 0,
  currentUserKind: "",
  currentUserName: "",
  currentUserLevel: 3,
  fontFamily: "",
  cardFontSize: 15,
  // 0 = 跟随 cardFontSize（用户要求"简介和游戏名一样大"）；>0 才是显式字号。
  cardDescFontSize: 0,
  cardFontBold: false,
  cardText: DEFAULT_CARD_TEXT,
  themeId: undefined,
  styleId: undefined,
  // 详情页目录（空 = 默认 <数据根>/Game_Details；绝对/相对路径均可，
  // 相对以**应用 exe 所在目录**为基准 —— 见 shared/pathConfig.ts）
  gameDetailsDir: "",
  // 封面图目录（空 = 默认 <数据根>/CoverImages；绝对/相对路径均可，相对以应用 exe 所在目录为基准）
  coverImagesDir: "",
  // 公告目录（空 = 默认 <数据根>/announcements；绝对/相对路径均可，相对以应用 exe 所在目录为基准）
  announcementsDir: "",
  // 数据库"库根"（空 = 默认数据根；绝对/相对路径均可，相对以应用 exe 所在目录为基准）。
  // 只配置根：源库 <库根>/Admin/library.db、运行时库 <库根>/library/library.db 两级
  // 结构固定挂在它下面（保证"配置的库"与"被复制的库"永远是同一对文件）。
  libraryDir: "",
  // 权威库（源库）目录（空 = 默认 <库根>/Admin；绝对/相对路径均可，相对以应用 exe 所在目录为基准）。
  // 无盘网吧环境常把权威库放独立/网络位置：运行时副本每次启动从它复制，权威库只读。
  sourceLibraryDir: "",
  // 存档备份工具 GameSaveHelper.exe 的路径（空 = 未配置，备份不可用）。
  // 绝对路径原样使用；相对路径以应用 exe 所在目录为基准解析。
  gameSaveHelperPath: "",
  // 游戏根目录：游戏按「相对路径」存放时的基准（生产 X:\YunGame\Playnite，
  // 测试 D:\YunGame\Playnite —— 靠这项配置解耦，代码里不写死）。
  // 空 = 回退到数据根（保持旧行为）。绝对路径原样；相对路径以应用 exe 所在目录为基准。
  defaultGameRootPath: "",
  showCardDescription: true,
  // 社区氛围：默认关（避免打扰），用户在设置里开启
  communityEnabled: false,
  // 氛围来源：mock（随机模拟）/ real（真实后端，预留）
  communitySource: "mock",
  // 错误上报/崩溃报告（SMTP 发邮件到收件人邮箱），默认关（隐私考虑）
  errorReport: {
    enabled: false,
    smtpHost: "smtp.qq.com",
    smtpPort: 465,
    smtpUser: "",
    smtpPass: "",
    toEmail: "97407198@qq.com",
    maxPerDay: 3,
  },
};

/** 一次崩溃/错误的统一记录（崩溃处理窗口展示/上报用） */
export interface CrashReport {
  id: string;
  type:
    | "main-exception"
    | "main-rejection"
    | "renderer-gone"
    | "child-gone";
  message: string;
  stack?: string;
  reason?: string;
  appVersion: string;
  platform: string;
  osRelease: string;
  arch: string;
  timestamp: string;
  cwd: string;
}

/** 错误上报/崩溃报告配置（config.json settings.errorReport） */
export interface ErrorReportConfig {
  /** 是否启用错误上报（默认关，隐私考虑） */
  enabled: boolean;
  /** SMTP 服务器（默认 smtp.qq.com） */
  smtpHost: string;
  /** SMTP 端口（465=SSL / 587=STARTTLS） */
  smtpPort: number;
  /** 发件 QQ 邮箱 */
  smtpUser: string;
  /** 授权码（QQ 邮箱设置生成，非登录密码） */
  smtpPass: string;
  /** 收件人邮箱（默认 97407198@qq.com） */
  toEmail: string;
  /** 每天最多发送封数 */
  maxPerDay: number;
}

// ---- 综合主题/配色/字体设计器（Theme Designer）配置 ----
// 存 config.json 的 settings.designer，作为用户自定义视觉设计的持久化。
// 设计器把"配色 + 形状 + 字体 + 卡片 + 背景渐变 + 圆角"整合，预设一键应用 + 分项微调。

/** 渐变配置（背景/面板/卡片在 mode=gradient 时使用） */
export interface GradientSpec {
  /** 起止色（hex） */
  from: string;
  to: string;
  /** 渐变方向（角度 0~360） */
  angle: number;
}

/** 综合设计器配置（config.json settings.designer） */
export interface DesignerConfig {
  /** 当前应用的整套预设 id；undefined = 纯手动搭配 */
  presetId?: string;
  /** 配色方案（themeLibrary 的 palette id） */
  paletteId?: string;
  /** 主背景模式：单色 / 渐变 */
  bgMode: "solid" | "gradient";
  /** 背景渐变参数（bgMode=gradient 时） */
  bgGradient?: GradientSpec;
  /** 面板（侧栏/顶部/弹窗）模式：单色 / 渐变 */
  panelMode: "solid" | "gradient";
  /** 面板渐变参数（panelMode=gradient 时） */
  panelGradient?: GradientSpec;
  /** 全局圆角程度 0~20（按钮/卡片/输入框/面板统一） */
  radius: number;
  /** 形状风格（styleLibrary 的 id），radius 会覆盖它的圆角 */
  styleId?: string;
  /** 界面字体 */
  fontFamily?: string;
  /** 卡片标题/别名字号 */
  cardFontSize: number;
  /** 卡片简介字号 */
  cardDescFontSize: number;
  /** 卡片文字加粗 */
  cardFontBold: boolean;
  /** 卡片背景模式：单色 / 渐变 / panel（跟随面板） */
  cardBg: "solid" | "gradient" | "panel";
  /** 卡片背景色（cardBg=solid 时） */
  cardBgColor?: string;
  /** 卡片渐变参数（cardBg=gradient 时） */
  cardGradient?: GradientSpec;
  /** 卡片边框开关 */
  cardBorder: boolean;
  /** 卡片文字样式（复用 CardTextStyle） */
  cardText: CardTextStyle;
}

/** 设计器默认配置（未设置 designer 时用这份兜底）
 *  默认用 Fluent 2 微软风格（styleId=fluent + p-fluent 配色），圆角 6px 克制度。 */
export const DEFAULT_DESIGNER: DesignerConfig = {
  paletteId: "p-fluent",
  bgMode: "solid",
  panelMode: "solid",
  radius: 6,
  styleId: "fluent",
  fontFamily: "",
  cardFontSize: 15,
  cardDescFontSize: 11,
  cardFontBold: false,
  cardBg: "panel",
  cardBorder: true,
  cardText: DEFAULT_CARD_TEXT,
};

// ============================================================================
// 实体模型（单一事实来源）
// ----------------------------------------------------------------------------
// 这些接口以前在 electron/core/models.ts 与 src/types/models.ts 各写一份，
// 字段名/可选性靠人同步 —— 加字段时要改两处，漏一处就是运行时静默失效
// （本会话在 gameSaveHelperPath / defaultGameRootPath 上各踩了一次）。
// 现在统一放这里，两层只做 re-export；scripts/check-architecture.mjs 会检查
// 这两个 shim 文件里不再出现重复定义。
// ============================================================================

/** 一个游戏运行所依赖的平台（PC / Steam / PS4 / Switch…）。 */
export interface Platform {
  id: string;
  name: string;
  specificationId?: string;
  icon?: string;
}

/** 启动游戏的一个动作（点"开始游戏"实际执行的东西）。 */
export interface GameAction {
  id: string;
  name: string;
  type: "File" | "URL";
  path?: string;
  workingDir?: string;
  arguments?: string;
  /** 是否是"游玩指令"。false 的是辅助动作（存档备份等），不参与启动选择。 */
  isPlayAction: boolean;
  trackGame: boolean;
}

/** 一组游戏（按根目录组织），name 是占位符，用在启动路径的 {name} 里。 */
export interface GameLibrary {
  id: string;
  name: string;
  path: string;
}

/** 游戏的某个语言的名字（如中文名、日文名）。 */
export interface GameName {
  language: string;
  name: string;
}

/** 游戏相关的视频（YouTube 链接 / 本地文件 / 普通网址）。 */
export interface GameVideo {
  /** "youtube" | "file" | "url" */
  type: string;
  url: string;
  name?: string;
}

/** 游戏的一条外链（官网、商店页…）。 */
export interface GameLink {
  name: string;
  url: string;
}

/**
 * 主游戏实体。字段"必填/可选"按**主进程实际产出**定义：
 * 主进程 rowToGame 一定会填 localizedNames/alternateNames/screenshots/videos
 * （arr() 兜底成 []）和 installed（bool()），所以它们是必填而不是可选。
 * 前端原来的"防御式可选"就此收敛 —— 数据来源只有主进程/网站后端两处，都会填满。
 */
export interface Game {
  id: string;
  /** 主显示名（通常是中文常用名）。 */
  name: string;
  /** 原始英文名（origin_name）。老游戏为 NULL 不显示副标题，新游戏手动填。 */
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
  /** 最近一次会话运行了多少秒（进程退出时由后台监控写入）。 */
  lastSessionSeconds: number;
  /** 最近一次会话结束时间（ISO8601）。 */
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
  /**
   * 封面图路径。**运行期算出**：扫封面目录（settings.coverImagesDir）后按游戏名匹配同名文件
   * （规则见 shared/coverMatch.ts），只存在于内存，不落库。
   *
   * ⚠️ 数据库 `games.cover_image` 列**已废弃**：保留不删（旧库兼容）、不再写入；
   * `rowToGame` 仍会读一次旧值（旧库已有值照旧生效），但无效/不在封面目录内时会被
   * 运行期匹配覆盖。新代码请勿把本字段写回数据库。
   */
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
  /** 详情页的 HTML 攻略/说明。 */
  guide?: string;
  screenshots: string[];
  videos: GameVideo[];
  /** 这个游戏属于哪个游戏库（按名字匹配 GameLibrary）。 */
  gameLibrary?: string;
  /** 玩这个游戏需要的权限等级：1 / 2 / 3（用户等级 >= 该值才可玩）。 */
  gameLevel: number;
  /** 启动前执行的脚本（每行一条命令）。 */
  preLaunchScript?: string;
  preLaunchEnabled: boolean;
  /** 游戏进程启动后执行的脚本。 */
  postLaunchScript?: string;
  postLaunchEnabled: boolean;
  /** 游戏退出后执行的脚本。 */
  postExitScript?: string;
  postExitEnabled: boolean;
  /** 存档路径配置（备份/恢复用）。纯字符串数组，含通配符，支持 {游戏库名} 占位符。 */
  savePaths?: string[];
  /**
   * 手动指定的"计时监控 exe"：`进程名|窗口标题关键字`（如 `dotnet.exe|泰拉瑞亚`）。
   * 仅少数"用 start 启动游戏后自身提前退出"的 bat 才需要填。留空 = 自动判定
   * （启动器进程 或 安装目录内进程任一存活即视为运行中）。
   */
  monitorExe?: string;
}

/** 统一用户记录：企业用户（按公网 IP 匹配）和个人用户（账号登录）都存这张表。 */
export interface AppUser {
  id: string;
  account: string;
  passwordHash: string;
  name: string;
  level: number;
  /** "enterprise" | "personal" */
  kind: string;
  ipAddress: string;
  createdAt: string;
  /** 软删除标记：有值表示已删除（保留用于撤销），空表示正常。 */
  deletedAt?: string;
}

/** 主进程"当前会话用户"（登录/企业匹配时确定）。 */
export interface SessionUser {
  /** "enterprise" | "personal" | "guest" */
  kind: string;
  name: string;
  account: string;
  level: number;
}

/** 库统计信息（library_stats 命令返回）。 */
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

/** 库插件注册信息（对应 Playnite 的库插件概念）。 */
export interface LibraryPluginInfo {
  id: string;
  name: string;
  icon?: string;
  enabled: boolean;
}

/**
 * 游戏退出后的存档备份行为。
 *   ask   —— 每次都弹"是否备份存档？"（默认，需求指定）
 *   auto  —— 直接静默备份（GameSaveHelper 传 /q，不弹任何窗口；失败才通知）
 *   never —— 不提示也不备份
 * 判定在主进程（electron/ipc/saveManager.ts），不能只靠前端拦。
 */
export type SaveBackupMode = "ask" | "auto" | "never";

/**
 * 应用设置（存 config.json，不在数据库里）。
 * 主进程与前端共用这一份；缺字段时的兜底值见 DEFAULT_SETTINGS。
 */
export interface AppSettings {
  startupBehavior: string;
  enableTray: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  /** 运行 .bat/.cmd 脚本指令时是否显示控制台窗口。网吧脚本多为菜单式，需要显示。 */
  showBatConsole: boolean;
  language: string;
  firstTimeWizardComplete: boolean;
  /** 【已废弃，不再读取】数据库路径固定为双库机制；读取配置时会剔除该键。 */
  databasePath?: string;
  /** 游戏退出后的存档备份行为（见上 SaveBackupMode）。 */
  saveBackupMode: SaveBackupMode;
  /**
   * 字体大小：百分比（85~140，100 = 原始）。
   * **只管文字，不管界面尺寸**（需求明确：不要调整界面大小）——
   * 实现是给每一处 font-size 乘一个 `--ui-font-scale`（构建期由 postcss-font-scale.cjs
   * 加上，运行时由 src/utils/uiFont.ts 的 applyUiFontScale() 改值）。
   * ⚠️ 与顶栏 Ctrl+滚轮的原生整页缩放是两回事：那个是临时的、会连布局一起放大。
   */
  uiFontScale: number;
  /**
   * 自带字体目录。空 = `<应用 exe 同级>/fonts`（开发态 = 工程根 fonts/）；
   * 打包版还会去找 `<resources>/fonts` 兜底。相对路径以应用 exe 所在目录为基准。
   */
  fontsDir: string;
  /**
   * 背景音乐目录。空 = `<数据根>/music`；目录不存在/没有音频文件 = 没有音乐。
   * 相对路径以应用 exe 所在目录为基准（与其它路径字段一致）。
   */
  musicDir: string;
  /** 是否启用背景音乐（随机循环播放音乐目录里的音频）。 */
  musicEnabled: boolean;
  /** 背景音乐音量（0~100）。 */
  musicVolume: number;
  /** 背景音乐播放模式（单曲循环 / 顺序循环 / 随机循环）。 */
  musicMode: MusicMode;
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
  /** 启动时是否显示登录界面。 */
  loginEnabled: boolean;
  /** 登录方式："wechat"（扫码）或 "account"（账号密码）。 */
  loginType: string;
  /** 当前会话是否已登录。 */
  loggedIn: boolean;
  /** 登录用户名（账号登录时填）。 */
  username?: string;
  /** 启动游戏时是否记录游戏时长。 */
  trackPlaytime: boolean;
  /** 网格卡片宽度（像素）。 */
  cardWidth: number;
  /** 网格卡片水平间距（像素，0~20）。 */
  cardGap: number;
  /** 网格卡片垂直间距（像素，0~60）。 */
  cardRowGap: number;
  /** 左侧边栏宽度（像素，160~600）。 */
  sidebarWidth: number;
  /**
   * 用户表位置（YunGame_UserList.json）：明文或原版 JsonCrypt 加密版都能解析。
   * 相对路径以**应用 exe 所在目录**为基准；未配置时默认 `<应用目录>/YunGame_UserList.json`。
   * 见 docs/design/user-level-detection.md
   */
  yunGameUserListPath?: string;
  /**
   * 服务器维护状态表位置（YunGame_ServerStatus.json）：按用户等级分别控状态，
   * `Status = 0` = 该等级维护中（公告窗口提示并禁止进入系统）。明文或加密版都能解析。
   * 未配置时默认 `<应用目录>/YunGame_ServerStatus.json`。
   */
  yunGameServerStatusPath?: string;
  /**
   * 用户等级覆盖开关：0 = 关闭（按用户表 IP 判定）；非 0 时强制该等级
   * （1 黄金 / 2 钻石 / 3 全解锁）。**仅用于本机调试与排障**：没有它，没进名单的
   * 开发机会被判成黄金版，连自测都跑不起来。
   */
  userLevelOverride?: number;
  /** 当前会话用户类型："enterprise" | "personal" | ""。 */
  currentUserKind: string;
  /** 当前会话用户显示名。 */
  currentUserName: string;
  /** 当前会话用户等级（1|2|3），默认 3 = 全部可玩。 */
  currentUserLevel: number;
  /** 用户选择的界面字体（空 = 用主题默认字体）。 */
  fontFamily: string;
  /** 卡片标题/别名字号（px）。默认 15。 */
  cardFontSize: number;
  /** 卡片简介字号（px）。默认 11。 */
  cardDescFontSize: number;
  /** 卡片标题/别名是否加粗（true=700，false=500）。 */
  cardFontBold: boolean;
  /** 卡片文字自定义样式。CSS 读它注入 --card-text-* 等变量。 */
  cardText: CardTextStyle;
  /** 用户选择的主题调色板 id（themeLibrary 的某个 palette id）。 */
  themeId?: string;
  /** 用户选择的风格 id（styleLibrary 的某个 style id）。 */
  styleId?: string;
  /** 游戏静态详情页目录（空 = 默认 <数据根>/Game_Details）。 */
  gameDetailsDir?: string;
  /** 封面图目录（空 = 默认 <数据根>/CoverImages）。读图白名单跟随该目录。 */
  coverImagesDir?: string;
  /** 公告目录（空 = 默认 <数据根>/announcements）。 */
  announcementsDir?: string;
  /**
   * 数据库"库根"（空 = 默认数据根）：运行时副本所在目录，也是权威库的默认父目录。
   * 解析规则见 shared/pathConfig.ts（桌面端 + 网站端同语义）。
   */
  libraryDir?: string;
  /**
   * 权威库（源库）**目录**（空 = 默认 `<库根>/Admin`）。文件名固定 `library.db`：
   * 运行时副本永远由它复制而来，所以只开放目录、不开放具体文件路径。
   * 无盘网吧环境常把权威库放在独立/网络位置（如 `//NAS/YunGame/Admin`）。
   */
  sourceLibraryDir?: string;
  /** 存档备份工具 GameSaveHelper.exe 的路径（空 = 未配置）。 */
  gameSaveHelperPath?: string;
  /**
   * 游戏根目录：游戏按「相对路径」存放时的基准
   * （生产 X:\YunGame\Playnite、测试 D:\YunGame\Playnite，靠配置解耦）。
   * 空 = 回退数据根。见 docs/design/launch-and-paths.md。
   */
  defaultGameRootPath?: string;
  /**
   * 运行库安装包目录（VC++ 运行库 x64/x86、VP9 解码扩展）。
   * 空 = `<应用 exe 同级>/runtime`；打包版还有 `<resources>/runtime` 兜底。
   * 相对路径以应用 exe 所在目录为基准。见 docs/design/runtime-deps.md。
   */
  runtimeDir?: string;
  /**
   * 开机自启工具 YunGameStart 所在目录（正式机 X 盘 / 测试机 D 盘各一份）。
   * 空 = `<应用 exe 同级>/yungamestart`。见 docs/design/yungamestart.md。
   */
  yungamestartDir?: string;
  /** 网格卡片上是否显示简介（intro）。 */
  showCardDescription: boolean;
  /** 综合主题/配色/字体设计器配置。 */
  designer?: DesignerConfig;
  /** 社区氛围：是否开启"多人氛围"（在线/弹幕/活动流）。 */
  communityEnabled: boolean;
  /** 氛围来源：mock（随机模拟）/ real（真实后端，预留）。 */
  communitySource: string;
  /** 错误上报/崩溃报告（SMTP 发邮件到收件人邮箱），默认关。 */
  errorReport: ErrorReportConfig;
}
