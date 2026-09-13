# 综合主题/配色/字体设计器（Theme Designer）

> **现状（2026-09）**：设计器 tab **已从设置里移除** —— 设置面板现在只有"通用"一个 tab
> （见 `src/components/settings/SettingsModal.tsx` 顶部注释）。主题改为顶栏下拉预设切换
> （`src/components/TopBar.tsx` 的 `ThemeTopPicker`）；字体设置搬到了「设置 → 通用 → 界面字体」。
> `src/components/settings/DesignerSection.tsx` 与 `designerApply.ts` 保留在仓库备用，但**没有任何入口**。
> 本文档自此作为"当时的设计"备查，不要按它去找设置入口。

## 一、需求背景

Playday 当前的视觉定制能力**分散在多个地方、且不够统一**：

- **主题（形状）**：`ThemesSection` 选 `styleLibrary`（apple / 软浮雕 / Recordly 等）——只管形状/质感
- **配色（调色板）**：`ThemesSection` 选 `themeLibrary`（明亮 / 暗黑 / 中国风等）——只管颜色
- **字体**：`AppearanceSection` 选字体（`fontFamily`）
- **卡片文字**：`AppearanceSection` 选 `cardText` 预设 + 自定义编辑器（颜色/描边/发光/阴影/背景）
- **卡片尺寸/间距**：`AppearanceSection` 的 cardWidth / cardGap / cardRowGap

**痛点**：①设置项分散在"外观 / 主题"两个 tab，用户要来回切；②不支持背景/面板**渐变**；③不支持按钮/卡片**圆角/直角**选择；④没有"一键套用整套视觉"的入口。

**目标**：做一个**综合的主题/配色/字体设计器**，把上述能力整合成**一个设置器**，既有**预设一键应用**，又允许**在预设基础上分项微调**（背景渐变、按钮圆角、卡片设计、字体等自由搭配）。

## 二、需求分析（已与用户确认）

### 2.1 预设组织方式：一键主题 + 可微调
- **每个预设是一整套视觉方案**（配色 + 形状 + 字体 + 卡片 + 背景渐变 + 圆角），**点一下就整套应用**。
- 应用后用户可在此基础上**分项微调**任意一项（换配色、改圆角、改字体、开渐变等），所有改动实时生效。
- 预设库：在现有 `styleLibrary` + `themeLibrary` 基础上，新增"**整套视觉预设**"概念（见数据模型）。

### 2.2 背景/面板支持渐变
- **主背景 + 面板（侧栏 / 顶部 / 弹窗等）都支持单色或渐变**，整体统一。
- 渐变：可调起止色 + 方向（角度/对角），用 CSS `linear-gradient` 实现。
- **文字保持单色**（不做文字渐变，避免可读性问题）。

### 2.3 按钮圆角/直角：全局圆角滑杆
- 一个"**圆角程度**"滑杆，0~20px，**统一控制按钮 / 卡片 / 输入框 / 面板**的圆角。
- 0 = 直角（硬朗），20 = 大圆角（圆润）。
- 通过一个 CSS 变量（如 `--radius-control`）全局注入，各组件读取。

### 2.4 与现有设置的关系：合并替代
- 把现有的 **ThemesSection（主题）+ AppearanceSection（外观）整合成一个"设计器"** 设置器。
- 替代后：设置面板的 tab 变为 **通用 / 设计器 /（其余保留）**。
- 旧的分散设置器代码可保留在仓库（复用到设计器里），但 UI 入口统一到设计器。

### 2.5 卡片设计设置
- 卡片除现有 `cardText`（文字样式）外，新增**卡片本身**的设计项：
  - 卡片圆角（由全局圆角滑杆控制）
  - 卡片背景（**单色 / 渐变**，可独立于面板自定义）
  - 卡片边框（是否显示、颜色）
- 卡片文字预设（现有 6 种）保留并纳入设计器。

## 三、数据模型

新增一个**设计器配置对象**，存 config.json（与 themeId/styleId 并列），作为用户自定义设计的持久化：

```ts
// 设计器配置（config.json 的 settings.designer）
interface DesignerConfig {
  // ---- 一键主题（整套预设）----
  presetId?: string;        // 当前应用的整套预设 id；undefined = 纯手动
  // ---- 配色 ----
  paletteId?: string;       // 配色方案（现有 themeLibrary 的 palette id）
  bgMode: "solid" | "gradient";   // 主背景模式：单色 / 渐变
  bgGradient?: {            // 渐变参数（bgMode=gradient 时）
    from: string;
    to: string;
    angle: number;          // 0~360，渐变方向
  };
  // ---- 形状 / 圆角 ----
  radius: number;           // 全局圆角程度 0~20（按钮/卡片/输入框/面板）
  styleId?: string;         // 形状风格（现有 styleLibrary 的 id），radius 可覆盖它
  // ---- 字体 ----
  fontFamily?: string;      // 界面字体（现有）
  cardFontSize: number;     // 卡片标题/别名字号
  cardDescFontSize: number; // 卡片简介字号
  cardFontBold: boolean;    // 卡片文字加粗
  // ---- 卡片 ----
  cardBg: "solid" | "gradient" | "panel"; // 卡片背景：单色 / 渐变 / 跟随面板
  cardBgColor?: string;     // 卡片背景色（solid 时）
  cardBorder: boolean;      // 卡片边框
  cardText: CardTextStyle;  // 卡片文字样式（现有）
  // 现有保留项（卡片尺寸/间距、侧栏宽度等仍走原 settings）
}
```

> `presetId` 是一整套预设的快照来源；选中预设后，把预设的各项**展开**写进上述字段（用户可随后改单项），`presetId` 仅用于标记"基于哪个预设"。

## 四、整套视觉预设库

在现有基础上新增"**整套预设**"列表，每个预设是 `{ 配色 + 形状 + 字体 + 卡片 + 渐变 + 圆角 }` 的完整描述。预设可以是：

| 预设名 | 配色 | 形状 | 字体 | 背景渐变 | 圆角 | 说明 |
|--------|------|------|------|---------|------|------|
| 现代暗黑 | 暗黑 | 苹果 | 系统 | 无 | 14 | 默认 |
| 明亮清爽 | 明亮 | 苹果 | 系统 | 无 | 12 | 浅色 |
| 软浮雕 | 暗黑 | 软浮雕 | 系统 | 无 | 18 | 柔和 |
| Recordly | Recordly | Recordly | 系统 | 无 | 14 | 克制 SaaS |
| 霓虹渐变 | 赛博朋克 | 赛博朋克 | 等宽 | 有 | 8 | 炫酷 |
| ... | ... | ... | ... | ... | ... | 可扩展 |

预设只提供"默认搭配"，用户应用后完全可改。

## 五、UI 设计（设计器布局）

设计器作为一个设置 tab，采用"**预设区 + 分项微调区**"两段式：

```
┌─ 设计器 ─────────────────────────────────────┐
│  [整套预设]  (横向卡片缩略图，点一下整套应用)     │
│  ┌────┐ ┌────┐ ┌────┐ ...                      │
│  │暗黑│ │明亮│ │浮雕│                           │
│  └────┘ └────┘ └────┘                          │
│                                               │
│  [分项微调]  (应用预设后可逐项调)                 │
│  配色: (下拉/色板)     背景: 单色[渐变▾]         │
│  渐变方向/起止色: [●●●]                          │
│  圆角程度: [———0—●——20———] 全局                   │
│  字体: (下拉)  卡片文字: (6种预设 + 自定义)       │
│  卡片背景/边框: [开关][色值]                      │
└───────────────────────────────────────────────┘
```

所有改动**实时生效**（写入 CSS 变量 + 存 config.json）。

## 六、与现有架构的关系

- **复用现有**：`styleLibrary`（形状）、`themeLibrary`（配色）、`CardTextStyle`/`DEFAULT_CARD_TEXT`（shared）、`clampCardDescFontSize`（shared）、字体列表 `FONT_OPTIONS`。
- **新增**：`designer` 配置对象 + 整套预设库 + 背景渐变 / 圆角变量注入。
- **替代**：设置面板合并后，ThemesSection / AppearanceSection 的 UI 入口并入设计器；组件内部可复用。

### CSS 变量扩展
- `--radius-control`：全局圆角（按钮/卡片/输入框/面板统一读取）
- `--bg-base-gradient` / `--bg-panel-gradient`：背景/面板渐变（覆盖单色 `--bg-base`/`--bg-panel`）

## 七、实现方案（分步）

1. **数据模型**：`shared/models.ts` 加 `DesignerConfig`；`AppSettings` 加 `designer?: DesignerConfig`；前后端同步。
2. **预设库**：新增 `src/utils/designerPresets.ts`（整套视觉预设清单）。
3. **CSS 变量注入**：`themeApply.ts`（或新 `designerApply.ts`）把 designer 的 radius/渐变/配色应用为 CSS 变量。
4. **持久化**：settingsStore 的 save 扩展写 designer；config.json 生效。
5. **设计器 UI**：新建 `DesignerSection.tsx`（预设区 + 分项微调区），替换 SettingsModal 的 Themes + Appearance 两个 tab。
6. **卡片设置**：并入卡片背景/边框设置，复用现有 cardText 编辑器。

## 八、风险与注意
- **与现有 style/theme 兼容**：radius 与 styleLibrary 的 radius 冲突时，以 designer 的 `radius` 为准（手动值覆盖预设）。
- **渐变性能**：渐变背景在 Electron 渲染没问题，但避免过重动画。
- **可读性**：文字保持单色（不做文字渐变），保证对比度。
- **向后兼容**：旧 config.json 无 designer 字段时用默认（纯手动，不强制预设）。
