// 前后端共享的"纯数据模型与常量"——单一事实来源（SoT）。
// 背景：CardTextStyle 和 DEFAULT_CARD_TEXT 之前在主进程 electron/core/models.ts
// 和前端 src/types/models.ts 各定义一份（完全相同的副本），改一处漏一处。
// 现在收敛到这里，主进程和前端都从本文件 re-export，消除重复。
// 注意：Game/AppSettings 等主实体接口前后端字段已分叉（前端宽松可选、后端完整必填），
// 不适合强行合并，仍各自保留在各自层。

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
  cardRowGap: 8,
  sidebarWidth: 210,
  enterpriseConfigPath: "D:/1.json",
  currentUserKind: "",
  currentUserName: "",
  currentUserLevel: 3,
  fontFamily: "",
  cardFontSize: 15,
  cardDescFontSize: 11,
  cardFontBold: false,
  cardText: DEFAULT_CARD_TEXT,
  themeId: undefined,
  styleId: undefined,
  // 详情页目录（空 = 默认 <数据根>/Game_Details；绝对/相对路径均可，相对以数据根为基准）
  gameDetailsDir: "",
  // 封面图目录（空 = 默认 <数据根>/CoverImages；绝对/相对路径均可，相对以数据根为基准）
  coverImagesDir: "",
  // 存档备份工具 GameSaveHelper.exe 的路径（空 = 未配置，备份不可用）。
  // 绝对路径原样使用；相对路径以数据根为基准解析。
  gameSaveHelperPath: "",
  // 游戏根目录：游戏按「相对路径」存放时的基准（生产 X:\YunGame\Playnite，
  // 测试 D:\YunGame\Playnite —— 靠这项配置解耦，代码里不写死）。
  // 空 = 回退到数据根（保持旧行为）。绝对路径原样；相对路径以数据根为基准。
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
