# 数据库设计（SQLite）

本文档描述 Playday 游戏库的 SQLite 数据库结构、字段、序列化约定、关系与维护策略。
是 `data-models.md`（Game 实体的 TypeScript 结构）的**底层存储层**说明。

> 数据源：`dev-data/Admin/library.db`（权威库，见下文"双库机制"）。

## 1. 概览

数据库由 6 张表组成，全部位于同一个 `library.db` 文件内：

| 表 | 用途 | 当前行数 |
| --- | --- | --- |
| `games` | 游戏库主表（1271 游戏） | 1271 |
| `users` | 用户账号（权限管理） | 117 |
| `game_libraries` | 游戏库路径定义（占位符 → 真实路径） | 3 |
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
  post_exit_script TEXT, post_exit_enabled INTEGER
)
```

#### 字段分组说明

| 分组 | 字段 | 存储类型 |
| --- | --- | --- |
| 标识 | `id`, `name`, `sort_name`, `game_id`, `plugin_id` | TEXT |
| 多名称 | `localized_names`, `alternate_names` | **JSON 数组**（TEXT） |
| 安装/启动 | `installed`(0/1), `install_directory`, `play_task`, `other_tasks` | 布尔 / TEXT / JSON |
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

### 2.2 `users` — 用户账号（权限管理）

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

### 2.3 `game_libraries` — 游戏库路径（占位符权威定义）

```sql
CREATE TABLE game_libraries (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT
)
```

- 由 config.json 的旧 `gameLibraries` 字段迁移而来（迁移脚本 `scripts/migrate-libs-to-db.mjs`）。
- `path` 是占位符解析的真实根目录，例如 `{Gamelibrary1}` → `D:\Games2`。
- 启动时 `resolveLibraryPlaceholder()` 用此表把 `{库名}\相对路径` 解析为绝对路径（见 [data-models.md](./data-models.md#游戏路径与库占位符规范)）。

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
games.game_library ──(name 匹配)──> game_libraries.name   // 该游戏属于哪个库
games.game_level   <──等级门槛──     users.level           // 用户等级 ≥ 游戏等级才可玩
games.actions[].path {Gamelibrary1} ──解析──> game_libraries.path
```

## 4. 双库机制（写库必读）

| 库 | 路径 | 角色 |
| --- | --- | --- |
| 源库 | `paths.ts` 的 `sourceDatabasePath()` = `<库根>/Admin/library.db` | 数据来源：手工维护的 games.json + 脚本（import-games.bat）写入 |
| 运行时副本 | `paths.ts` 的 `runtimeDatabasePath()` = `<库根>/library/library.db` | 客户端每次启动 `openDb()` 把 Admin 库 `copyFileSync` 复制过来再用 |

（`<库根>` 默认 = 数据根，可用 `config.json` → `settings.libraryDir` 改；见 [目录结构](./directory-structure.md) 的「路径配置」。）

**规则**：
1. **写库 / 同步一律针对 `Admin/library.db`**（权威）。
2. 改运行时副本是白费——下次启动被 Admin 覆盖。
3. 覆盖操作前必须结束 electron/node 进程（sql.js 的 persist 会整体覆盖磁盘文件）。

## 5. 版本与迁移策略

- 采用"**无迁移（schemaless 友好）**"策略：新增字段在 `CREATE TABLE` 里预定义好（或用默认值兜底），已有库读取时用 `?? 默认值` 兼容，**不需要 ALTER TABLE**。
- 必要时用 `scripts/` 下的迁移脚本（如 `migrate-libs-to-db.mjs`、`migrate-cover-paths.mjs`、`sync-tags-from-json.mjs`）做一次性数据迁移。
- 迁移脚本约定：**改库前自动做带时间戳的备份** `library.db.bak-YYYYMMDD-HHMMSS`，可随时回退。

## 6. 备份与恢复

- 权威库改动前先备份（迁移脚本自动做 `library.db.bak-<时间戳>`）。
- 测试首次建库/导入逻辑时，**不得随意删除权威库**（会重置 users / settings / games 全部数据），应改用独立测试库副本。

## 相关文档

- [data-models.md](./data-models.md) — `Game` 实体 TypeScript 结构、多名称、路径占位符规范
- [architecture.md](./architecture.md) — 单一数据源架构
- [save-manager.md](./save-manager.md) — 存档/保存管理器
