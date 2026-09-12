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
