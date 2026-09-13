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
| `src/styles/global.css` | `:root[data-fx=…]`（主题形状特效）、`body.theme-*`（配色变量） |
| `src/utils/themeApply.ts` | 注入应用主题变量与配色变量 |
| `src/components/settings/ThemesSection.tsx` | 主题 + 配色选择 UI |
| `src/main.tsx` | 启动时恢复 `themeId` / `styleId` |

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
| 数据怎么填 | `data/game-content.json` 的 `score` 字段 | 填完用 `sync-game-content.bat` 同步进库，见 [game-content.md](./game-content.md) |

**为什么不是 GIF**：GIF 是固定像素，卡片尺寸随用户设置变（会糊），也没法跟主题变色（23 套配色下
一张 GIF 必然在某个配色里突兀），而且常显意味着几十张卡同时解码。所以用矢量火苗
（lucide `Flame` + CSS 动画），只动 `transform`/`opacity`（合成器友好，不逐帧重绘滤镜）。

真要换成自己做的 GIF/位图：给 `.grid-card .hot-flag` 加
`background-image: var(--hot-badge-image)`（配 `background-size: contain` + `color: transparent`）即可，
**不需要改任何代码** —— 详见 `global.css` 里该规则末尾的注释。

## 六、应用自带字体（fonts 目录）

需求：界面字体用**应用自带的字体**（默认 `fonts/字酷堂清楷 简.ttf`），**不依赖系统字体**；
只有 fonts 文件夹不存在时才回退系统字体。

### 6.1 字体从哪来

| 顺序 | 目录 | 说明 |
| --- | --- | --- |
| 1 | `settings.fontsDir`（**可配置**） | 未配置 = `<应用 exe 同级>/fonts`；绿色版运维直接往这里丢字体（开发态 = 仓库根 `fonts/`）。设置界面里可改（设置 → 通用 → 界面字体 → 字体文件夹，带"浏览…"）。相对路径以应用 exe 所在目录为基准 |
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
