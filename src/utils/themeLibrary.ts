// Hand-curated palette library — 6 signature color schemes.
//
// (This file was previously auto-generated with 96 industry palettes by
// scripts/gen-themes.py. It is now a small, hand-authored collection of
// distinctive palettes: Light / Dark / Chinese Red / Chinese Blue /
// Chinese Green / Chinese Ink-wash. It keeps the same ThemePaletteTokens
// shape so the runtime injection (themeApply.ts) and the ThemesSection
// picker work unchanged.)
//
// A palette drives every color token; combining it with a style (styleLibrary)
// yields a full theme. Each entry maps onto both the shadcn-style tokens and
// the legacy business variables (--bg-base/--text-primary/--accent/...).

export interface ThemePaletteTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  ring: string;
  bgBase: string;
  bgTop: string;
  bgSidebar: string;
  bgPanel: string;
  bgItemHover: string;
  bgItemActive: string;
  bgInput: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textDim: string;
  accent: string;
  accentHover: string;
  accentSoft: string;
  success: string;
  warning: string;
  danger: string;
}

export interface ThemeEntry {
  id: string;
  name: string;
  zh: string;
  category: string;
  palette: ThemePaletteTokens;
  /** 可选：指向 body 的专属 class 名。
   *  设置后，ThemesSection 切换 palette 时会给 body 加这个 class，
   *  global.css 写 `body.<gradientClass> { background: ... }` 用作专属渐变背景。
   *  例如"钻石版"用 "theme-diamond" 实现青→紫→粉斜向渐变。 */
  gradientClass?: string;
}

export const themeLibrary: ThemeEntry[] = [
  {
    id: "p-light",
    name: "Bright",
    zh: "明亮",
    category: "基础",
    palette: {
      background: "#F4F6FA",
      foreground: "#1B2430",
      card: "#ffffff",
      cardForeground: "#1B2430",
      primary: "#2563EB",
      primaryForeground: "#ffffff",
      secondary: "#EDF1F7",
      secondaryForeground: "#1B2430",
      muted: "#E9EDF4",
      mutedForeground: "#5B6472",
      border: "#D8DEE8",
      ring: "#2563EB",
      bgBase: "#F4F6FA",
      bgTop: "#ffffff",
      bgSidebar: "#ffffff",
      bgPanel: "#ffffff",
      bgItemHover: "#E9EEF6",
      bgItemActive: "#DDE5F1",
      bgInput: "#ffffff",
      borderStrong: "#C3CBD9",
      textPrimary: "#1B2430",
      textSecondary: "#465060",
      textDim: "#77808F",
      accent: "#2563EB",
      accentHover: "#3B82F6",
      accentSoft: "rgba(37, 99, 235, 0.14)",
      success: "#16A34A",
      warning: "#D97706",
      danger: "#DC2626",
    },
  },
  {
    id: "p-dark",
    name: "Dark",
    zh: "暗黑",
    category: "基础",
    palette: {
      background: "#0B0C10",
      foreground: "#E6E8EE",
      card: "#15161D",
      cardForeground: "#E6E8EE",
      primary: "#6D5DF6",
      primaryForeground: "#ffffff",
      secondary: "#1C1E27",
      secondaryForeground: "#E6E8EE",
      muted: "#191B24",
      mutedForeground: "#8A8DA0",
      border: "#262935",
      ring: "#6D5DF6",
      bgBase: "#0B0C10",
      bgTop: "#15161D",
      bgSidebar: "#101218",
      bgPanel: "#15161D",
      bgItemHover: "#1F2230",
      bgItemActive: "#262A3B",
      bgInput: "#0F1016",
      borderStrong: "#343A4E",
      textPrimary: "#E6E8EE",
      textSecondary: "#A2A6B8",
      textDim: "#7A7E93",
      accent: "#6D5DF6",
      accentHover: "#8377FF",
      accentSoft: "rgba(109, 93, 246, 0.18)",
      success: "#2FBF7F",
      warning: "#E0A63A",
      danger: "#E5484D",
    },
  },
  {
    id: "p-cn-red",
    name: "Chinese Red",
    zh: "中国红",
    category: "中国风",
    palette: {
      // 朱金（Vermilion + Gold）中国宫殿配色：
      //   背景 = 朱红 #9D2933（用户指定）
      //   文字 = 亮金 #F0D58A 系列（用户要求）
      //   边框/描边 = 暗金 + 深红，hover/选中用纯金提亮
      // 整体思路：红底金字 + 金色描边，对比度足够但不刺眼，典雅不浮躁。
      background: "#9D2933",
      foreground: "#F0D58A",
      card: "#A8333D", // 卡片底色比背景稍亮，让封面区与背景能分开
      cardForeground: "#F0D58A",
      primary: "#F0D58A", // 主色用作按钮/重点：亮金
      primaryForeground: "#3A0D12",
      secondary: "#8A242D",
      secondaryForeground: "#F0D58A",
      // muted 原本和 secondary 一样（#8A242D），层次重叠；改更深一档，
      // 让"不可交互区域"和"次级按钮"在视觉上区分开。
      muted: "#7C1F28",
      mutedForeground: "#D4B872",
      border: "#7A1F28", // 描边默认用深红（不抢戏）
      ring: "#E5B04B", // 焦点环用纯金（醒目但不刺）
      bgBase: "#9D2933",
      bgTop: "#A82F3A", // 顶栏稍亮，区分层次
      bgSidebar: "#8A242D", // 侧栏稍暗，背景对比
      bgPanel: "#A5313B", // 面板介于背景和顶栏之间
      bgItemHover: "#B73E48",
      bgItemActive: "#C44A55",
      bgInput: "#8A242D", // 输入框底色深一档
      borderStrong: "#E5B04B", // 强调边框用纯金（选中行/重要分隔）
      textPrimary: "#F0D58A", // 主文字：亮金（对比朱红底 ≈ 5.2:1，AA 达标）
      textSecondary: "#D4B872", // 次要文字：浅金
      // textDim 从 #A48B5A（暗金）提亮到 #D6B26A：原来在朱红底上对比仅
      // ≈2.7:1（偏低，看不清），提亮后 ≈3.5:1，弱提示文字也清晰可读。
      textDim: "#D6B26A",
      accent: "#E5B04B", // 强调：纯金
      accentHover: "#FFE082", // hover 升一档，更亮
      accentSoft: "rgba(229, 176, 75, 0.20)", // 透明底用作徽章
      success: "#9CCB6B", // 绿色（青瓷感）
      warning: "#E5B04B", // 警告 = 金
      danger: "#FF7B86", // 危险：浅红，在红底上更亮
    },
  },
  {
    id: "p-cn-blue",
    name: "Chinese Blue",
    zh: "中国蓝",
    category: "中国风",
    palette: {
      background: "#0C1B33",
      foreground: "#E8F0FB",
      card: "#12233F",
      cardForeground: "#E8F0FB",
      primary: "#2E6FDB",
      primaryForeground: "#ffffff",
      secondary: "#182E4F",
      secondaryForeground: "#E8F0FB",
      muted: "#142743",
      mutedForeground: "#9FB6D6",
      border: "#1E3A63",
      ring: "#3E8BE8",
      bgBase: "#0C1B33",
      bgTop: "#11233F",
      bgSidebar: "#0E1E37",
      bgPanel: "#12233F",
      bgItemHover: "#1A3052",
      bgItemActive: "#1F3A64",
      bgInput: "#0A182C",
      borderStrong: "#2E5488",
      textPrimary: "#E8F0FB",
      textSecondary: "#A9BFDE",
      textDim: "#6E87A8",
      accent: "#3E8BE8",
      accentHover: "#5FA3F2",
      accentSoft: "rgba(62, 139, 232, 0.18)",
      success: "#4FB0A0",
      warning: "#D9A441",
      danger: "#E05C5C",
    },
  },
  {
    id: "p-cn-green",
    name: "Chinese Green",
    zh: "中国绿",
    category: "中国风",
    palette: {
      background: "#EFF5EA",
      foreground: "#1E2A1C",
      card: "#F8FBF4",
      cardForeground: "#1E2A1C",
      primary: "#3E7A3E",
      primaryForeground: "#ffffff",
      secondary: "#E3EDD9",
      secondaryForeground: "#1E2A1C",
      muted: "#E1EBD6",
      mutedForeground: "#6E8068",
      border: "#C8D8BA",
      ring: "#4E9447",
      bgBase: "#EFF5EA",
      bgTop: "#F4F8EE",
      bgSidebar: "#E8F1DD",
      bgPanel: "#F8FBF4",
      bgItemHover: "#E4EDD8",
      bgItemActive: "#D7E5C7",
      bgInput: "#F2F7EC",
      borderStrong: "#A7C396",
      textPrimary: "#1E2A1C",
      textSecondary: "#54634E",
      textDim: "#85917E",
      accent: "#4E9447",
      accentHover: "#63A85B",
      accentSoft: "rgba(78, 148, 71, 0.16)",
      success: "#5AA65A",
      warning: "#C9A24B",
      danger: "#C4574A",
    },
  },
  {
    id: "p-cn-ink",
    name: "Ink-wash",
    zh: "中国水墨",
    category: "中国风",
    palette: {
      background: "#EDEBE6",
      foreground: "#242220",
      card: "#F6F4F0",
      cardForeground: "#242220",
      primary: "#3C3A37",
      primaryForeground: "#F5F3EF",
      secondary: "#E4E1DB",
      secondaryForeground: "#242220",
      muted: "#E0DDD7",
      mutedForeground: "#7C7871",
      border: "#CFCBC3",
      ring: "#6B665F",
      bgBase: "#EDEBE6",
      bgTop: "#F1EFEB",
      bgSidebar: "#E8E5DF",
      bgPanel: "#F6F4F0",
      bgItemHover: "#E1DED7",
      bgItemActive: "#D6D2CA",
      bgInput: "#EFEDE8",
      borderStrong: "#B7B1A8",
      textPrimary: "#242220",
      textSecondary: "#5C5852",
      textDim: "#8A857E",
      accent: "#4B4640",
      accentHover: "#635D56",
      accentSoft: "rgba(75, 70, 64, 0.16)",
      success: "#6E7F5A",
      warning: "#9C8A5C",
      danger: "#A24A42",
    },
  },
  {
    // "山水蓝"配色：背景就是水的蓝色（不是米白留白）
    // 区别于 p-cn-blue（深海军蓝底）：这个用"清透水蓝"做底，像湖泊/江水
    //   的蓝，配合深蓝山的文字与强调，视觉如山水画。
    //   文字用深蓝（在水蓝底上有对比），主色/强调用更深的水蓝。
    id: "p-cn-blue-mountain",
    name: "Blue Mountain",
    zh: "山水蓝",
    category: "中国风",
    palette: {
      background: "#6FA3C7",
      foreground: "#0F2940",
      card: "#79A9CB",
      cardForeground: "#0F2940",
      primary: "#2E5E7E",
      primaryForeground: "#F0F6FA",
      secondary: "#5C8FB2",
      secondaryForeground: "#F0F6FA",
      // muted 原与 secondary 相同（#5C8FB2），层次重叠；改更深一档区分。
      muted: "#4A7BA0",
      mutedForeground: "#D7E6F2",
      border: "#46708F",
      ring: "#1F4A6E",
      bgBase: "#6FA3C7",
      bgTop: "#79A9CB",
      bgSidebar: "#5C8FB2",
      bgPanel: "#76A6C9",
      bgItemHover: "#8AB6D5",
      bgItemActive: "#9CC2DC",
      bgInput: "#5C8FB2",
      borderStrong: "#2E5E7E",
      // textPrimary 加深：原 #16324A 在水蓝底上仅 ≈4.6:1，提到 #0F2940 后
      // ≈5:1，AA 更稳。
      textPrimary: "#0F2940",
      textSecondary: "#1F4A6E",
      // textDim 是本次最大修复：原 #A8C6DC（浅水蓝）在水蓝底上对比仅 ≈1.9:1
      // 几乎看不清；改成深水蓝 #3A6284，对比提升到 ≈4:1，弱提示文字可读。
      textDim: "#3A6284",
      accent: "#2E5E7E",
      accentHover: "#244C6B",
      // accentSoft 透明底稍加深，让徽章在水蓝底上更清晰。
      accentSoft: "rgba(46, 94, 126, 0.22)",
      success: "#3F9E8F",
      warning: "#D9A441",
      danger: "#C4574A",
    },
  },
  {
    // "钻石版"渐变配色：背景是青→紫→粉的斜向渐变（钻石般的彩色光泽）。
    // 通过 body[data-theme-id="p-diamond"] 在 global.css 覆盖背景；
    // 这里 token 用"中段紫蓝 + 浅文字"——保证卡片/文字在亮色渐变上仍可读。
    id: "p-diamond",
    name: "Diamond",
    zh: "钻石版",
    category: "特别版",
    palette: {
      // bgBase/bgTop 在这个 palette 下不会被使用（body 背景被 CSS 覆盖），
      // 但为了"恢复"或 fallback 时不出现刺眼的纯色，填入渐变的中段色。
      background: "#7B6CF6",
      foreground: "#FFFFFF",
      card: "#FFFFFF",
      cardForeground: "#2A1F4A",
      primary: "#3CC8F4",
      primaryForeground: "#0D2A3F",
      secondary: "#F0E5FF",
      secondaryForeground: "#2A1F4A",
      muted: "#E0D4F5",
      mutedForeground: "#5C4A7E",
      border: "#C5B5E0",
      ring: "#B557E8",
      bgBase: "#7B6CF6",
      bgTop: "#3CC8F4",
      bgSidebar: "#5C4FCC",
      bgPanel: "#FFFFFF",
      bgItemHover: "#F2EAFF",
      bgItemActive: "#E0D4F5",
      bgInput: "#FFFFFF",
      borderStrong: "#B557E8",
      textPrimary: "#FFFFFF",
      textSecondary: "#F0E5FF",
      textDim: "#C5B5E0",
      accent: "#B557E8",
      accentHover: "#C66BEE",
      accentSoft: "rgba(181, 87, 232, 0.20)",
      success: "#3FBFA8",
      warning: "#F2A93B",
      danger: "#F66B6B",
    },
  },
  {
    // "古地图"配色：羊皮纸沙色 + 棕橙 + 深棕文字，像考古地图集/探险日志
    // 区别于"中国红/蓝/绿/水墨"：更偏探险+考古+沙漠的"西部/全球地理"风格
    // 视觉气质：温暖、复古、博物
    id: "p-ancient-map",
    name: "Ancient Map",
    zh: "古地图",
    category: "特别版",
    palette: {
      // 背景：羊皮纸米沙色，旧地图底
      background: "#E8D9B8",
      foreground: "#3A2A14",
      card: "#F0E2C2",
      cardForeground: "#3A2A14",
      primary: "#8B5A2B",
      primaryForeground: "#FBF5E5",
      secondary: "#D5C098",
      secondaryForeground: "#3A2A14",
      muted: "#C9B189",
      mutedForeground: "#6B5A45",
      border: "#A88760",
      ring: "#A0522D",
      bgBase: "#E8D9B8",
      bgTop: "#F0E2C2",
      bgSidebar: "#8B6A3F",
      bgPanel: "#EDDFC0",
      bgItemHover: "#D8C49A",
      bgItemActive: "#C9B189",
      bgInput: "#DDC9A1",
      borderStrong: "#A0522D",
      textPrimary: "#3A2A14",
      textSecondary: "#6B5A45",
      textDim: "#A89880",
      accent: "#A0522D",
      accentHover: "#B4632A",
      accentSoft: "rgba(160, 82, 45, 0.20)",
      success: "#6B8E23",
      warning: "#C9A24B",
      danger: "#A04030",
    },
  },
  {
    // 魔兽世界·醒目史诗增强版
    // 用户要求的"高清晰度史诗感"：背景压暗、文字/边框/血条全面提亮提纯
    //   金色更金（#FFD866 / #C8A86A）、血条亮红（#D93A2A）、法力奥术蓝（#2A8AD9）
    id: "p-wow-epic",
    name: "World of Warcraft · Vivid",
    zh: "魔兽世界",
    category: "特别版",
    palette: {
      background: "#120E0A", // 主背景：更深更沉，衬托前景
      foreground: "#FFF3E0", // 主文字：亮暖白
      card: "#2A1F18", // 次级背景
      cardForeground: "#FFF3E0",
      primary: "#FFD866", // 强调：任务金色
      primaryForeground: "#120E0A",
      secondary: "#2A1F18",
      secondaryForeground: "#FFF3E0",
      muted: "#2A1F18",
      mutedForeground: "#C8B8A0", // 副字体：大幅提亮
      border: "#7A6048", // 主边框：古铜提亮
      ring: "#C8A86A", // 高亮边框：亮金
      bgBase: "#120E0A",
      bgTop: "#1C150E",
      bgSidebar: "#241B13",
      bgPanel: "#1F1812",
      bgItemHover: "#33281E",
      bgItemActive: "#3D3228",
      bgInput: "#241B13",
      borderStrong: "#C8A86A", // 高亮边框（悬停/选中）
      textPrimary: "#FFF3E0",
      textSecondary: "#C8B8A0",
      textDim: "#8A7A66",
      accent: "#FFD866",
      accentHover: "#FFE08A",
      accentSoft: "rgba(255, 216, 102, 0.20)",
      success: "#30D080", // 友方血条亮红之外的辅助绿（这里用翠绿做成功）
      warning: "#FFD866",
      danger: "#F05040", // 警告/危险：纯正亮红
    },
  },
  {
    // 英雄联盟·醒目科技竞技增强版
    // 用户要求的"电竞级清晰度"：背景近纯黑、边框/文字提亮、血量翠绿、法力电光蓝、金币亮金
    id: "p-lol-neon",
    name: "League of Legends · Neon",
    zh: "英雄联盟",
    category: "特别版",
    palette: {
      background: "#05080D", // 主背景：无限接近纯黑
      foreground: "#FFFFFF", // 主文字：纯白
      card: "#101A26", // 次级背景
      cardForeground: "#FFFFFF",
      primary: "#E8C860", // 强调：亮金（英雄名/关键信息）
      primaryForeground: "#05080D",
      secondary: "#101A26",
      secondaryForeground: "#FFFFFF",
      muted: "#101A26",
      mutedForeground: "#A0B8C8", // 副字体：蓝灰提亮
      border: "#4A6A8A", // 主边框：钢蓝提亮
      ring: "#7AB8E8", // 高亮边框：亮冰蓝
      bgBase: "#05080D",
      bgTop: "#0B1119",
      bgSidebar: "#0D1420",
      bgPanel: "#0A101A",
      bgItemHover: "#16222F",
      bgItemActive: "#1A2838",
      bgInput: "#0D1420",
      borderStrong: "#7AB8E8", // 高亮边框（悬停/选中）
      textPrimary: "#FFFFFF",
      textSecondary: "#A0B8C8",
      textDim: "#5A708A",
      accent: "#40A0FF", // 法力/能量：电光蓝
      accentHover: "#66B0FF",
      accentSoft: "rgba(64, 160, 255, 0.20)",
      success: "#30D080", // 血量：翠绿
      warning: "#FFD850", // 金币/经济：亮金
      danger: "#FF4A4A", // 警告/危险：纯亮红
    },
  },
  {
    // 渐变配色：雾蓝 / 浅灰（横向 50/50 渐变）。来自用户色卡 #0EA5E9 / #D1D5DB。
    // token 颜色仅作"非渐变区域"（卡片/面板/输入框等）兜底，主背景由 CSS 的
    // body.theme-grad-mist-blue 覆盖为横向渐变。
    id: "p-grad-mist-blue",
    name: "Mist Blue / Light Gray",
    zh: "雾蓝浅灰",
    category: "特别版",
    gradientClass: "theme-diamond", // 共用 theme-diamond class，CSS 用 attribute selector 分发不同渐变色
    palette: {
      background: "#0EA5E9",
      foreground: "#0F1B2A",
      card: "#FFFFFF",
      cardForeground: "#0F1B2A",
      primary: "#0EA5E9",
      primaryForeground: "#FFFFFF",
      secondary: "#E5E7EB",
      secondaryForeground: "#0F1B2A",
      muted: "#E5E7EB",
      mutedForeground: "#4B5563",
      border: "#9CA3AF",
      ring: "#0EA5E9",
      bgBase: "#0EA5E9",
      bgTop: "#38BDF8",
      bgSidebar: "#0284C7",
      bgPanel: "#F3F4F6",
      bgItemHover: "#E5E7EB",
      bgItemActive: "#D1D5DB",
      bgInput: "#FFFFFF",
      borderStrong: "#0EA5E9",
      textPrimary: "#0F1B2A",
      textSecondary: "#374151",
      textDim: "#6B7280",
      accent: "#0EA5E9",
      accentHover: "#0284C7",
      accentSoft: "rgba(14, 165, 233, 0.20)",
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#EF4444",
    },
  },
  {
    // 渐变配色：墨黑 / 墨紫（横向 50/50 渐变）。#0B0C10 / #A855F7。
    id: "p-grad-ink-purple",
    name: "Ink Black / Ink Purple",
    zh: "墨黑墨紫",
    category: "特别版",
    gradientClass: "theme-diamond", // 共用 theme-diamond class，CSS 用 attribute selector 分发不同渐变色
    palette: {
      background: "#0B0C10",
      foreground: "#E9D5FF",
      card: "#1F1726",
      cardForeground: "#E9D5FF",
      primary: "#A855F7",
      primaryForeground: "#0B0C10",
      secondary: "#1F1726",
      secondaryForeground: "#E9D5FF",
      muted: "#1F1726",
      mutedForeground: "#C4B5FD",
      border: "#4C1D95",
      ring: "#A855F7",
      bgBase: "#0B0C10",
      bgTop: "#1A1023",
      bgSidebar: "#0B0C10",
      bgPanel: "#160D1F",
      bgItemHover: "#251535",
      bgItemActive: "#332047",
      bgInput: "#160D1F",
      borderStrong: "#A855F7",
      textPrimary: "#E9D5FF",
      textSecondary: "#C4B5FD",
      textDim: "#7C3AED",
      accent: "#A855F7",
      accentHover: "#9333EA",
      accentSoft: "rgba(168, 85, 247, 0.22)",
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#F87171",
    },
  },
  {
    // 渐变配色：赭红 / 深棕（横向 50/50 渐变）。#E11D48 / #3F1F1F。
    id: "p-grad-vermilion",
    name: "Vermilion / Dark Brown",
    zh: "赭红深棕",
    category: "特别版",
    gradientClass: "theme-diamond", // 共用 theme-diamond class，CSS 用 attribute selector 分发不同渐变色
    palette: {
      background: "#E11D48",
      foreground: "#FFF1F2",
      card: "#3F1F1F",
      cardForeground: "#FFF1F2",
      primary: "#E11D48",
      primaryForeground: "#FFF1F2",
      secondary: "#3F1F1F",
      secondaryForeground: "#FECACA",
      muted: "#3F1F1F",
      mutedForeground: "#FCA5A5",
      border: "#7F1D1D",
      ring: "#E11D48",
      bgBase: "#E11D48",
      bgTop: "#F43F5E",
      bgSidebar: "#3F1F1F",
      bgPanel: "#4A2525",
      bgItemHover: "#5A2A2A",
      bgItemActive: "#6B2F2F",
      bgInput: "#3F1F1F",
      borderStrong: "#E11D48",
      textPrimary: "#FFF1F2",
      textSecondary: "#FECACA",
      textDim: "#F87171",
      accent: "#E11D48",
      accentHover: "#BE123C",
      accentSoft: "rgba(225, 29, 72, 0.20)",
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#FB7185",
    },
  },
  {
    // 渐变配色：桃粉 / 墨绿（横向 50/50 渐变）。#FBCFE8 / #065F46。
    id: "p-grad-pink-green",
    name: "Pink / Ink Green",
    zh: "桃粉墨绿",
    category: "特别版",
    gradientClass: "theme-diamond", // 共用 theme-diamond class，CSS 用 attribute selector 分发不同渐变色
    palette: {
      background: "#FBCFE8",
      foreground: "#064E3B",
      card: "#FFFFFF",
      cardForeground: "#064E3B",
      primary: "#065F46",
      primaryForeground: "#FBCFE8",
      secondary: "#F0FDF4",
      secondaryForeground: "#064E3B",
      muted: "#F0FDF4",
      mutedForeground: "#047857",
      border: "#6EE7B7",
      ring: "#065F46",
      bgBase: "#FBCFE8",
      bgTop: "#FCE7F3",
      bgSidebar: "#065F46",
      bgPanel: "#ECFDF5",
      bgItemHover: "#D1FAE5",
      bgItemActive: "#A7F3D0",
      bgInput: "#FFFFFF",
      borderStrong: "#065F46",
      textPrimary: "#064E3B",
      textSecondary: "#047857",
      textDim: "#6EE7B7",
      accent: "#065F46",
      accentHover: "#064E3B",
      accentSoft: "rgba(6, 95, 70, 0.20)",
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#EF4444",
    },
  },
  {
    // 渐变配色：苔绿 / 姜黄（横向 50/50 渐变）。#10B981 / #FBBF24。
    id: "p-grad-moss-yellow",
    name: "Moss Green / Ginger Yellow",
    zh: "苔绿姜黄",
    category: "特别版",
    gradientClass: "theme-diamond", // 共用 theme-diamond class，CSS 用 attribute selector 分发不同渐变色
    palette: {
      background: "#10B981",
      foreground: "#1F2937",
      card: "#FFFFFF",
      cardForeground: "#1F2937",
      primary: "#10B981",
      primaryForeground: "#FFFFFF",
      secondary: "#FEF3C7",
      secondaryForeground: "#1F2937",
      muted: "#FEF3C7",
      mutedForeground: "#92400E",
      border: "#FCD34D",
      ring: "#10B981",
      bgBase: "#10B981",
      bgTop: "#34D399",
      bgSidebar: "#0F766E",
      bgPanel: "#FFFBEB",
      bgItemHover: "#FEF3C7",
      bgItemActive: "#FDE68A",
      bgInput: "#FFFFFF",
      borderStrong: "#FBBF24",
      textPrimary: "#1F2937",
      textSecondary: "#374151",
      textDim: "#6B7280",
      accent: "#FBBF24",
      accentHover: "#F59E0B",
      accentSoft: "rgba(251, 191, 36, 0.22)",
      success: "#10B981",
      warning: "#F59E0B",
      danger: "#EF4444",
    },
  },
];
