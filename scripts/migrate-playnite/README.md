# Playnite → Playday 数据迁移工具

把 Playnite（`D:\YunGame\PlayNite`，LiteDB 数据库）的游戏库数据迁移到 Playday 的 SQLite 库。**可随时重复运行**（幂等），并保留 Playday 新增的字段。

## 一、用法

**双击批处理（推荐，上线前反复迁移）：**
```bat
:: 直接双击运行即可；自动读 D:\YunGame\PlayNite → 写 Playday 权威库
scripts\migrate-playnite\migrate-playnite.bat

:: 或带参数
scripts\migrate-playnite\migrate-playnite.bat --playnite D:\YunGame\PlayNite
scripts\migrate-playnite\migrate-playnite.bat --data dev-data
```

**命令行直接跑：**
```bat
node scripts/migrate-playnite/migrate-playnite.mjs
node scripts/migrate-playnite/migrate-playnite.mjs --playnite D:\YunGame\PlayNite --data dev-data
node scripts/migrate-playnite/migrate-playnite.mjs --db D:\path\to\library.db

:: 清空重导（推荐上线用）：清空目标库 games 表后全量导入，
:: 按游戏名回填 Playday 维护的简介/游戏库/指南等字段（不丢失）。
node scripts/migrate-playnite/migrate-playnite.mjs --clear

::: 只导出"映射后的 Playday 行"为 JSON、**不打开也不改动任何数据库**（增量同步用，见下节）
node scripts/migrate-playnite/migrate-playnite.mjs --skip-dump --out-json mapped.json
```

### 增量同步（源里改了几条 / 新增了几条 → 按 id 增、改）

整库迁移是**按游戏名**匹配、且同名不覆盖；而"库已经建好了，源里只动了几条"要走
**按 id 的 UPSERT**（`playday-db.mjs import`）。两个必须知道的坑（2026-09-15 实测踩到）：

1. **源里为空 ≠ 要改成空**：源里 1268 个游戏的 `InstallDirectory` 是 null（该字段现在实际
   由 Playday 维护）。照它覆盖会把 1268 个游戏的安装目录**全部抹掉** —— 比对时只有
   "源有值且不同"才算改动。
2. **`playday-db.mjs import` 的 UPDATE 是整行覆盖**（`SET 所有列`）。改动行必须写成
   "**现存整行 + 只覆盖变化字段**"，只喂变化字段会把同行的 `intro` / `gameLevel` /
   存档路径等写成 null。

推荐流程：`--out-json` 导出源映射结果 → 与库现状按 id 比对 → 生成"新增整行 + 改动整行"
的 JSON → `playday-db.mjs import`（写库前自动备份 `.json-bak`）。路径统一写 `/`
（交给 cmd 时才由 `toCmdPath()` 换回 `\`）。

## 二、流程

1. **读取**：`dump-playnite.ps1` 加载 Playnite 的 `LiteDB.dll`，把 `library/*.db`（games + 类型/平台/厂商/标签等 12 个集合）导出为 JSON。
2. **映射**：解析 JSON，把 Guid 关联（`GenreIds` 等）换成名称；`GameActions` 转成 Playday 的 `actions`（JSON）+ `play_task`（PlayAction 的 id）。
3. **校验同名**：业务上**一个游戏名只能对应一个游戏**。发现下列任一情况即**停止并报告**（不写库）：
   - Playnite 数据源内部重名（去 Playnite 改名）；
   - Playday 目标库内部重名（先清理）；
   - Playday 目标库已存在同名游戏（工具不覆盖，需先清空目标库或改名）。
4. **导入**：无冲突时把 Playnite 游戏全部插入（id 用 Playnite 的 Guid）。
5. **写回**：写库前自动备份目标库为 `library.db.migrate-bak`；校验失败则不写库。

## 三、映射规则

| Playnite 字段 | Playday 列 | 说明 |
|---|---|---|
| `_id` (Guid) | `id` | 用 Playnite 的 Guid（新行） |
| `Name` | `name` | 唯一键（`games.name` 有唯一索引，工具校验同名） |
| `GameId` | `game_id` | 原样 |
| `InstallDirectory` | `install_directory` | **原样移植**（相对/绝对都保留） |
| `IsInstalled` / `Hidden` / `Favorite` | 对应列 | bool → 0/1 |

> **`Hidden` 是平台行为，不是个人偏好**（2026-09-15 明确，此前这里曾按"个人偏好"写成
> 不迁移，是错的）：平台把某些游戏标成隐藏 = 这台机器 / 这个渠道**不提供**该游戏，
> 所以必须同步到 Playday。
> 后果（改这条前必须知道）：`hidden=1` 的游戏会被客户端列表过滤掉
> （`src/utils/selectors.ts` 的 `g.hidden && !opts.showHidden`），而 `GamesView` 目前
> 固定传 `showHidden:false` ⇒ **隐藏的游戏在客户端看不到** —— 这正是平台要的效果。
> **运维怎么看被隐藏的游戏（平台小秘密，2026-09-15）**：在**主界面连按 5 次 Ctrl+H**
> → 临时显示被隐藏的游戏（顶部 toast 提示"共 N 个"），再连按 5 次收回。
> 实现在 `src/hooks/useGlobalShortcuts.ts`（连按计数：按其它键或间隔 >2 秒清零，防误触），
> 列表侧只是读 `gamesStore.showHidden`（`GamesView.tsx`）。
> 刻意**不做成设置项**：那等于给了玩家一个公开开关。另：工具栏"清除筛选"会把
> `showHidden` 重置回 false（等于收回）。
| `GenreIds` / `PlatformIds` / `CategoryIds` / `TagIds` / `SeriesIds` / `RegionIds` / `AgeRatingIds` / `FeatureIds` | `genre` / `platform` / `category` / `tags` / `series` / `region` / `age_rating` / `features` | Guid → 名称数组 → JSON 字符串 |
| `DeveloperIds` / `PublisherIds` | `developer` / `publisher` | 查 companies.db |
| `SourceId` / `CompletionStatusId` / `EmulatorId` | `source` / `completion_status` / `emulator` | Guid → 名称 |
| `GameActions` | `actions` + `play_task` | PlayAction 的 id 写入 `play_task`；`{InstallDir}` 占位符原样保留（Playday 启动时会展开） |
| `Links` | `links` | `{Name,Url}` → JSON |
| `ReleaseDate` / `Added` / `Modified` / `LastActivity` | 对应列 | ISO 时间字符串 |
| `Playtime` / `PlayCount` | 对应列 | int |
| `UserScore` / `CriticScore` / `CommunityScore` | 对应列 | 原样 |
| `Description` | `description` | Playnite 的描述（版本信息/简要操作）→ `description`。`intro` 为 Playday 用户维护的简介，迁移不填（留空） |
| `Notes` / `Version` | 对应列 | 原样 |
| `PreScript` / `PostScript` | `pre_launch_script` / `post_launch_script` | 原样 |
| `Manual` / `IsCustomGame` | `manual_game` | 任一非空/true → 1 |
| `PluginId` | `plugin_id` | 空 Guid 转 null |
| **封面/背景/图标** | — | **不迁移**。Playday 已改为按 `CoverImages/` 目录同名图片自动匹配（`applyCovers`） |

### 同名规则
- `games.name` 有**唯一索引**（`electron/core/db.ts` 的 SCHEMA 已加 `idx_games_name`，新库自动生效）。
- 迁移工具不覆盖同名：目标库已有同名游戏即停止报告，由人工处理。
- 存量旧 id（32 位无连字符）不动；Playday **新增**游戏 id = `crypto.randomUUID()`，与 Playnite `Guid.NewGuid()` 格式一致（UUID v4 带连字符），便于两边互相转化。

## 三.5、JSON 直接管理数据（不用 GUI）

不想用 GUI 管理数据时，用 **`playday-db.mjs`** 直接在 JSON 里编辑游戏字段（简介 `intro`、描述、类型、启动指令等），再写回数据库。

```bat
:: 导出（完整字段：文本 null、数组 []、布尔 true/false，含 intro）
node scripts\migrate-playnite\playday-db.mjs export --out games.json

:: 编辑 games.json 后写回（按 id 更新；自动备份 .json-bak；重名/改名冲突会拦截）
node scripts\migrate-playnite\playday-db.mjs import --in games.json
```

常用：批量给游戏补简介 `intro`，直接改 JSON 里 `"intro": "xxx"`，再 import 即可。

## 四、前置条件

- **Node.js**（Playday 开发环境自带）
- **Playnite 便携版**（提供 `LiteDB.dll` 和数据 `library/*.db`），默认 `D:\YunGame\PlayNite`
- **PowerShell 7+**（`ConvertTo-Json -AsArray` 需要；Windows 自带 `powershell` 也可，脚本已兼容）

## 五、常见问题

- **写哪个库？** 默认写**权威库** `dev-data/Admin/library.db`（Playday 双库机制，客户端启动自动下发给运行时库）。也可 `--db` 指定。
- **重复运行安全吗？** 安全。按名字匹配，幂等；每次写库前自动备份。
- **`{InstallDir}` 没被展开？** Playday 启动时 `expandVariables` 会用 `install_directory` 展开 `{InstallDir}`。若某游戏 `install_directory` 为空，则路径需靠 Playday 的 `game_library + install_directory` 逻辑补全（该字段由 Playday 管理端维护）。
