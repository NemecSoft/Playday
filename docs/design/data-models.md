# 游戏数据模型

## 概述

`Game` 是核心实体，对应原版 Playnite 的 `Playnite.SDK.Models.Game`。本项目对原版做了关键改进，最核心的是**多名称支持**。前端类型定义在 `src/types/models.ts`，与主进程 `electron/core/models.ts` 返回的结构保持一致。

## `Game` 结构（TypeScript）

```ts
export interface Game {
  id: string;
  name: string;                 // 主名称（通常为英文原名）
  sortName?: string;            // 排序用标题
  localizedNames?: GameName[];  // ★ 多语言本地化名称
  alternateNames?: string[];    // ★ 别名 / 俗称
  gameId?: string;
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
  guide?: string;               // HTML 玩法说明（详情页展示）
  screenshots?: string[];       // 截图/图库
  videos?: GameVideo[];         // 游戏视频
  gameLevel: number;            // 权限等级 1|2|3
  preLaunchScript?: string;     // 启动前脚本
  preLaunchEnabled: boolean;
  postLaunchScript?: string;    // 启动后脚本
  postLaunchEnabled: boolean;
  postExitScript?: string;      // 退出后脚本
  postExitEnabled: boolean;
}
```

## 多名称设计（对原版 Playnite 的改进）

> **背景**：原版 Playnite 的 `Game` 只有一个 `name` 字段。这导致一款游戏只能有一个标题，
> 无法表达它的多种名称——例如 GTA 5 英文名是 "Grand Theft Auto V"，中文圈俗称
> "三男一狗"、"车枪大战"，还有日文名、韩文名、港澳台地区的本地化译名等。

本项目引入**两套扩展字段**，采用行业通用的"主名 + 本地化名 + 别名"方案
（类似 IGDB / Steam / Wikipedia 的别名设计）：

### 1. `localizedNames: GameName[]` — 带语言标签的本地化名称

```ts
export interface GameName {
  language: string;  // BCP-47 语言标签，如 "en", "zh-CN", "zh-TW", "ja", "ko"
  name: string;      // 该语言下的名称
}
```

用于存放**各语言的正式译名**：

| language | name |
| --- | --- |
| `en` | Grand Theft Auto V |
| `zh-CN` | 侠盗猎车手 V |
| `ja` | グランド・セフト・オートV |
| `ko` | 그랜드 테프트 오토 V |
| `zh-TW` | 俠盜獵車手 V |

### 2. `alternateNames: string[]` — 无语言标注的别名 / 俗称

用于存放不绑定具体语言、但在玩家群体中广泛使用的**昵称、俗称、戏称**：

```ts
["三男一狗", "车枪大战", "GTA5", "GTAV"]
```

### 设计原则

1. **主名 `name` 不变**：始终是"默认展示名"（通常是英文原名），保证 UI 与现有逻辑不破坏。
2. **`localizedNames` / `alternateNames` 均为可选扩展**：旧数据库记录（没有这两个字段）自动得到空数组，**向后完全兼容**。
3. **搜索与展示分离**：`name` 用于界面默认展示；所有名称变体（主名 + 本地化名 + 别名）共同参与搜索（见 [搜索系统](./search.md)）。
4. **编辑入口**：游戏编辑弹窗提供本地化名称编辑器（语言 + 名称对，可增删）和别名输入框。

## 权限等级 `gameLevel`

`gameLevel: 1 | 2 | 3` 表示游玩该游戏所需的**权限等级**。用户等级 N 可玩所有游戏等级 ≤ N 的游戏（见 [登录系统](./login.md)）。无权限游戏正常显示，但点"开始游戏"时提示"用户等级不够"。

## 脚本启动字段

`preLaunchScript` / `postLaunchScript` / `postExitScript` 三个可选脚本字段（每个 `xxxEnabled` 布尔控制开关），配合 `electron/core/scriptRunner.ts` 实现游戏启动前 / 启动后 / 退出后的命令执行（见 [脚本启动](./script-launch.md)）。

## 其他实体

- **`GameAction`**：启动动作。类型仅 `"File"` / `"URL"`（原版还有 `"Emulator"`，本项目已移除模拟器）。字段含 `path`、`arguments`、`isPlayAction`、`trackGame` 等。
- **`GameLink`**：游戏相关链接（如商店 / Wiki）。
- **`GameVideo`**：游戏视频，`type` 为 `"youtube"` / `"file"` / `"url"`。
- **`AppSettings`**：应用设置（语言、主题、风格、启动行为、托盘、登录、布局等），存 `config.json`。其中 `themeId` / `styleId` 持久化主题/风格选择。
- **`Platform`**：平台（含 `specificationId`）。

## 存储

`Game` 以 JSON 形式存入 SQLite 单表 `games`（字段用 TEXT/JSON 序列化）。数组字段（genre/developer 等）用 `JSON.stringify` 存入，读取时 `JSON.parse`；字段变更通过默认值保持兼容，**无需数据库迁移**（新增字段自动以默认值读入）。
