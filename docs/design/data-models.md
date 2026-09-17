# 游戏数据模型

## 概述

`Game` 是核心实体，对应原版 Playnite 的 `Playnite.SDK.Models.Game`。
本项目对原版做了关键改进，最核心的是**多名称支持**。前端类型定义在 `src/types/models.ts`，与主进程 `electron/core/models.ts` 返回的结构保持一致。

其中**简介 / 地区 / 标签 / 权限等级 / 存档路径**是人工维护的内容，它们的**可编辑镜像**是整库 JSON
（`dev-data/library-json/*.json`；丢失不可恢复 —— 它跟着数据根走、**不在版本管理里**，所以改之前先 `npm run db:backup`）——字段与工作流见
[library-json.md](./library-json.md)。

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

## 游戏路径规范

游戏相关的路径（`installDirectory`、`actions[].path`、`actions[].workingDir`）存库时有**两种合法形态**，
解析规则见 [launch-and-paths.md](./launch-and-paths.md)：

| 写法 | 示例 | 说明 |
| --- | --- | --- |
| 绝对路径 | `X:\YunGame\Z\SomeGame\game.exe` | 直接可用；解析时只统一分隔符（`\` → `/`） |
| 安装目录占位符 | `{InstallDir}\game.exe` | 启动时展开成该游戏的 `installDirectory` |
| 相对路径 | `TPC.exe`、`bin\Inversion.exe` | 以**安装目录**为基准（Playnite 语义）；`install_directory` 本身则以**游戏根**（`defaultGameRootPath`）为基准 |

### 库占位符（`{Gamelibrary1}`）已废弃

> ⚠️ **2026-09-16**：游戏库（`game_libraries` 表 + `{库名}` 占位符）整套设计废弃并已从代码里移除。
> 实测本机库里 `install_directory` / `actions` 里含 `{库名}` 的**是 0 条**（只有 1 行 `game_library`
> 列写着 `{GameLibrary1}`，那是历史标签），所以移除没有影响启动。
>
> 现在若还遇到 `{库名}` 开头的路径，启动链路会**明确报错**
> 「路径里的库占位符已废弃（game_libraries 不再使用）」—— 刻意不静默当相对路径拼到游戏根上，
> 那会拼出一个不存在的怪路径、最后报"文件不存在"，把排查方向带偏。
>
> 同时移除的还有：`resolveLibraryPlaceholder()` / `getLibraries()` / 三条 `*_game_library` IPC /
> 脚本占位符 `{LibraryName}` / `upsertGame()` 里的 `normalizeLibPath()` 自动规范化
> （路径现在**按原样入库**）。

### 双库机制（务必分清）

- `paths.ts` 的 `sourceDatabasePath()` = `<库根>/Admin/library.db`：**源库**（数据来源，由手工/脚本维护）。
- `paths.ts` 的 `runtimeDatabasePath()` = `<库根>/library/library.db`：**运行时副本**（客户端每次启动 `openDb()` 把 Admin 库 `copyFileSync` 复制过来再用）。
- `库根` 默认是数据根，可用 `config.json` 的 `settings.libraryDir` 改；权威库目录固定在 `<库根>/Admin`（**推导，没有单独字段** —— 少一个能配歪的旋钮）。两者都支持相对路径（以**应用 exe 所在目录**为基准，见 [目录结构](./directory-structure.md) 的「路径配置」）。
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
- **启动复制判定（用户指定的规则，代码照此实现，别改）**：**应用启动时**（`main.ts` 的
  `whenReady` → `syncRuntimeDatabase()`；点"进入系统"的 `openDb()` 还会幂等调一次）比权威库与
  运行时副本的**大小 + 修改时间** —— **任一不同就复制**，两者都相同才跳过（判定在
  `shared/librarySync.ts`，严格相等、不做容差：**宁可多复制一次，也不要漏掉一次真更新**）。
  复制时用 `cpSync` 的 `preserveTimestamps` 把权威库的 mtime 带过去 —— 否则副本会被打上"现在"
  的时间戳，判定永远为"不同"（也就永远跳不过）。
  实测本机 1.8MB 一次复制 7.7ms、跳过 0.27ms；权威库在 `//NAS` 上时省掉的是一次网络读。
  **要强制重建**：删掉 `<库根>/library/library.db` 即可。
  两条配套改动（2026-09-16 按用户要求，**都是为了让"一致"真的成立、可观察**）：
  1. **比较时机提到应用启动**（原来等到点"进入系统"才做）：这步很轻（一次 stat），
     真正重的是"sql.js 初始化 + 读进内存"，那个仍留在"进入系统"。
  2. **退出不再写库**：`closeDb()` 只关连接、不 `persist()`（每个写操作改完都已即时落盘，
     退出时那次整体重写是多余的，还会把副本 mtime 改成"退出时刻"）。
  另外 `persist()` 里加了**硬断言**：写目标解析成权威库路径就直接抛错（判据是纯函数
  `sameFilePath`，有单测）—— 客户端**只许写副本、永不回写权威库**。
  于是现在的实际表现：**没改动的启动/退出，两库"大小 + 时间"一直保持一致**（复制带上了权威库的
  mtime，之后没人再写副本）→ 下次启动**跳过复制**；只有运行期真写了数据（游玩时长 / 收藏 / 隐藏…）
  或权威库被 `npm run db:import` 回写过，副本才会变旧、下次启动才复制。
  ⚠️ 核对"两库内容是否一致"仍要看**内容**（运行期写入会让副本比权威库新，那是设计使然）；
  现场数据与实测过程见 [整库 JSON](./library-json.md) §7。
- **`GameAction`**：启动动作。类型仅 `"File"` / `"URL"`（原版还有 `"Emulator"`，本项目已移除模拟器）。字段含 `path`、`arguments`、`isPlayAction`、`trackGame` 等。
- **`GameLink`**：游戏相关链接（如商店 / Wiki）。
- **`GameVideo`**：游戏视频，`type` 为 `"youtube"` / `"file"` / `"url"`。
- **`AppSettings`**：应用设置（语言、主题、风格、启动行为、托盘、登录、布局等），存 `config.json`。其中 `themeId` / `styleId` 持久化主题/风格选择；`gameDetailsDir` 指定游戏静态详情页目录（留空用默认 `<数据根>/Game_Details`，见 [游戏静态详情页](./game-details.md)）。
- **`Platform`**：平台（含 `specificationId`）。

## 存储

`Game` 以 JSON 形式存入 SQLite 单表 `games`（字段用 TEXT/JSON 序列化）。数组字段（genre/developer 等）用 `JSON.stringify` 存入，读取时 `JSON.parse`；字段变更通过默认值保持兼容，**无需数据库迁移**（新增字段自动以默认值读入）。

完整的 SQLite 表结构（games/users/platforms 等全部字段、类型、序列化约定、表间关系、双库与备份策略）见 **[database-schema.md](./database-schema.md)**。
