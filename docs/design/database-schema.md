# 数据库设计（SQLite）

本文档描述 Playday 游戏库的 SQLite 数据库结构、字段、序列化约定、关系与维护策略。
是 `data-models.md`（Game 实体的 TypeScript 结构）的**底层存储层**说明。

> 数据源：`dev-data/Admin/library.db`（权威库，见下文"双库机制"）。

## 1. 概览

数据库由 6 张表组成，全部位于同一个 `library.db` 文件内：

| 表 | 用途 | 当前行数（2026-09-16 实测） |
| --- | --- | --- |
| `games` | 游戏库主表 | 1285 |
| `users` | 用户账号（权限管理） | 117 |
| `game_libraries` | 游戏库路径定义（**2026-09-16 整套废弃**：代码不再读写，旧库里那 3 条留着） | 3 |
| `platforms` | 平台列表 | 13 |
| `library_plugins` | 库插件（保留表，当前 0 条） | 0 |
| `platform` | 平台（旧版/空表，`platforms` 的残留） | 0 |

**没有外键约束**：表与表之间通过字符串 id / 名称软关联，依赖应用层保证一致性。
**没有自定义索引**：`games.id` 为主键即默认索引，其余查询靠应用层内存过滤。

## 2. 表结构

### 2.1 `games` — 游戏主表

```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  sort_name TEXT, localized_names TEXT, alternate_names TEXT,
  game_id TEXT, installed INTEGER, install_directory TEXT,
  play_task TEXT, other_tasks TEXT, last_played TEXT, play_count INTEGER,
  last_activity TEXT, playtime INTEGER, last_session_seconds INTEGER,
  last_session_ended_at TEXT, added TEXT, modified TEXT,
  category TEXT, genre TEXT, developer TEXT, publisher TEXT, tags TEXT,
  series TEXT, age_rating TEXT, region TEXT, source TEXT, features TEXT,
  release_date TEXT, community_score INTEGER, critic_score INTEGER,
  user_score INTEGER, hidden INTEGER, favorite INTEGER,
  background_image TEXT, cover_image TEXT, icon TEXT, description TEXT,
  notes TEXT, version TEXT, platform TEXT, emulator TEXT,
  completion_status TEXT, user_score_set INTEGER, manual_game INTEGER,
  plugin_id TEXT, links TEXT, actions TEXT, features_enabled INTEGER,
  guide TEXT, screenshots TEXT, videos TEXT, game_library TEXT,
  game_level INTEGER,
  pre_launch_script TEXT, pre_launch_enabled INTEGER,
  post_launch_script TEXT, post_launch_enabled INTEGER,
  post_exit_script TEXT, post_exit_enabled INTEGER,
  -- 启动细项（逐游戏）
  save_paths TEXT, monitor_exe TEXT,
  show_bat_console INTEGER  -- 显示 bat 控制台的**三态**覆盖：NULL=跟随全局设置 / 0=强制隐藏 / 1=强制显示
)
```

#### 字段分组说明

| 分组 | 字段 | 存储类型 |
| --- | --- | --- |
| 标识 | `id`, `name`, `sort_name`, `game_id`, `plugin_id` | TEXT |
| 多名称 | `localized_names`, `alternate_names` | **JSON 数组**（TEXT） |
| 安装/启动 | `installed`(0/1), `install_directory`, `play_task`, `other_tasks` | 布尔 / TEXT / JSON |
| 启动细项 | `save_paths`, `monitor_exe`, `show_bat_console` | TEXT / TEXT / **可空 INTEGER（三态：NULL=跟随全局设置、0=隐藏、1=显示）** |
| 统计 | `play_count`, `playtime`, `last_session_seconds`, `last_session_ended_at` | INTEGER / TEXT |
| 时间 | `added`, `modified`, `last_played`, `last_activity` | TEXT (ISO 8601) |
| 元数据 | `category, genre, developer, publisher, tags, series, age_rating, region, source, features, platform` | **JSON 数组**（TEXT） |
| 评分 | `community_score`, `critic_score`, `user_score`, `user_score_set` | INTEGER |
| 标记 | `hidden`, `favorite`, `manual_game`, `features_enabled` | INTEGER (0/1) |
| 媒体 | `background_image`, `icon`, `guide`, `screenshots`, `videos`, `notes`, `description` | TEXT / JSON |
| 媒体（**已废弃**） | `cover_image` | 列**保留不删、不再写入**。封面改为**运行期**扫封面目录按游戏名匹配同名文件（`shared/coverMatch.ts`，桌面端 + 网站端共用），只存在于内存。旧库里已有的值仍会被读到（`rowToGame`），但不在封面目录内时会被重新匹配覆盖。 |
| 启动动作 | `links`, `actions`, `other_tasks` | **JSON 数组**（TEXT） |
| 权限 | `game_level` | INTEGER (1|2|3) |
| 脚本 | `pre/post_launch_script` + `*_enabled` 对 | TEXT / INTEGER |

#### JSON 序列化约定
- **数组字段**（`localized_names`, `alternate_names`, `category`, `genre`, `tags`, `links`, `actions`, `screenshots`, `videos` 等）用 `JSON.stringify` 存入，读取时 `JSON.parse`。
- **新增字段**通过默认值自动兼容（`??` / 空数组），**无需 ALTER TABLE 迁移**（见 §5）。

> ⚠️ **上面这份 DDL 与权威库的实际情况有出入**（2026-09-16 实测 `PRAGMA table_info(games)`）：
> 权威库真实列末尾是 `… origin_name, save_paths, monitor_exe, description_alt, intro` —— 即
> **多一列 `description_alt`**（DDL 里没有）、**没有 `show_bat_console`**（DDL 里有、真库还没建过这列）、
> 也没有 `sort_name`。起因是这些列由不同时期的脚本各自 `ALTER TABLE` 加上，而 `db.ts` 的 SCHEMA
> 只负责"表要存在"。
> **后果（重要）**：整库 JSON 回写**不能"按这份 DDL 重建一个新库"**——会把 `description_alt`
> 整列连数据一起丢掉；正确做法是"复制现库 → 清空目标表 → 插回"。见 [library-json.md](./library-json.md) §5。
> 想按 JSON **新增列**：`node scripts/library-json.mjs import --apply --add-columns`（新增列不声明类型，
> 避免类型亲和性把 `0` 变成 `'0'`）。

### 2.2 `users` — 用户账号（**现状：不再由整库 JSON 维护**）

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY, account TEXT NOT NULL,
  password_hash TEXT NOT NULL, name TEXT,
  level INTEGER, kind TEXT, ip_address TEXT,
  created_at TEXT, deleted_at TEXT
)
```

- `level`: 用户等级 1|2|3（游戏可玩条件 = 用户等级 ≥ 游戏 `game_level`）。
- `kind`: 用户类型（`personal` / `enterprise`）。
- `ip_address`: 企业用户用本机 IP 匹配确定等级。
- `deleted_at`: 软删除标记（NULL = 未删）。

> ⚠️ **2026-09-16 现状**：这张表**不再由整库 JSON 维护**（用户决定）。等级与门店现在沿用旧系统的
> `YunGame_UserList.json`（判定逻辑见 [user-level-detection.md](./user-level-detection.md)）；
> 库里这份是先留着的**历史数据**，等新系统稳定运行后再重新设计。个人账号登录仍会读它
> （`electron/core/auth.ts` 的 `getUserByAccount`）。

### 2.3 `game_libraries` — 游戏库路径（**已废弃，2026-09-16**）

```sql
CREATE TABLE game_libraries (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT
)
```

> ⚠️ **整套设计已废弃并已从代码里移除**（用户决定：太麻烦了）。删掉的东西：
> `getGameLibraries` / `upsertGameLibrary` / `deleteGameLibrary`（`electron/core/db.ts`）、
> 这张表的建表语句、`settings.ts` 的 `getLibraries()`、三条 `*_game_library` IPC、
> `shared/launchPaths.ts` 的库占位符解析、`GameLibrary` 类型、脚本占位符 `{LibraryName}`、
> 以及 `upsertGame()` 里对 `{库名}` 路径的自动规范化。
>
> **新库里不再建这张表**；旧库里那 3 条数据**留着不动**（没有任何代码读它）。
> `games.game_library` **列**同样保留不写（只读不写旧值，同 `cover_image` 的处理）。
> 路径现在只有"绝对路径 / `{InstallDir}\…`"两种形态，见 [data-models.md](./data-models.md) 的「游戏路径规范」。

### 2.4 `platforms` — 平台

```sql
CREATE TABLE platforms (
  id TEXT PRIMARY KEY, name TEXT, specification_id TEXT, icon TEXT
)
```

### 2.5 `library_plugins` — 库插件（保留）

```sql
CREATE TABLE library_plugins (
  id TEXT PRIMARY KEY, name TEXT, icon TEXT, enabled INTEGER
)
```

当前未启用（0 条），为原版 Playnite 的插件体系保留。

### 2.6 `platform` — 旧版空表

与 `platforms` 结构相同，是历史残留的空表，当前不使用。

## 3. 表间关系

无外键，软关联：

```
games.game_level   <──等级门槛──     users.level           // 用户等级 ≥ 游戏等级才可玩
```

（原来还有两条跟 `game_libraries` 的软关联 —— 随该表一起废弃，2026-09-16。）

## 4. 双库机制（写库必读）

| 库 | 路径 | 角色 |
| --- | --- | --- |
| 源库 | `paths.ts` 的 `sourceDatabasePath()` = `<库根>/Admin/library.db` | 数据来源：手工维护的**整库 JSON**（`dev-data/library-json/`，见 [library-json.md](./library-json.md)）+ 脚本写入 |
| 运行时副本 | `paths.ts` 的 `runtimeDatabasePath()` = `<库根>/library/library.db` | 客户端每次启动 `openDb()` 把 Admin 库 `copyFileSync` 复制过来再用 |

（`<库根>` 默认 = 数据根，可用 `config.json` → `settings.libraryDir` 改；见 [目录结构](./directory-structure.md) 的「路径配置」。）

**规则**：
1. **写库 / 同步一律针对 `Admin/library.db`**（权威）。
2. 改运行时副本是白费——下次启动被 Admin 覆盖。
3. 覆盖操作前必须结束 electron/node 进程（sql.js 的 persist 会整体覆盖磁盘文件）。
4. **复制判定（用户指定）**：**应用启动时**（`main.ts` 的 `whenReady` → `syncRuntimeDatabase()`；
   点"进入系统"打开库时会再幂等调一次）比**大小 + 修改时间**，**任一不同就复制**，都相同才跳过
   （`shared/librarySync.ts`）。**退出时不写库**（`closeDb()` 只关连接 —— 每个写操作都已即时落盘），
   所以没改动的启动/退出之后，两库的"大小 + 时间"会**一直保持一致**、下次启动直接跳过复制。
   `persist()` 另有**硬断言**：写目标解析成权威库路径就抛错 —— 客户端只写副本，永不回写权威库。
   详见 [数据模型](./data-models.md) 的「启动复制判定」。

## 5. 版本与迁移策略

- 采用"**无迁移（schemaless 友好）**"策略：新增字段在 `CREATE TABLE` 里预定义好（或用默认值兜底），已有库读取时用 `?? 默认值` 兼容，**不需要 ALTER TABLE**。
- 必要时用 `scripts/` 下的迁移脚本（如 `migrate-libs-to-db.mjs`、`migrate-cover-paths.mjs`、`sync-tags-from-json.mjs`）做一次性数据迁移。
- 迁移脚本约定：**改库前自动做带时间戳的备份** `library.db.bak-YYYYMMDD-HHMMSS`，可随时回退。

## 6. 备份与恢复

- 权威库改动前先备份（迁移脚本自动做 `library.db.bak-<时间戳>`）。
- 测试首次建库/导入逻辑时，**不得随意删除权威库**（会重置 users / settings / games 全部数据），应改用独立测试库副本。

## 相关文档

- [library-json.md](./library-json.md) — **不用 GUI 改数据的方式**（整库 JSON：导出 → 手改 → 回写）
- [data-models.md](./data-models.md) — `Game` 实体 TypeScript 结构、多名称、路径占位符规范
- [architecture.md](./architecture.md) — 单一数据源架构
- [save-manager.md](./save-manager.md) — 存档/保存管理器
