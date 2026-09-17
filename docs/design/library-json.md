# 整库 JSON（`dev-data/library-json/`）—— 不用 GUI 改数据的方式

> 一句话：把**权威库**导出成一堆 JSON（一表一文件），你直接改 JSON，再回写进库，重启客户端生效。

它是**人工内容的可编辑镜像**（简介 / 地区 / 标签 / 权限等级 / 存档路径 / 账号…这些"丢了得一条条重写"
的东西），不是构建产物 —— 2026-09-17 起放在**数据根**下的 `dev-data/library-json/`（原先在仓库根
`data/library/`）。⚠️ 它落在 `.gitignore` 的默认忽略区里（`dev-data/*` 只白名单了库与公告），
**不再纳入版本管理**：改动没有 git diff/回滚可依赖，动它之前先 `npm run db:backup`（`.gitignore` 里写了
别再加忽略规则）。

---

## 1. 为什么改成这样（与旧链的差别）

以前这条路是"**人工内容表 → apply 脚本 → 库**"：

```
data/game-content.json  →  scripts/apply-game-content-to-db.mjs  →  Admin/library.db
（只装 7 个字段）            （一张手写的字段映射表）                 （要手动点 bat）
```

那条链是**按固定键重建**的：想多管一个字段（比如"逐游戏是否显示 bat 控制台"），得在
生成脚本、apply 脚本、守卫的"必需键列表"里**各改一处**，漏一处就是"改了没生效"。

现在换成**整库 JSON 镜像**，而且 **schema 驱动、零字段清单**：

```
dev-data/library-json/games.json  ───（一键导出）→ 你手改 → （一键回写）→ Admin/library.db
```

表与列都从库里**现发现**（`sqlite_master` + `PRAGMA table_info`）—— **加一列、加一张表都不用改代码**，
所以再没有"必需键列表"这种东西。旧的内容表已于 2026-09-16 退役（见 [game-content.md](./game-content.md)）。

### 1.1 只管 `games`（2026-09-16 定）

默认**只导出 / 只回写 `games` 一张表**（一表一文件，文件名 = 表名）。其余表不管：

| 表 | 为什么不管 |
| --- | --- |
| `users` | **不用了**。等级/门店现在沿用**旧系统的 `YunGame_UserList.json`**（见 [user-level-detection.md](./user-level-detection.md)）；库里那份是先留着的历史数据，等新系统稳定运行后再重新设计 |
| `game_libraries` | **整套设计已废弃并从代码里移除**（2026-09-16：建表 / CRUD / IPC / 库占位符解析全没了；旧库里那 3 条数据留着） |
| `platforms` / `platform` / `library_plugins` | 迁移残留或空表 |

要管别的表就 `--tables users,xxx` 显式指名（表/列仍是现发现的，不用改代码）。

> ⚠️ **"不导出"≠"不碰它"**：导入时会把**目录里有 json 文件的表**整表替换。所以停用某张表时，
> 必须**把它的 json 文件删掉**，否则那份旧快照仍会参与回写（导出时会提醒你还有哪些残留文件）。

### 1.2 同一天退役的另一条链（2026-09-16）

以前还有**第二套 "games 的 JSON 回写"**，同样与新工具重复，已删：

| 已删除（2026-09-16） | 它是什么 |
| --- | --- |
| `import-games.bat` | 双击把仓库根 `games.json` 写回库（= 新工具的 `db:import`） |
| `scripts/migrate-playnite/playday-db.mjs` | 库 ↔ JSON 双向工具，内含一张**手写的 60 行字段映射表** —— 正是"加个字段要改一处"的病根。它的"按 id 增量同步"用法改由"改 `games.json` → `db:import`"承担（见该目录 README） |

**保留**（它们不是数据管理，是给外部工具的数据出口）：

| 保留 | 为什么 |
| --- | --- |
| 仓库根 `games.json` + `_export-games-json.mjs` + `export-games.bat` | **`tools/GameSaveHelper`（随包发的存档备份工具）的数据源**：`发布*环境.bat`、`检测gamesjson.bat` 都读它，生产机上是 `X:\YunGame\PlayNite\games.json`。<br>⚠️ 它是 camelCase 字段 + **tab 缩进**，而 GameSaveHelper 的 C++ 用**精确文本锚点**解析（`\n\t\t"name": "` / `\n\t\t"savePaths"`）—— 字段名、缩进、文件名都不能动，别顺手"优化" |

> 一句话区分两者：**`dev-data/library-json/games.json` 是"可编辑的管理镜像"（snake_case 列名、整表快照），
> 仓库根 `games.json` 是"给存档工具看的只读导出"（camelCase、tab 缩进）**。名字像，用途完全不同。

## 2. 三步走

```bash
npm run db:export              # ① 导出（只读，不动库）→ dev-data/library-json/*.json
# ② 用编辑器改 dev-data/library-json/games.json 等
npm run db:import              # ③ 预览（DRY-RUN，不动库）
npm run db:import -- --apply   #    确认无误后真写（自动备份 + 原子替换）
```

不想敲命令就**双击 `libraryjson-importto-librarydb.bat`**：它先预览，按 `Y` 才写；`librarydb-exportto-libraryjson.bat` 是只导出。

**写库前会先自动备份原库**（`library.db.bak-<本地时间戳>`，就在库旁边），写完把那次的备份文件名
指出来 —— 那就是回退点。想**手动**先留一个点（比如批量改 JSON 之前），双击 `librarydb-backup.bat`
（= `node scripts/library-json.mjs backup`，只复制、不写库，随时可跑）。

⚠️ **回写后要重启客户端才生效**：客户端启动时才会把权威库复制成运行时副本（见 §7）。

## 3. 常见任务怎么做（照着改就行）

> 记不住命令就记这一条：**导出 → 改 `dev-data/library-json/games.json` → 预览 → 回写 → 重启客户端**。
> 双击 `libraryjson-importto-librarydb.bat` 就是"预览 + 回写"两步。

### 3.1 改一个游戏（简介 / 标签 / 权限等级 / 存档路径 / 评分…）

1. `npm run db:export` —— 生成/刷新 `dev-data/library-json/games.json`（导出是只读的，不动库）。
   （文件已经存在、且期间没人改过库时，可以跳过这步直接改。）
2. **找到那个游戏**，改那一行里对应的列。别在 12 万行里肉眼翻 —— 用查找命令（直接报行号）：

   ```bash
   npm run db:find -- 消防
   # 第  21563 行  # 216  消防模拟：火苗燃动-网吧联机版
   #            id=2b6653bb-…  game_id=b25b5f82…  level=2  installed=1
   #            tags=模拟 / 多人合作 / 第一人称 / 消防救援 / 硬核拟真
   ```

   ⚠️ 库里名字**常带后缀** —— 找「消防模拟」时它其实叫「消防模拟：火苗燃动-网吧联机版」，
   所以**搜短词更稳**（`消防` 而不是全名）。查找范围是 `name` / `id` / `game_id` /
   `origin_name` / `tags` / `region`（刻意**不查** `intro`，否则会把"提到同款玩法"的游戏也带出来）。

   然后照下面改那一行：

   ```jsonc
   { "id": "…", "name": "傲气雄鹰：重装上阵",
     "intro": "新的简介",                    // 纯文本，界面按纯文本渲染，别写 markdown
     "tags": ["竖版射击", "街机"],            // 数组列必须写真数组（写字符串会被拦下）
     "game_level": 2 }                      // 1 = 黄金版可玩、2 = 钻石版可玩
   ```

3. `npm run db:import` —— **预览**：会告诉你"新增 0 / 删除 0 / 修改 1 / 已一致 1284"。
4. 数字对得上 → `npm run db:import -- --apply` 真写（自动备份 + 原子替换）。
5. **重启客户端**（启动时才把权威库复制成运行时副本）。

### 3.2 批量改

把 `games.json` 当普通 JSON 处理 —— 脚本批量替换、VS Code 多光标、Excel 导出再拼回来都行。
改完照 3.1 的第 3~5 步。**建议**：大改之前先复制一份 `games.json` 留底（见 3.8）。

### 3.3 新增一个游戏

在数组里加**一整行**（照抄一个现成的行再改最省事）：

- `id`：必填，随便一个不重复的字符串（建议 UUID，和别的一样）。
- `name`：必填，且**全库唯一**（重名会被拦下 —— 库上有唯一索引）。
- 其它列不写就是 NULL；启动相关的列（`actions` / `play_task` / `install_directory`）有格式约定，
  先抄一个同类型游戏的行再改。
- 写完 `npm run db:import` 预览（应显示"新增 1"）→ `--apply`。

### 3.4 删掉一个游戏

把那一行从数组里删掉即可 —— 语义是"JSON 就是这张表的全量快照"，JSON 里没有 = 库里也没有；
预览会显示"删除 1"，确认后再 `--apply`。

### 3.5 新增一个字段（列）

1. 在 JSON 里给需要的行写上这个键（例如 `"show_bat_console": 1`）。
2. `npm run db:import` → 会**报错**"库里不存在的列"（那是防拼错的），按提示加 `--add-columns`：

   ```bash
   node scripts/library-json.mjs import --apply --add-columns
   ```

   新列**不声明类型**（SQLite 按写入值原样存），避免 `0` 被类型亲和性转成 `'0'` 那种静默错。
3. 之后 `npm run db:export` 就会把它一起导出来（导出只导库里真实存在的列）。
   ⚠️ 如果 App 要**读**这个新列，还得在 `electron/core/db.ts` 的 `rowToGame` 里接一下。

### 3.6 从外部源补空缺（LiteDB / 游戏列表 / 详情页）

```bash
node scripts/gen-game-content.mjs --dry-run     # 先看会补多少
node scripts/gen-game-content.mjs               # 写进 games.json（只补空，不覆盖你写的）
npm run db:import                               # 预览
npm run db:import -- --apply                    # 回写
```

`--refresh-level`（按 YunGame_Gamelist 重算权限等级）、`--refresh-savepaths`（按 LiteDB 重取存档路径）
可强制覆盖这两项的现有值。

### 3.7 手写简介（分批产出）

```bash
node scripts/dump-intro-material.mjs --limit 60 --brief   # ① 导出素材（名字 + 标签）
# ② 据此写成 dev-data/batches/xx.json，内容是 {"游戏名": "简介", …}
node scripts/merge-authored-intros.mjs                    # ③ 合并进 games.json（带风格校验）
npm run db:import -- --apply                              # ④ 回写
```

### 3.8 改坏了怎么回退

| 情况 | 怎么办 |
| --- | --- |
| **JSON 改坏**（语法错、删多了） | 用编辑器撤销；或 `npm run db:export -- --force` 从权威库重导一份**全新的**镜像（注意：那会丢掉你未回写的改动）。⚠️ 别指望 git —— 这份镜像已经不纳入版本管理（见文件头），所以**改之前先 `npm run db:backup`** 才是正解 |
| **库写错了** | 每次回写都会留一份 `dev-data/Admin/library.db.bak-<本地时间戳>`（那份是回写**之前**的整库），把它复制回 `library.db` 覆盖即可。`libraryjson-importto-librarydb.bat` 写完会直接把这个文件名报出来，不用自己去目录里翻；也可以随时双击 `librarydb-backup.bat` 手动留点 |
| **想确认"库现在到底是什么"** | `npm run db:export -- --force`（丢弃 JSON 里的未回写改动，用库里的值重出） |
| **JSON 与库不一致但两边都想留** | 先 `npm run db:import -- --apply` 把 JSON 存进库，再正常导出 |
| **回写后"库的时间戳没变、也没多出备份"** | **正常，不是没起作用**：预览里 `新增 0 / 删除 0 / 修改 0 / 已一致 N` 就是"没有东西可写"，脚本按设计**不写库、不产生备份**（双击入口现在会直接告诉你"没有要回写的改动"并收工）。要验证它真会写：随便改 `dev-data\library-json\games.json` 里一行的 `intro` → 回写 → 会显示 `修改 1`、库的 mtime 变、并生成新备份。⚠️ 另一个高频原因：**改错了文件** —— 该改的是 `dev-data\library-json\games.json`（整库镜像），不是仓库根那个 `games.json`（给存档工具看的只读导出） |

## 4. 文件长什么样

一个表一个文件（文件名 = 表名 + `.json`），顶层是**数组**，一行一条记录，键名**就是库里的列名**：

```jsonc
// dev-data/library-json/games.json（片段，共 1285 行）
[
  {
    "id": "00050a50-6abd-401b-8888-f0e53f376e98",
    "name": "傲气雄鹰：重装上阵",
    "intro": "扮演一名空军飞行员，驾驶战机在竖版天空中躲避漫天弹幕……",
    "tags": ["竖版射击", "街机", "弹幕", "升级解锁"],
    "region": ["波兰"],
    "save_paths": ["D:/YunGame/V/SkyForceReloaded/Save/*.*"],
    "game_level": 2,          // 1 = 黄金版可玩、2 = 钻石版可玩（门禁判据）
    "installed": 1,           // 数字与 NULL 一律原样，不猜类型
    "show_bat_console": null  // 三态：null = 跟随全局设置 / 0 = 强制隐藏 / 1 = 强制显示
  }
]
```

| 写法 | 规则 |
| --- | --- |
| **数组列**（`tags` / `region` / `save_paths` / `actions` / `links` / `genre`…） | 必须写成**真数组**。写成字符串（`"休闲#生存"`）会被原样存进库，而 App 读它时 `JSON.parse` 失败会**当成空数组**（值静默丢了）—— 所以导入时会直接**报错拦下**（判定用的是导出时自动记下的数组列清单，不是手写字段表） |
| 数字 / `1`-`0` / `null` | **原样**。刻意不把 `1/0` 折成 `true/false`：`show_bat_console` 的 `0/1` 与 `NULL` 是三种不同含义，猜错就改语义 |
| 缺列 | 等于写 **NULL**（"整表替换"语义：JSON 就是这张表那一刻的全量快照） |
| 表里没有的列名 | **报错拦下**（防拼错 —— 拼错的列不会进库、也不会报错，只会静默丢掉你的编辑）。真要新增列加 `--add-columns` |
| 空表 | **不导出**（并顺手删掉它残留的旧 json）。当前 `dev-data/library-json/` 下只有 `games.json` 一个表文件（见表范围 §1.1） |

`_meta.json` 是元数据（导出时间、库指纹、每表行数、哪些列是数组列），**不是表**，别删。

## 5. 安全阀（都在代码里，不靠自觉）

| 措施 | 为什么 |
| --- | --- |
| **只认权威库**（`<数据根>/Admin/library.db`） | 运行时副本是"每次启动从权威库复制"的可丢弃文件，改它等于白改 |
| **导出永不改库** | 只读。导出完可以直接拿去比 diff |
| **导出也防覆盖** | 导出是"用库里的值覆盖 JSON"，方向反过来一样会丢数据：文件与库**不一致**（改了还没回写）时**拒绝导出**，要 `--force` 才覆盖。⚠️ 这条是实测踩出来的 —— 合并完人工内容后顺手又跑了一次 `export`，刚合并的内容被库里的旧值直接抹掉了（指纹只防"拿旧 JSON 回写"那个方向） |
| **导入默认 DRY-RUN**，`--apply` 才写 | 与项目里其它写库脚本一致 |
| **只替换"有 JSON 文件"的表** | 没导出的表（比如你只导了 games）绝不动 —— 不会误删 `users` 等其它表 |
| **复制现库 → 清空目标表 → 插回**（不是按 `db.ts` 的 SCHEMA 新建库） | 权威库的真实列与 `electron/core/db.ts` 的 `SCHEMA` **不一致**（实测多一列 `description_alt`、且没有 `show_bat_console`）—— 按 SCHEMA 重建会**整列丢数据** |
| **校验**：JSON 语法、顶层数组、行是对象、主键重复、`games.name` 唯一、列名存在、数组列写法 | 这些都是"手改 JSON 时真会犯、而报错信息会很难懂"的错。列名写错最阴 —— 不报错，只是那一列静默变 NULL |
| **写前备份**（`.bak-<本地时间戳>`，见 §6）+ **写进临时文件、复验行数通过才原子改名** | 中途失败/被杀不会留下半截库。备份**没有关闭开关**（不提供 `--no-backup`）：它是最后一道回退手段，能关掉就总有人在最需要它的那天关掉它 |
| **指纹保护** | `_meta.json` 记下导出时库的"大小 + mtime"。若库在导出后被别的脚本改过，导入**直接拒绝**（要 `--force`）—— 拦住"拿三天前的导出回写"，那会把期间的改动悄悄抹掉 |

## 6. 命令与开关

```bash
# 找游戏（读 games.json，报行号 + 关键列；不读库、不改任何东西）
npm run db:find -- 消防
node scripts/library-json.mjs find "30XX"

# 导出（只读，但会覆盖 JSON 文件）。默认只导 games；要别的表就 --tables 显式指名
npm run db:export
node scripts/library-json.mjs export --tables users
node scripts/library-json.mjs export --force   # 文件与库不一致时也照样覆盖（丢弃 JSON 里的改动）

# 回写。默认只预览；--apply 才写
node scripts/library-json.mjs import            # 预览：每表 新增/删除/修改/已一致
node scripts/library-json.mjs import --apply    # 真写
node scripts/library-json.mjs import --apply --merge          # 只合并不删行（默认是整表替换）
node scripts/library-json.mjs import --apply --force          # 库被改过（指纹不一致）也照样写
node scripts/library-json.mjs import --apply --add-columns    # 允许按 JSON 新建列

# 备份（只复制权威库，不写库；回写内部也走同一份逻辑，命名规则只有一份）
npm run db:backup
node scripts/library-json.mjs backup
```

双击入口：`libraryjson-importto-librarydb.bat`（预览 → 按 `Y` → **先备份** → 写入）、`librarydb-exportto-libraryjson.bat`（只导出）、
`librarydb-backup.bat`（只备份权威库，随时可跑）。`--yes` 可跳过确认（给自动化用）。

这三个 `.bat` **只是"双击壳"**（切目录 → `powershell -NoProfile -ExecutionPolicy Bypass -File …` → `pause`），
逻辑在 `scripts/libraryjson-importto-librarydb.ps1` / `scripts/librarydb-exportto-libraryjson.ps1` /
`scripts/librarydb-backup.ps1`（2026-09-16 按 `PROJECT-MEMORY.md` 硬约定 §三.14 改造：**逻辑写 .ps1、
bat 只当壳**）。真正的库操作仍在 `scripts/library-json.mjs` ✓。退出码是真的（失败返回非零，可给自动化用）。

**备份名**：`library.db.bak-<本地时间戳 YYYYMMDD-HHMMSS>`（如 `library.db.bak-20260916-043012`），
就在库旁边（`dev-data/Admin/`）。规则在 `scripts/lib/libraryJson.mjs` 的 `localStamp()`（有单测）。
2026-09-16 之前是 UTC ISO 名（`…bak-2026-09-15T19-23-46-171Z`）—— 得换算时区才认得出是哪天，已改掉。
同一秒内连备两次会加 `-2` 后缀，**绝不覆盖**已有备份（覆盖备份 = 把回退点弄丢）。备份只增不删，
确认库没问题后自己删旧的即可（`dev-data/Admin/*.bak-*` 不进 git）。

**无主键的行**（库里真有一行 `name="大富翁11"` 而 id 全空的老残留）：不拦，但会打个 `[注意]` 提醒你
补 id 或删掉；`--merge` 模式下这类行没法按主键匹配，会跳过。

## 7. 与运行期的关系（三个必须知道的行为）

- **回写后要重启客户端**：客户端**启动时**就比较"权威库 vs 运行时副本"，不一致就复制
  （判定看"大小 + 时间"，见 `shared/librarySync.ts`），所以不重启看到的是旧数据。
- **运行期写入不会回到权威库**：游玩时长 / 最后游玩 / 收藏 / 隐藏这些是**运行期**改的，只落在
  运行时副本上，**重启即回到权威库的值**（这是双库机制本来的设计，不是这次改的）。
  所以 `games.json` 里这些列的值 = 权威库里的值，你在 JSON 里改它们，效果就是"下次启动用这个值"。
- **比较时机 = 应用启动；退出不写库；客户端永不回写权威库**（2026-09-16 按用户要求定下的三条）：

  | 环节 | 行为 |
  | --- | --- |
  | 启动（`electron/main.ts` 的 `whenReady`） | `syncRuntimeDatabase()`：比**大小 + 修改时间**，**不一致就复制**（用户指定的规则） |
  | 点"进入系统" | `openDb()` 再幂等调一次同步（一致时只是一次 stat），之后才 sql.js 初始化 + 把库读进内存 |
  | 退出应用 | `closeDb()` **只关连接、不写库**（每个写操作改完都已即时落盘） |
  | 任何一次写副本 | `persist()` 有**硬断言**：写目标解析成权威库路径就直接抛错 —— 客户端只写副本，**永不回写权威库** |

  复制时用 `cpSync(preserveTimestamps: true)` 把权威库的 mtime 一并带过去，所以**复制完那一刻两边
  时间戳完全相等**。早期"看不到相等"，是因为 `migrateAddColumns()` 紧接着给副本补
  `show_bat_console` 列并整体写回（把 mtime 改成那一刻）—— 该列**已补进权威库**（`games.json` 加
  `"show_bat_console": null` + `db:import --add-columns`），这个改写不再发生。
  现在的实际表现：**没改动的启动/退出之后，两库的"大小 + 时间"一直保持一致**，下次启动直接
  `[db] 运行时副本与权威库一致（大小/时间相同），跳过复制`；**只有**运行期真写了数据（游玩时长 /
  最后游玩 / 收藏 / 隐藏 / 上次会话）或权威库被 `db:import` 回写过，副本才会变旧、下次启动才复制 ——
  这正是"不一致就复制"应有的样子。
  ⚠️ 核对"两库内容是否一致"仍然要看**内容**（运行期写入会让副本比权威库新，那正是设计使然）。
  实测（修复前）：两库都是 `2,244,608 字节`、6 张表行数完全相同、只差 `games.show_bat_console`
  那一列；修复后连列也一致。

## 8. 配套脚本

| 脚本 | 干什么 |
| --- | --- |
| `scripts/gen-game-content.mjs` | 从 **LiteDB 导出 / YunGame_Gamelist / 详情页 info.json / 权威库** 给 `games.json` **补空缺**（只补空，你的手写值永不被覆盖；`--refresh-level` / `--refresh-savepaths` 可强制重取） |
| `scripts/merge-authored-intros.mjs` | 把 `dev-data/batches/*.json`（一批一个 `{"游戏名": "简介"}`）合并进 `games.json` 的 `intro`，并做风格校验 |
| `scripts/dump-intro-material.mjs` | 写简介的素材（游戏名 + 详情页标签 + 爬来的介绍，分批看） |
| `scripts/check-architecture.mjs` | 守卫：`dev-data/library-json/` 必须在、JSON 必须能解析、行必须是对象、`games` 每行必须有 `name` |

## 9. 相关文档

- 库表结构（每张表每个列）：[database-schema.md](./database-schema.md)
- 数据模型（Game 的 TS 结构）：[data-models.md](./data-models.md)
- 目录与路径配置：[directory-structure.md](./directory-structure.md)
- 存档路径怎么用：[save-backup-tool.md](./save-backup-tool.md)
- 权限等级（`game_level` 的门禁规则）：[user-level-detection.md](./user-level-detection.md)
