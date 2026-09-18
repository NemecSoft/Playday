# 主题（视觉风格）与配色（调色板）设计规范

## 术语澄清（重要）

本项目里有两个易混淆的概念，本规范先明确区分：

| 概念 | 代码对应 | 作用 | 说明 |
|------|---------|------|------|
| **主题 / 视觉风格** | `styleLibrary`（`src/utils/styleLibrary.ts`） | **形状与质感**（圆角 radius、阴影 shadow、发光 glow、字体 font、模糊 blur、特效 fx） | 决定"界面长什么样、什么质感"，**不含颜色** |
| **配色 / 调色板** | `themeLibrary`（`src/utils/themeLibrary.ts`） | **颜色变量**（`--accent`、`--bg-base`、`--text-*` 等） | 决定"用什么颜色"，与主题解耦 |

**核心原则：主题管"形状"，配色管"颜色"，两者互不干涉、不冲突。**

---

## 一、主题（视觉风格）收敛规范

### 1.1 只保留 3 个主题

主题（`styleLibrary`）保留以下 **4 个**，其余全部移除：

| 保留 | id | 说明 |
|------|----|------|
| 苹果 | `apple` | 大圆角、毛玻璃质感、柔和投影 |
| 浮雕 | `s2` (Neumorphism) | 软浮雕：柔和内嵌/凸起光影，圆润 |
| **机械感**（新增） | `mechanical`（新建 id） | **需新设计**，金属机械的科技感（硬朗边角、机械咬合、电路/铆钉等元素） |
| **Recordly**（新增） | `recordly` | **借鉴 Recordly 录制软件**：克制 SaaS 风、大圆角卡片、SF Pro 字体、**蓝→橙→黄渐变描边**（自带固定调色板，见 1.4 例外） |

### 1.2 需要移除的主题

| 移除 | id | 当前名字 |
|------|----|---------|
| 毛玻璃 | `s3` | Glassmorphism |
| 粗野硬朗 | `s4` | Brutalism |
| 赛博朋克 | `s35` | Cyberpunk / Sci-Fi HUD |
| 像素风 | `s43` | Pixel Art |
| 复古未来 | `s10` | Retro-Futurism / Vaporwave |

> **注意**："机械感"是**新增风格**，不是复用现有 `s35` 赛博朋克。需按"机械、金属、咬合"重新设计（后续实现）。

### 1.3 主题不得包含任何"配色"

- 主题（`styleLibrary` 的 `StyleVars`）只能定义**非颜色**变量：`radius / glow / shadow / font / blur / fx`。
- `fx`（效果标签）**只能驱动形状/质感/动效，不允许带具体颜色值**（如霓虹色、硬边色）。
- 主题不得写死任何 `#hex` / `rgb()` / 具体色名；颜色一律交给配色（palette）的 `--accent` 等变量，或 `color-mix(in srgb, var(--accent) …)` 派生。
- 这样任意主题 × 任意配色都能组合，不会出现"这个主题配上那个配色就难看/冲突"。

### 1.3.1 统一按钮文字色 `--ui-accent`：跟随 `--text-primary` 而非 `--accent`

- 全局统一的"按钮/标题文字色" `--ui-accent`（侧栏按钮、卡片主标题、副标题、简介、顶栏激活 tab 等）默认 `var(--text-primary)`。
- **不能用 `var(--accent)`**：Recordly 等浅色 accent 配色（蓝色 accent + 淡蓝背景）会导致"同色系看不清"。`text-primary` 是每个配色优化的"可读主文字色"，在所有配色下都清晰（暗黑下浅、中国红下金、Recordly 下深）。
- 将来想"统一改"按钮文字色，只改 `--ui-accent` 默认值即可。

### 1.4 例外：Recordly 主题自带固定调色板

- **Recordly 是唯一"形状 + 固定颜色一起搬"的特例**（用户明确要求借鉴 Recordly 的完整视觉，含其蓝→橙→黄渐变描边）。
- 它由 `styleLibrary` 的 `recordly`（形状）+ `themeLibrary` 的 `p-recordly`（固定配色）组成。
- **联动**：在 `ThemesSection` 里选中 `recordly` 主题时，会自动同时应用 `p-recordly` 配色（`ThemesSection.tsx` 的 onClick/onKeyDown 里加了联动），用户点一下就是完整 Recordly 效果。
- 卡片的蓝→橙→黄渐变描边由 `:root[data-fx="recordly"] .grid-card::before` 实现（`global.css`），是第一个真正使用 `fx` 标签驱动专属 CSS 效果的主题。

---

## 二、配色（调色板）规范

> **列表顺序 = 设置里的显示顺序。** 当前最前面三个是"游戏主题"配色
> —— **游戏夜色 / 游戏红酒 / 暗夜青绿**（见 2.4~2.6），排在「明亮 / 暗黑」之前。
> 顺序由 `themeLibrary` 数组顺序决定；`_rebuild-themes.mjs` 的 `KEEP` 顺序必须与之一致
> （那个脚本会整体重建本文件）。

### 2.1 配色保持现状，不精简

`themeLibrary` 里的全部配色（明亮/暗黑/中国风/渐变/背景主题等）**全部保留**，本次只整理主题，不删配色。

### 2.2 配色独立，不与主题冲突

- 配色由 `body.theme-*` / `[data-theme-id]` 注入 CSS 变量，**只改颜色**，不改形状。
- 配色负责所有颜色来源：`--accent`、`--accent-hover`、`--accent-soft`、`--bg-base`、`--bg-panel`、`--text-*`、`--border` 等。
- 主题通过 `var(--accent)`、`color-mix(in srgb, var(--accent) …)` 取色，**永远不自己写色值**，从而天然与配色兼容。

### 2.3 待整改：与"解耦"冲突的历史遗留

当前存在一些"主题/配色混合"的历史实现，与"主题管形状、配色管颜色"冲突，**后续需逐步收敛**（本次仅记录，不立即改）：

| 位置 | 问题 | 整改方向 |
|------|------|---------|
| `body.theme-diamond`（global.css L359-385） | 渐变**背景颜色**挂在"主题"下，还按 `data-theme-id` 细分 | 这类渐变背景属于"配色"，应从主题体系剥离，归入配色或独立"背景方案" |
| `body.theme-reactbits`（global.css L390-418） | 光晕动态**背景**挂在"主题"下 | 属于"背景效果"，应归入配色/背景层，不与形状主题耦合 |
| `fx` 里的 `cyber` / `neon` 等 | 部分 fx 在 global.css 里可能带霓虹等**颜色效果** | fx 只保留形状/质感/动效，颜色一律走 `var(--accent)` 派生 |

### 2.3.1 配色的生成与修复：MD3 色调体系（脚本基线）

2026-09-18 起，配色的**推导与修复**统一走 `scripts/lib/md3Color.mjs`：chroma-js + Material Design 3
的 tonal（色调）体系。判据不是眼睛，是 **tone** —— MD3 的 CIE L*（0 = 纯黑，100 = 纯白），
配合 MD3 的角色对照表 `ROLE_TONES`（表面 6/98、主色 80/40、正文 90/10、outline 60/50 …）。

**为什么换掉旧做法**：`fix-contrast.mjs` 原来修对比度是"RGB 三通道每步各 ±2 硬拖"，
**不保色相** —— 酒红被拖成灰粉、金色被拖成土黄，越修越脏。"不合适"多半就是这么来的。
现在改色只走 tone：色相与彩度原样带着走（色域装不下时保色相、退彩度）。

| 工具 | 干什么 |
| --- | --- |
| `scripts/lib/md3Color.mjs` | 引擎：tone ↔ OKLCH 换算、保色相的色调调整、色域映射、**最小改动**的对比度达标、MD3 角色 tone 对照表、语义色固定色相 |
| `scripts/fix-contrast.mjs` | 修 `themeLibrary.ts`：① 文字可读性 ② 语义色撞车归位 ③ 边框色调间距 ④ MD3 角色偏离（只提示）。默认空跑，`--apply` 才写，`--only p-xxx` 只处理一个配色 |
| `scripts/contrast-audit.mjs` | 只读审计（老工具，仍在） |
| `scripts/lib/md3Color.test.mjs` | 引擎测试：锁住"改 tone 保色相""修对比度刚好够"等性质，`npm test` 会跑 |

**一次修复的战果**（2026-09-18）：扫描 43 个配色，改 **78 处 / 32 个配色**（`npm run check` 的对比度守卫全过）。
例：twitter 的 `textDim` 1.89:1 → 3.07:1、`textSecondary` 2.98 → 4.12；
赛博朋克的 `primaryForeground`（白字压在亮青按钮上，旧脚本判"无解"直接跳过）改成深色后 3.45 → 4.61。

> **别再改回去的地方**：旧写回方式是 `src.split(/id:\s*"([^"]+)"/)` 再 `join("")` ——
> split 会把 `id: "` 和结尾那个 `"` 一并吃掉，join 回去就成 `p-playnite,`，**直接把文件写成语法错误**
> （2026-09-18 踩过，靠 `npm run check` 抓到）。现在改为**按 id 锚定的原地替换**，见该脚本注释。

#### 静态主题（`global.css` 的 11 套）也走同一套引擎

之前这批是**手写色值**（"待收敛"），2026-09-18 起改成**由生成器推导**：
`scripts/lib/staticThemes.mjs`，CLI 是 `scripts/gen-static-themes.mjs`（`npm run themes:gen` / `npm run themes:audit`）。
覆盖 `default`（裸 `:root`，首启动那套）+ 卡通 / 赛博朋克 / 孟菲斯 / 新拟态 / 美漫 / 吉卜力 / 中国风 / 魔兽 / LOL / PUBG。

推导规则一句话：**色相与彩度保留（那是每套主题的性格），只把 tone 对齐 MD3 角色表**。

- **表面**（`--bg-*`）由该主题自己的 `--bg-base` 派生：同色相、极低彩度（MD3 的 neutral），
  只换 tone —— 于是"表面层级"（base 98 / panel 94 / hover 90 / active 86，暗色 6/12/17/22）
  在任何主题下都一致，不再各写各的；
- **文字**保留各自的"暖墨 / 冷墨"，只对齐 tone（正文 90·10、次要 80·30、提示 60·46）；
- **accent 一般不碰**；只有它被当**文字**用时（如 `.group-header { color: var(--accent) }`）
  才按最小改动挪 tone 到 4.5:1 —— 这一条是**自动探测**的（扫文件里有没有这种用法），不用维护名单；
- **语义色**（成功 / 警告 / 危险）也是"够好就不动"：只有当它在背景上读不清、或与品牌色
  ΔE < 12（分不出来）时才归位 MD3 固定色相（145° / 85° / 29°）并挪开色相。

派生出来的变量：

| 变量 | 是什么 | 怎么算 |
| --- | --- | --- |
| `--accent-fg` | **accent 底上的文字色**（MD3 的 on-primary） | 白字 ≥ 4.5:1 就用白字；否则"同色相压暗"到刚好达标（`fitTone`，不把品牌色改浅） |
| `--accent-alt` | 第二个图案色（目前只有孟菲斯用） | 从原种子推导，只对齐 tone |

> **`--accent-fg` 是"静态主题"与"运行时配色库"共用的同一个变量名。**
> 静态主题由生成器写进 CSS；运行时配色库（96 套）由 `applyPaletteTheme()` 注入
> （值 = 它自己的 `primaryForeground`）。**别再用 `--primary-foreground`** ——
> `tokens.css` 在 `:root` 里给了它 `#ffffff` 兜底，会让"白字压在亮 accent 上"这件事
> 在静态主题下永远改不动（2026-09-18 实测）。

**改造前实测出来的问题**（`npm run themes:audit` 的判据 = 文字读得清 / 按钮字压得住 / 边框看得见 / 语义色分得开）：

| 问题 | 例子 |
| --- | --- |
| **白字压在亮 accent 上读不清** —— `.btn.primary` 等 7 处写死 `color: #fff`，**10 套里 9 套不达标**，最差 1.41:1 | 赛博朋克 `#00f0ff`、卡通 `#fc8759`、魔兽 / LOL / PUBG 的金 |
| 边框与表面只差 3~5 个 tone（屏幕上那条线直接消失） | 孟菲斯、卡通、赛博朋克 |
| `warning` 写成近白色（tone 96）、或干脆与品牌色同值（"警告"和"品牌色"混成一片） | 赛博朋克 `#ffefcd`；魔兽 / LOL / PUBG 的金 |
| 7 条主题专属滚动条滑块是手挑色值（与主题生成器无关，改配色时不会跟着动） | cyberpunk / cartoon / memphis / comic / ghibli / chinese —— **已删除**：上面那条通用规则本来就跟随主题 |

> **别手改色值**：`scripts/lib/staticThemes.test.mjs` 断言"文件内容 = 生成器的输出"。
> 手改的那一处下一轮生成就会被抹掉、并且当场测试失败。要调配色 → 改生成器（或它的种子）→ `npm run themes:gen`。
>
> **同理别在"主题专属修饰"段里写色值**：那一段（`global.css` 靠后的 `:root[data-theme=…] .xxx`）
> 原来还写死了二十来个 hex（墨线、图案色、光晕、新拟态阴影 …），现在全部改成 `var(--accent)` /
> `var(--accent-alt)` / `var(--text-primary)` / `color-mix(…)` 派生 —— 主题色一变它们自动跟着变。

**顺手收进主题体系的"体系外固定色"**（2026-09-18，同一轮）：

| 位置 | 原来 | 现在 |
| --- | --- | --- |
| 公告窗徽标 `.announcement-badge` | 写死"红→橙"渐变 + 白字（白压在 `#ff9d2e` 上 **2.06:1**，几乎看不清） | `var(--accent)` + `var(--accent-fg)` |
| 公告窗头像 / "进入系统"按钮（含呼吸光晕） | 写死"蓝→紫"渐变 + 白字（3.6:1）+ 蓝色投影 | 同上，描边与光晕由 accent 派生 |
| 公告窗标题的渐变字 | 右端写死洋红 `#ff5ce1` | `--accent-hover` → `--accent-alt`（没有就用 accent） |
| 详情页"开始游戏"按钮 `.detail-play` | 写死绿色渐变（与同页 `.details-view .play-btn` 的 `var(--accent)` **两套取色**） | 统一跟随主题 |
| "在线"小圆点 / 崩溃页图标 | 写死 `#22c55e` / `#e74856` | `var(--success)` / `var(--danger)` |
| 窗口关闭键 | 写死 `#e5484d`（白字 **3.91:1**） | `--window-close` / `--window-close-active`：**平台约定色**（不随主题变，所以没进生成器），但值仍由 chroma 按 on-color 判据推出（4.70 / 6.32:1），并由守卫测试钉住 |
| `.level-badge.level-1/2/3` | 三个写死色 | **删除** —— 全仓搜不到这个类（死 CSS） |

> **故意保留的固定色**（它们不该跟主题走）：封面上的"玻璃"次级按钮（`.cover-btn.details`，
> 它永远落在深色封面上）、卡片文字的"暖白"默认值、分级色 `--tier-color` 的兜底、二维码的白底/黑底。
> 另外还有一类**没动的**：`body.theme-diamond` 与 5 套 `p-grad-*` 的**渐变背景**、reactbits 的紫色光晕 ——
> 它们是"背景方案"而不是"配色令牌"，属于 §2.3 记的另一件事。

### 2.4 游戏夜色（`p-playnite`，取材 Playnite 原版）

需求原话：*"添加一种配色 playnite 的原始配色，源码里有"*。色值**逐条取自原版源码**，不靠眼睛调：

> 原版 Playnite 仓库的 `source/Playnite.DesktopApp/Themes/Desktop/Default/Constants.xaml`
> —— 原版桌面主题的色板只此一处（`MainColor` / `MainColorDark` / `GlyphColor` / `HoverColor` …），
> 改主题就是改这个文件里的键。

| 原版键 | 原值 | 本表字段 | 说明 |
| --- | --- | --- | --- |
| `MainColorDark` | `#0D1225` | `background` / `bgBase` | 窗口底色（`WindowBackgourndBrush` 渐变的暗端） |
| `WindowBackgourndBrush` 亮端 | `#202B4D` | `bgTop` | 原版窗口是"上亮下暗"的竖直渐变，本表同款两段 |
| `MainColor`（NormalBrush） | `#2C3A67` | `card` / `bgPanel` | 面板底 |
| `GridItemBackgroundColor` | `#151E3D` | `bgSidebar` | 侧栏 / 网格项底 |
| `PopupBackgroundColor` | `#171E26` | `muted` | 弹层底 |
| `PopupBackgroundBrush` | `#1F2847` | `secondary` | 次级面板 |
| `PopupBorderColor` | `#3E6184` | `border` | 描边 |
| `GlyphColor` | `#55CDFF` | `primary` / `accent` / `ring` / `borderStrong` | 原版最标志的青色 |
| `HoverColor` | `#247BA0` | `bgItemHover` | 悬停蓝 |
| `HighlightGlyphColor` | `#8855CDFF` | `bgItemActive` | 半透明青叠在 `MainColor` 上 → 合成 `#4288B7`（本表字段只能存纯色） |
| `ButtonBackgroundBrush` | `#0A0E1E` | `bgInput` | 按钮 / 输入框底 |
| `TextColor` | `#F2F2F2` | `textPrimary` / `foreground` | 主文字 |
| `TextColorDarker` | `#A3A3A3` | `textSecondary` | 次级文字 |
| （原版无第三级） | — | `textDim` | 派生 `#7C86A0`（同色系偏蓝的弱化灰），必须过对比度守卫 |
| `PositiveRatingBrush` | `#78FFA0` | `success` | 好评 |
| `DataChangeNotifColor` | `#FFA500` | `warning` | 变更提示橙 |
| `NegativeRatingBrush` | `#FF6B6B` | `danger` | 差评（原版 `WarningBrush` 同值） |

归类为 `游戏主题`（对比度按 FLOOR 档守卫，与「我的世界」同档）。

**两条转换规则**（原版用到、本表存不下的东西）：

1. **渐变 → 两端色**：原版窗口背景是 `LinearGradientBrush`，本表用 `bgTop` → `bgBase` 两个字段
   近似（界面本来就按"顶 → 底"取这两个变量）。
2. **半透明 → 预合成实色**：`HighlightGlyphColor`（`#8855CDFF`，53% 青）、`PanelSeparatorColor`
   这类带 alpha 的原版值，按"它叠在哪个底色上"算成实色再填。

> 想现场对照：设置 → 主题 → 配色里选「**游戏夜色**」（列表第一个），或顶栏主题下拉。
> 原版是硬朗小圆角 + 深色 HUD 味，配形状主题「苹果 / 软浮雕」更像原版观感。

### 2.5 游戏红酒（`p-emixednite`，取材 eMixedNite）

需求原话：*"还有一种，也配上：[安装目录]\Themes\Desktop\eMixedNite_<id>\Constants.xaml"*。
色值同样**逐条取自主题源码**，不靠眼睛调：

> `eMixedNite`（作者 **eminaguil**，v2.60，`ThemeApiVersion: 2.5.0`）随主题分发的
> `Constants.xaml`。两处已核对，避免抄到"不是实际生效"的颜色：
> - 同目录的 `Constants - 副本.xaml` 与原文件 **MD5 完全相同**（没有分叉版本）；
> - `thememodifier.yaml` 只是给 ThemeModifier 插件声明"哪些常量可改 + 显示名"，**不含颜色覆盖**。

| 原版键 | 原值 | 本表字段 | 说明 |
| --- | --- | --- | --- |
| `WindowBackgourndBrush` 起始 | `#303030` | `bgTop` | 窗口是"炭黑 → 酒红"的斜向渐变 |
| `WindowBackgourndBrush` 暗端 | `#800000`（stop 在 1.5） | `bgBase` → `#651010` | stop 越界，可视区实测只走到约 66.7%，故按该处取值 |
| `MainColor`（NormalBrush） | `#545B67` | `bgPanel` | **面板是中性灰**（不是红）——"Mixed"的含义就在这 |
| `PopupBackgroundBrush` | `#383C44` | `secondary` | |
| `PopupBackgroundColor` | `#171E26` | `muted` | |
| `NormalBorderBrush` | `#4C545D` | `border` | |
| `PopupBorderColor` | `#FFAF612E` | `borderStrong` → `#AF612E` | 前缀 `FF` 是不透明度，去掉才是颜色 |
| `GlyphColor` | `#F4A460` | `primary` / `accent` / `ring` | `GlyphBrush` 渐变 `#F4A460→#D2691E` 的亮端（琥珀橙） |
| `HoverColor` | `#9A4545` | `bgItemHover` | 同时是 `ButtonBackgroundBrush`（砖红） |
| `TextColor` | `#ffe` | `textPrimary` / `foreground` → `#FFFFEE` | 3 位写法展开 |
| `TextColorDark` | `#a0a0a0` | `textSecondary` | |
| `PlayingStatusBrush` | `#6CC417` | `success` | 原版 `PositiveRatingBrush` 是淡黄 `#FFFF90`，语义上取状态绿 |
| `DataChangeNotifColor` | `#ffa500` | `warning` | |
| `WarningBrush` | `#ff6b6b` | `danger` | 原版 `NegativeRatingBrush` `#D88C8C` 偏软，取更明确的红 |

**派生项**（原值带 alpha、或原版没有对应档）：

| 字段 | 值 | 怎么来的 |
| --- | --- | --- |
| `background` | `#3B2A2A` | 窗口渐变按 8:2 取的代表色（以炭黑为主、带酒红），文字对比度 13:1 |
| `card` | `#583838` | `GridItemBackgroundColor` `#609a4545`（38% 砖红）叠在 `#303030` 上合成 |
| `bgItemActive` | `#7A3A3A` | 砖红家族加深一档；原版选中的 `HighlightGlyphColor` `#c08080` 太亮（白字压上只有 3.1:1），且本表不能存 alpha |
| `bgSidebar` / `bgInput` | `#2E2626` / `#44474F` | 窗口底压暗一档 / 面板灰压暗（原版输入框是透明底） |
| `accentHover` | `#FFBE7A` | `GlyphColor` 提亮（原版没有 hover 档） |
| `textDim` | `#B89448` | 原值 `TextColorDarker #707070` 在卡片上只有 2.08:1，提亮一档保证"看得见"；**2026-09-14 起整体换成金色系**，见下 |

**游戏名固定色（2026-09-14 需求）**：本主题的**卡片标题（游戏名）固定 `#FFCC00` 亮金**，
不跟随 `accent` —— 琥珀橙 `#F4A460` 压在砖红卡片 `#583838` 上偏"融进背景"，标题在 15px 上不够抓眼。

实现方式（主题可选项，别的主题也能用）：

| 环节 | 说明 |
| --- | --- |
| 数据 | `ThemePaletteTokens` 的可选字段 `titleColor`（本主题 = `#FFCC00`） |
| 注入 | `themeApply.ts` 把它映射到 CSS 变量 `--title-fill`（与其它 token 一样注入 `:root`） |
| 生效 | `global.css` 里标题是 `color: var(--title-fill, var(--ui-accent))`：主题给值就用，没给就跟随强调色 |
| 清理 | `--title-fill` 进了 `KEY_TO_VAR`，所以**切主题会被自动清掉**，不会串色 |
| 例外 | 卡片标题设为「随机彩色」时，每一行内联注入 `--title-fill`，优先级更高（那是用户显式选的模式） |

对比度实算：`#FFCC00` 压在本主题卡片色 `#583838` 上 = **6.81:1**（AA 正文 ≥ 4.5 ✓）。

归类同样是 `游戏主题`（FLOOR 档）；实测三级文字对比度：主 10.2~13.0:1、次 3.9~5.2:1、dim 3.0~3.9:1。

**文字色统一成亮金（2026-09-14 需求）**：需求原话*"咱这游戏[红酒主题]的文字都改成和游戏名一样的亮金色"*，
于是把本主题的**文字系令牌整体换成金色系**（不再用原主题的暖白 + 灰）：

| 令牌 | 原（原主题） | 现 | 理由 |
| --- | --- | --- | --- |
| `textPrimary` / `foreground` / `cardForeground` / `secondaryForeground` | `#FFFFEE` | **`#FFCC00`** | 与卡片游戏名**同一个金**（`titleColor`）——"和游戏名一样"是字面意思 |
| `textSecondary` / `mutedForeground` | `#A0A0A0` | `#E0B84A` | 同色系压暗一级，保住"次要"层级 |
| `textDim` | `#8A8A8A` | `#B89448` | 再压一级（提示 / 计数层级） |

`accent` 仍是琥珀橙 `#F4A460`（本主题的招牌色，也不是文字色，没动）。换色后
`src/utils/__tests__/themeContrast.test.ts` **仍然通过**（FLOOR 档：主 ≥ 4.5、次 ≥ 2.4、dim ≥ 1.7）——
以后动这几个值请一并跑 `npm run check`。

### 2.6 暗夜青绿（`p-dh-night`，取材 DH_Night）

需求原话：*"加 2 个就行，一个第三方的绿色，还有这个 eMixedNite。"*（"绿色"经确认指 `DH_Night`
的青绿；本机装的主题里，作者为第三方的只有它和 eMixedNite 两个。）

> `DH_Night`（作者 **felixkmh**，即 DuplicateHider 插件作者）随主题分发的
> `Constants.xaml`。同目录没有"副本"文件，`thememodifier.yaml` 只声明可改项、不含颜色覆盖。

| 原版键 | 原值 | 本表字段 |
| --- | --- | --- |
| `MainColor`（NormalBrush） | `#474747` | `bgPanel` |
| `BackgroundToneColor` | `#1F1F1F` | `secondary` / `bgSidebar` |
| `GridItemBackgroundColor` | `#292929` | `card` |
| `PopupBackgroundColor` | `#171E26` | `muted` |
| `NormalBorderBrush` | `#553A3A3A` | `border` → `#3A3A3A`（33% 不透明的实色近似） |
| **`GlyphColor`** | **`#00CCCC`** | `primary` / `accent` / `ring` / `borderStrong` |
| `HighlightGlyphColor` | `#007A7A` | `bgItemHover`（该主题的 `HoverBrush` 就是它，不是 `HoverColor`） |
| `HoverColor` | `#005252` | `bgItemActive` |
| `TextColor` / `TextColorDarker` | `#f2f2f2` / `#a3a3a3` | `textPrimary` / `textSecondary` |
| `PositiveRatingBrush` / `MixedRatingBrush` / `NegativeRatingBrush` | `#78ffa0` / `#fffca1` / `#ff6b6b` | `success` / `warning` / `danger` |

**这个主题的底色是贴图，抄不出来 —— 得实测。** `WindowBackgourndBrush` 是
**85% 不透明的 `noise/background0.png` 叠在 `Images/Background.png` 上**（`PanelSeparatorColor`
等也都是透明/贴图），所以 xaml 里根本没有"窗口底色"这个值。做法是用 `System.Drawing` 逐像素采样
（步长 5px）取平均色，再按 85% 合成：

| 测什么 | 结果 |
| --- | --- |
| `Images/Background.png`（1920×1080） | 整体 `#38444D`、上 15% `#45525B`、下 15% `#29333C`（轻微上亮下暗） |
| `Images/noise/background0.png` | ≈ `#1E1E1E` |
| **合成后的窗口底色** | 整体 ≈ `#222425`、上部 ≈ `#242627`、下部 ≈ `#202123` |

→ 填 `background` / `bgTop` / `bgBase`（`MainColorDark #1C1C1C` 作为交叉验证：与实测值同量级）。

其余派生项：`bgInput #2F2F2F`（`InputDefaultBrush` = `noise/background1` 的平均色）、
`accentHover #33DDDD`（`GlyphColor` 提亮，原版无 hover 档）、`textDim #808C8C`（原版只有两级文字色）。

归类 `游戏主题`；实测三级文字对比度：主 13.1~13.9:1、次 5.8~6.2:1、dim 4.2~4.5:1。

> **可复用的判据**：给"第三方主题"取色时先看 `WindowBackgourndBrush` 是 `SolidColorBrush` 还是
> `ImageBrush`。前者直接抄；后者（DH_Night 属于这种）得实测图片平均色，否则配色会明显偏亮。

---

## 三、主题与配色的应用链路

```
用户选择主题(style) → styleLibrary 取 StyleVars（仅形状变量）→ 注入 :root
用户选择配色(theme) → themeLibrary 取 palette（颜色变量）→ 注入 body.theme-*
两者叠加 → 任意组合都成立，互不冲突
```

- 主题持久化：`config.json` 的 `styleId`（存 styleLibrary 的 id）
- 配色持久化：`config.json` 的 `themeId`（存 themeLibrary 的 id）
- 前端入口：`ThemesSection.tsx`（选择），`themeApply.ts`（注入应用）
- 启动恢复：`src/main.tsx` 以 `config.json` 的 `themeId` / `styleId` 为权威

## 四、相关文件

| 文件 | 职责 |
|------|------|
| `src/utils/styleLibrary.ts` | 主题库（**只留 apple / s2 / mechanical**） |
| `src/utils/themeLibrary.ts` | 配色库（**全保留**） |
| `src/styles/global.css` | `:root[data-fx=…]`（主题形状特效）、11 套静态配色（由生成器写）、`body.theme-*` |
| `src/utils/themeApply.ts` | 注入应用主题变量与配色变量 |
| `src/components/settings/ThemesSection.tsx` | 主题 + 配色选择 UI |
| `src/main.tsx` | 启动时恢复 `themeId` / `styleId` |
| `scripts/lib/md3Color.mjs` | MD3 色调体系引擎：tone ↔ OKLCH、保色相改 tone、色域映射、最小改动达标 |
| `scripts/lib/staticThemes.mjs` + `scripts/gen-static-themes.mjs` | `global.css` 那 11 套静态配色的**生成器**（`npm run themes:gen` / `themes:audit`） |
| `scripts/fix-contrast.mjs` | `themeLibrary` 的修复（对比度 / 语义色归位 / 边框色调间距） |
| `scripts/lib/*.test.mjs` | 上述工具链的守卫测试（`npm test` 会跑） |

---

## 五、卡片光效（悬停光晕 + 光渗）

游戏卡片上叠了两段**实验性**光效，实现在 `src/styles/global.css` 的「卡片光效」段
（`.grid-card::before` 是光环，`.grid-card .cover::after` 是光渗）：

| 方案 | 做法 | 要点 |
|------|------|------|
| 现代方案 | 锥形渐变光环，`@property` 注册 `--card-aurora-angle` 让角度能自转 | 自定义属性**必须**注册，否则 animation 只会 0deg↔360deg 跳变；"只留描边"用两块 mask 相减（`mask-composite: exclude`）抠出 |
| 极致方案 | `radial-gradient` + `blur` + `mix-blend-mode: plus-lighter` 的光渗 | `plus-lighter` 是加色混合，光叠在封面图上像真的透出来；封面上的 `isolation: isolate` 把混合限制在封面内 |

**为什么这次不会变成"AI 浓妆"**（早期删过一版光效，见 `global.css` 里的说明）：
只在该卡 **hover / 键盘聚焦**时亮（一屏最多一张在发光）、颜色全部取自主题令牌
（浅色配色下自然变成柔和同色系光，不会蹦彩虹）。

可调令牌（都能在 `:root` 或某个 `body.theme-*` / 主题里覆盖）：

| 令牌 | 默认 | 作用 |
|------|------|------|
| `--card-aurora-1` / `-2` / `-3` | 自动取 `--accent` / `--accent-hover` / `accent+warning` 混色 | 光环三档颜色 |
| `--card-aurora-opacity` | `1` | 光环亮度 |
| `--card-bleed-opacity` | `0.5` | 光渗强度（浅色配色可调小） |

**关掉整个效果**：给 `:root` 设 `data-card-aurora="0"`（选一个属性即可，CSS 里所有光效
规则都带 `:root:not([data-card-aurora="0"])` 前缀），或直接删掉 `global.css` 的那一整段。

已知代价：光环靠"自定义属性动画"驱动，hover 时会**逐帧重绘这一张卡**的渐变（单卡、可接受）。
低端机上若觉得费，删掉 `animation: card-aurora-spin …` 那一行即变成静态光环，观感基本不变。

### 5.1 卡片「火爆」角标（右上角小火苗）

封面右上角的小火苗（`.grid-card .hot-flag`）是**常显**的招牌，不是 hover 才亮。规则很简单：

```
社区评分 games.community_score > HOT_SCORE_MIN  →  亮火苗
```

| 项 | 在哪 | 说明 |
|------|------|------|
| 阈值 `HOT_SCORE_MIN`（默认 100） | `src/utils/hotBadge.ts` | 改这一个常量，桌面端 + 网站端同时生效（两端共用本文件，有单测锁边界：100 不算、101 才算） |
| 判定 | 同上 `isHotGame()` | 没填过评分（undefined/NaN）一律不算 |
| 渲染 | `src/components/views/GridView.tsx` | 只有真的超阈值的卡才多这一个节点（列表是虚拟化渲染，其余卡零开销） |
| 颜色 | `--hot-color`（默认取 `--warning`，跟主题走） | 想换橙/红只改这一个变量 |
| 数据怎么填 | 整库 JSON 里 `games.json` 的 `community_score` 列（人工填） | 填完用 `npm run db:import -- --apply`（或双击 `libraryjson-importto-librarydb.bat`）回写进库，见 [library-json.md](./library-json.md) |

**为什么不是 GIF**：GIF 是固定像素，卡片尺寸随用户设置变（会糊），也没法跟主题变色（23 套配色下
一张 GIF 必然在某个配色里突兀），而且常显意味着几十张卡同时解码。所以用矢量火苗
（lucide `Flame` + CSS 动画），只动 `transform`/`opacity`（合成器友好，不逐帧重绘滤镜）。

真要换成自己做的 GIF/位图：给 `.grid-card .hot-flag` 加
`background-image: var(--hot-badge-image)`（配 `background-size: contain` + `color: transparent`）即可，
**不需要改任何代码** —— 详见 `global.css` 里该规则末尾的注释。

### 5.2 卡片封面四角的归属（加新角标前先看这张表）

角标是**抢地盘**的：一个新角标往某个角上一放，旧的可能就被压住了，而这种事只会在真机上被人看见。
所以先把四个角定下来，新角标往**空着的角**放：

| 角 | 谁占着 | 什么时候出现 |
| --- | --- | --- |
| 左上 | **序号** `.debug-badge`（`#12`，= 全局卡片序号，1 起） | 每张卡常显 |
| 左上（例外） | **锁标** `.lock-flag`（`🔒 钻石版专享`）：锁定时**序号让到它下面**（`top: 30px`，见 `.grid-card.locked`） | 只有等级不够的卡 |
| 右上 | 火爆火苗 `.hot-flag`；收藏星 `.fav-flag`（同一角，收藏星略靠内） | 评分超阈值 / 已收藏 |
| 左下 | **空**（2026-09-16 起） | —— |
| 右下 | 已安装绿点 `.installed-dot` | 本机已安装 |
| 底部中央 | hover 才浮出的「开始游戏 / 详情」`.cover-actions`（整层 `inset: 0` + 从底部 40% 的下沉暗角，按钮居中） | hover / focus |

**序号为什么在左上**（2026-09-16 需求）：它原来在**左下角**，而左下角正是那条按钮带的位置 ——
现场反馈"挡着重要信息"（封面左下角常常是标题 / 工作室 logo）。挪到左上角后，`z-index:3` 的序号
与 `z-index:3` 的按钮带不再抢同一块地（按钮带只在底部 40% 有暗角）。
**没有背景块**（同日需求："完全透明就行，不要设置背景"）：原来是 `rgba(0,0,0,.72)` 的小黑块，
现在只留数字。没了背景就用**双层文字阴影**兜住可读性 —— 它不是背景、不占一块矩形，
只是在字形周围压一圈暗边，白字落在亮封面上也不会消失。
（⚠️ 别用 `backdrop-filter` 做"半透明底"来替代：那又会变成盖住封面一小块，正是这次要去掉的东西。）
**锁定**那一种卡片是唯一例外：左上角被「钻石版专享」锁标占着，序号往下让 30px ——
锁标是"为什么玩不到"的唯一说明（见 [user-level-detection.md](./user-level-detection.md)），不能被压。

## 六、应用自带字体（fonts 目录）

需求：界面字体用**应用自带的字体**（默认 `fonts/字酷堂清楷 简.ttf`），**不依赖系统字体**；
只有 fonts 文件夹不存在时才回退系统字体。

### 6.1 字体从哪来

| 顺序 | 目录 | 说明 |
| --- | --- | --- |
| 1 | `settings.fontsDir`（**由规则表定**） | 取值来自 `path-modes.json` 的 `fontsDir`，随模式同步进 `config.json`；**设置界面不暴露**（2026-09-15 需求：字体是平台级资源，以管理员设置为准）。未配置 = `<应用 exe 同级>/fonts`；绿色版运维直接往这里丢字体（开发态 = 仓库根 `fonts/`）。以下为**已废弃**的说明（历史）：设置界面里可改（设置 → 通用 → 界面字体 → 字体文件夹，带"浏览…"）。相对路径以应用 exe 所在目录为基准 |
| 2 | `<resources>/fonts` | 打包时由 `electron-builder.yml` 的 extraResources 带进去的兜底 |

扫描 `*.ttf` / `*.otf` / `*.ttc`，**文件名（去掉扩展名）就是字体名**（既当 CSS font-family，
也当下拉里的显示名）。往 fonts 里丢一个新字体、重启后下拉里就能选 —— 不用改代码、不用改配置。

**默认字体** = `fonts/字酷堂清楷 简.ttf`，按"归一化名"匹配（忽略空格/全角空格/加号/大小写，
所以 `字酷堂清楷 简.ttf` 与 `字酷堂清楷简.TTF` 都认）；精确名找不到就退一步找同系列的
`字酷堂清楷*`；再找不到 → 默认字体为空，界面回退系统字体。

### 6.2 为什么要走本地 HTTP 服务器

字体不能直接给渲染进程 `file://` 路径：开发态页面是 `http://localhost:5173`，
Chromium 不允许 http 页面加载 `file://` 子资源（字体同样被拦）。所以复用详情页那个本地服务器，
按 `/fonts/<文件名>` 提供，并**带上 CORS 头**（`Access-Control-Allow-Origin: *`，字体属跨源请求）；
只放行裸文件名（防路径穿越），非字体扩展名一律 404。

全链路：`electron/core/fonts.ts`（扫描 + 请求校验）→ `electron/core/gameServer.ts`（`/fonts/*` 路由）
→ `electron/ipc/fonts.ts`（`get_ui_fonts`）→ `src/utils/uiFont.ts`（注入 `@font-face` + 设 `--font-ui`）
→ `src/hooks/useFontOptions.ts`（设置界面下拉用）。

> 中文字体动辄 8MB：走 HTTP 流式读取，比"读成 base64 塞进 IPC"省内存、也不拖慢启动。

### 6.3 优先级：自带字体盖过主题字体

`src/utils/uiFont.ts` 写的是**内联** CSS 变量（优先级最高），所以：

1. 用户在「设置 → 通用 → 界面字体」里显式选过 → 用选的；
2. 没选（`fontFamily` 为空）→ 用自带默认字体；
3. 自带字体不可用（fonts 目录不存在 / 找不到默认文件）→ 移除内联变量，回到**系统/主题字体**。

> 设置入口就是 **设置 → 通用 → 界面字体**（选字体 + 调界面大小）。这一块本来在"设计器"tab 的
> 分项微调里，而设计器 tab 后来被移除（`SettingsModal` 现在只有"通用"一个 tab），
> 于是字体一度没有任何入口 —— 已在通用里补成独立区块（`src/components/settings/GeneralSection.tsx`）。

**已知代价**：中国风、漫画等主题本来各有一套 `--font-ui`，现在会被自带字体盖掉 ——
这是"不依赖系统字体"的直接结果。想恢复某主题的字体，就在这个下拉里显式选一项，或把 fonts 目录挪走。

### 6.4 字体大小：只放大文字，不动界面尺寸

设置里的"**字体大小**"（85%~140%）只改文字，**弹窗/按钮/封面/间距一律不变**（需求明确：
"不要调整界面大小，只要调整字体大小"）。

机制是一枚 CSS 变量 `--ui-font-scale`（默认 1）：

| 环节 | 落点 |
| --- | --- |
| 构建期 | `postcss-font-scale.cjs`（本项目自己的 PostCSS 插件，排在 `tailwindcss` **之后**）把每一处 `font-size: Npx` / `Nrem` 包成 `calc(N * var(--ui-font-scale))`；顺带把**同一条规则里的绝对 `line-height`** 一起包（Tailwind 的 `text-*` 是 font-size + line-height 成对给的，只放大字号会让多行文字挤在没变大的行框里） |
| 变量默认值 | `src/styles/global.css` 的 `:root`（`--ui-font-scale: 1`） |
| 运行时 | `src/utils/uiFont.ts` 的 `applyUiFontScale(percent)`；设置滑杆即时生效、落盘 320ms 防抖 |
| 启动恢复 | `src/main.tsx`（读 `settings.uiFontScale`）+ `src/App.tsx` 的 effect（改设置立刻生效） |
| 持久化字段 | `settings.uiFontScale`（shared 模型，默认 100 = 原始大小） |

**为什么用 PostCSS 插件而不是手改**：`global.css` 里有 148 处 font-size，界面里还有大量 Tailwind
工具类（`text-xs` / `text-[11px]`…）**是构建时生成的**，手改源码根本改不到；放插件里一次性覆盖两者，
而且以后新写的 CSS 也不会漏。

**边界（三条刻意的不做）**：

1. 值里已经含 `var()` / `calc()` 的**一律跳过**（避免套娃）——例如卡片文字用的
   `var(--card-desc-font-size)`。所以卡片文字（游戏名/简介/别名）是在 CSS 里**手写相乘**的，
   见 `.grid-card .title` / `.grid-card .grid-desc` / `.list-alt-names`；
   ⚠️ 改这三处要同步改 `src/components/views/GridView.tsx` 的行高公式（它按字号算行高）。
2. `width` / `height` / `padding` / `margin` / `gap` 一律不碰 —— 碰了就变成"界面缩放"了。
3. 与顶栏 **Ctrl+滚轮**的原生整页缩放（`electron/ipc/zoom.ts`）是**两回事**：那个连布局一起放大、
   临时、不写进设置；本节的"字体大小"才是持久化的只改文字。

### 6.5 字号写法规范（写死字号一律不要）

**一句话规则：TSX 里的字号必须是类名 `text-[Npx]`，不允许内联 `style={{ fontSize }}`。**

原因：`--ui-font-scale` 是**构建期**由 `postcss-font-scale.cjs` 加进 CSS 的，只能覆盖
"CSS 文件 + Tailwind 生成的工具类"。内联样式是运行时直接写进 DOM 的，构建期碰不到 ——
所以写成 `style={{ fontSize: 13 }}` 的那处，用户在设置里调"字体大小"时**不会变**。
（2026-09 审计出 9 处这类漏网：`src/App.tsx` 的出错兜底页 4 处、`src/components/AboutModal.tsx` 3 处、
`src/components/settings/AppearanceSection.tsx` 2 处，已全部改掉。）

| 写法 | 受"字体大小"控制 | 说明 |
| --- | --- | --- |
| CSS 里 `font-size: 13px` | ✅ | 插件自动包成 `calc(13px * var(--ui-font-scale))` |
| TSX 类名 `text-[13px]` | ✅ | Tailwind 生成 CSS，走同一条路 |
| TSX 内联 `style={{ fontSize: 13 }}` | ❌ | **禁止** |
| 内联但值里自带 `var(--ui-font-scale)` | ✅ | 仅限"JS 算出来的动态预览"（如卡片字号预览） |

自查命令：`node scripts/audit-font-sizes.mjs` —— 已接进 `npm run check`（`lint:fonts`），
有漏网的内联 `fontSize` 时**退出码非 0**。它会把全部字号分成"受控 / 漏网"两类列出来，
并列出所有写死的 `font-family`（目前 8 处：6 处是 `inherit`，2 处是刻意指定的等宽字体与
漫画主题的 Impact —— 这两个**不该**跟着全局字体变，保持写死）。

### 6.6 历史坑（别再写死路径）

`global.css` 里曾写死三条 `@font-face`，`src` 指向 `/fonts/方正隶书_GBK.ttf`、
`/fonts/HarmonyOS_Sans_SC_Regular.ttf` —— 这两个文件**根本不存在**（真实文件是
`fonts/方正聚珍新仿+GBK.TTF`、`fonts/字酷堂清楷 简.ttf`），而且打包后 `/fonts/...` 会解析成
盘根 `file:///fonts/...` 直接 404。表现就是"选了字体没变化"。现在全部改为运行时扫描 + 动态注入。
