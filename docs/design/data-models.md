# 游戏数据模型

## 概述

`Game` 是核心实体，对应原版 Playnite 的 `Playnite.SDK.Models.Game`。
本项目对原版做了关键改进，最核心的是**多名称支持**。前端类型定义在 `src/types/models.ts`，与主进程 `electron/core/models.ts` 返回的结构保持一致。

其中**简介 / 地区 / 标签**是人工维护的内容，单独有一份源表 `data/game-content.json`
（丢失不可恢复，故放在仓库根并纳入版本管理）——字段与工作流见 [game-content.md](./game-content.md)。

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

## 游戏路径与库占位符规范

游戏相关的路径（`installDirectory`、`actions[].path`、`actions[].workingDir`）在存库时**必须使用统一格式**，避免"两套写法不一致"导致启动失败。

### 格式约定

| 写法 | 示例 | 说明 |
| --- | --- | --- |
| ✅ 正确 | `{Gamelibrary1}\game1\game.exe` | **库占位符 + 反斜杠 + 相对路径**（唯一合法格式）|
| ❌ 旧格式 | `.\Gamelibrary\game1\game.exe` | 早期"相对路径 + 字面目录名"写法，**已废弃**，会被规范化为占位符格式 |
| ❌ 错误 | `{Gamelibrary1}game1/game.exe` | 占位符后少斜杠 / 混用正反斜杠 / 重复斜杠 |

### 占位符语义

- `{Gamelibrary1}` 是**游戏库占位符**，运行时由 `resolveLibraryPlaceholder()` 从 `game_libraries` 表解析为真实路径（例如 `{Gamelibrary1}` → `D:\Games2`）。
- 只有**以 `{...}` 开头**的字符串才会被当作占位符解析；普通绝对路径（`D:\Games\...`）原样使用。
- `game_libraries` 表是游戏库的权威定义（从 config.json 迁移而来），字段 `id / name / path`。

### 自动规范化

在 `electron/core/db.ts` 的 `upsertGame()`（所有游戏入库的权威保存点）调用 `normalizeLibPath()`，对**每个保存的游戏**自动规范化 `installDirectory` 和每个 action 的 `path` / `workingDir`：

1. 只处理以 `{...}` 占位符开头的路径；
2. 去掉占位符后多余的 `./`、`.\`、`/`、`\`；
3. 内部统一成反斜杠并去掉重复分隔符；
4. 结果统一为 `{占位符}\相对路径`。

**入口无关**：管理端、客户端、脚本任何入口保存游戏都会自动规范化，保证库里只有一种合法写法。

### 双库机制（务必分清）

- `paths.ts` 的 `sourceDatabasePath()` = `<库根>/Admin/library.db`：**源库**（数据来源，由手工/脚本维护）。
- `paths.ts` 的 `runtimeDatabasePath()` = `<库根>/library/library.db`：**运行时副本**（客户端每次启动 `openDb()` 把 Admin 库 `copyFileSync` 复制过来再用）。
- `库根` 默认是数据根，可用 `config.json` 的 `settings.libraryDir` 改；权威库目录默认 `<库根>/Admin`，可用 `settings.sourceLibraryDir` 单独改（如指到 `//NAS/YunGame/Admin`）。两者都支持相对路径（以**应用 exe 所在目录**为基准，见 [目录结构](./directory-structure.md) 的「路径配置」）。
- **为什么要有这两级（核心原因）**：玩家可能**正在游戏**，而存档操作要读库里的存档路径；此时一旦发生"更新"，`library/library.db` 可能被破坏 → 玩家就做不了存档。所以让它成为**可丢弃的副本**：所有读写只在副本上，每次启动从只读的权威库重建，破坏最多影响一个临时文件。这也是"复制关系必须固定"的原因：只开放**目录**，文件名恒为 `library.db`。
- **写库/同步一律针对 `Admin/library.db`**；改运行时副本是白费（下次启动被 Admin 覆盖）。

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
3. **搜索与展示分离**：`name` 用于界面默认展示；所有名称变体（主名 + 本地化名 + 别名）共同参与搜索。
4. **编辑入口**：游戏编辑弹窗提供本地化名称编辑器（语言 + 名称对，可增删）和别名输入框。

## 权限等级 `gameLevel`

`gameLevel: 1 | 2 | 3` 表示游玩该游戏所需的**权限等级**。用户等级 N 可玩所有游戏等级 ≤ N 的游戏。无权限游戏正常显示，但点"开始游戏"时提示"用户等级不够"。

## 脚本启动字段

`preLaunchScript` / `postLaunchScript` / `postExitScript` 三个可选脚本字段（每个 `xxxEnabled` 布尔控制开关），配合 `electron/core/scriptRunner.ts` 实现游戏启动前 / 启动后 / 退出后的命令执行。

## 其他实体

- **`coverImage`（运行期字段，注意）**：封面路径由**运行期匹配**得出（扫封面目录 + 按游戏名匹配同名文件，规则见 `shared/coverMatch.ts`），只存在于内存。数据库 `games.cover_image` 列**已废弃**（保留不删、不再写入），`rowToGame` 仍读一次旧值兼容旧库。
- **启动复制带跳过优化**：权威库与运行时副本的**大小 + 修改时间一致时跳过复制**（判定见 `shared/librarySync.ts`；复制时用 `preserveTimestamps` 带上权威库的 mtime，否则判定失效）。实测本机 1.8MB 一次复制 7.7ms、跳过 0.27ms；权威库在 `//NAS` 上时省掉的是一次网络读。**要强制重建**：删掉 `<库根>/library/library.db` 即可。
- **`GameAction`**：启动动作。类型仅 `"File"` / `"URL"`（原版还有 `"Emulator"`，本项目已移除模拟器）。字段含 `path`、`arguments`、`isPlayAction`、`trackGame` 等。
- **`GameLink`**：游戏相关链接（如商店 / Wiki）。
- **`GameVideo`**：游戏视频，`type` 为 `"youtube"` / `"file"` / `"url"`。
- **`AppSettings`**：应用设置（语言、主题、风格、启动行为、托盘、登录、布局等），存 `config.json`。其中 `themeId` / `styleId` 持久化主题/风格选择；`gameDetailsDir` 指定游戏静态详情页目录（留空用默认 `<数据根>/Game_Details`，见 [游戏静态详情页](./game-details.md)）。
- **`Platform`**：平台（含 `specificationId`）。

## 存储

`Game` 以 JSON 形式存入 SQLite 单表 `games`（字段用 TEXT/JSON 序列化）。数组字段（genre/developer 等）用 `JSON.stringify` 存入，读取时 `JSON.parse`；字段变更通过默认值保持兼容，**无需数据库迁移**（新增字段自动以默认值读入）。

完整的 SQLite 表结构（games/users/game_libraries/platforms 等全部字段、类型、序列化约定、表间关系、双库与备份策略）见 **[database-schema.md](./database-schema.md)**。
