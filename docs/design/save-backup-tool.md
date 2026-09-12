# 存档备份接入 GameSaveHelper 设计文档

> 状态：设计定稿 v1.0（2026-09-11 决策确认）
> 关联：`docs/design/save-manager.md`（旧设计）。本文档**取代**其中「四、NSIS 自解压方案」与
> 「八、文件清单」两节；旧文档里的 `SavePath[]` 结构、StorageProvider、备份索引等也**未实现且已作废**，
> 现状以本文档 + 代码为准。

## 一、背景

Playday 目前自己拼 NSIS 脚本、调用 `makensis.exe` 生成自解压 exe：

- `electron/core/nsis.ts` —— 生成 `.nsi`（每个存档路径一个 Section）+ `spawnSync` 调 makensis。
- `electron/core/saveManager.ts` —— 存档路径通配符匹配、备份文件命名、桌面路径。（**已删除**）
- `electron/ipc/saveManager.ts` —— `backup_game_save` / `backup_preview` / `nsis_available`。

现已有独立工具 **GameSaveHelper.exe**（`D:\AI\nsis`），具备同样能力且更成熟：自带
NSIS 发行包、恢复包模板与图标、界面进度与结果详情、逐条容错、运行日志。

**本次改动**：Playday 不再自己编译，一律调用 GameSaveHelper.exe。

## 二、已确认的决策

| 维度 | 决策 |
| --- | --- |
| 调用方式 | **方式一**：`GameSaveHelper.exe <游戏名> "路径1" "路径2" ...`，路径由 App 展开后传入 |
| 内置编译 | **完全取代** —— 删除 `electron/core/nsis.ts`，不再依赖 makensis |
| exe 路径来源 | **config.json 的 `settings.gameSaveHelperPath`** |
| 调用形态 | **不传 `/q`**（工具出窗口：失败原因与"如何使用备份包"都由工具呈现）；**不传 `/out:`**（输出位置由工具自己的 `settings.json` 决定，默认桌面） |
| `backup_preview` | **一并删除**（前端无任何调用方） |
| 数据层 | sqlite → JSON 迁移**搁置**，不在本次范围 |
| 封面 | 删除 `updateCoverImages`，封面改为**读时计算、不落库** |

## 三、配置

### 3.1 新增字段

`config.json`（与主程序同级）：

```json
{
  "settings": {
    "gameSaveHelperPath": "D:/AI/nsis/GameSaveHelper.exe"
  }
}
```

解析规则（复用 `paths.ts` 现有 `configuredDir` 的做法）：

- 绝对路径 → 原样使用；
- 相对路径 → 以**应用 exe 所在目录**（`paths.ts::appRoot()`）为基准补全；
- 空串 / 未设置 / 文件不存在 → 视为「未配置」。

### 3.2 类型同步（3 处，缺一编译不过）

| 文件 | 改动 |
| --- | --- |
| `shared/models.ts` | `DEFAULT_SETTINGS` 增加 `gameSaveHelperPath: ""` |
| `electron/core/models.ts` | `AppSettings` 增加 `gameSaveHelperPath?: string` |
| `src/types/models.ts` | `AppSettings` 增加 `gameSaveHelperPath?: string` |

## 四、调用设计

### 4.1 参数拼装

```
GameSaveHelper.exe 大富翁11 "X:\YunGame\X\大富翁11\2074800\*.*" "X:\YunGame\X\大富翁11\settings\*.*"
```

- 第 1 个参数：`game.name`。
- 其余参数：`game.savePaths` 逐条经 `resolvePath(sp, libraries)` 展开 `{游戏库名}` 占位符后的结果，
  **通配符（`*.*` / `*.save`）原样保留**，由工具自己 `FindFirstFile` 匹配。
- **不做预检过滤**：即使某条路径不存在、无匹配文件也照传，由工具逐条报告。理由：失败原因统一
  由工具窗口呈现，且避免「App 静默丢掉一条路径」这种不可见行为。

### 4.2 进程启动

```ts
spawn(exePath, [gameName, ...resolvedPaths], {
  cwd: path.dirname(exePath),   // 保证工具找得到自己的 template\ / settings.json / logs\
  detached: true,
  stdio: "ignore",
}).unref();
```

- **不等待退出**：工具会打开窗口并在用户关闭前一直存活，App 不能阻塞。
- `cwd` 必须设为 exe 所在目录，否则工具的相对路径（模板、日志、输出设置）会落到别处。

### 4.3 错误处理

| 情况 | IPC 返回 | 前端表现 |
| --- | --- | --- |
| `gameSaveHelperPath` 未配置 | `{ ok:false, error:"未配置存档备份工具路径（config.json → settings.gameSaveHelperPath）" }` | Toast 报错 |
| 配置的 exe 文件不存在 | `{ ok:false, error:"存档备份工具不存在：<路径>" }` | Toast 报错 |
| 该游戏未配置 `savePaths` | `{ ok:false, error:"该游戏未配置存档路径" }` | Toast 报错 |
| `spawn` 抛错 | `{ ok:false, error:<msg> }` | Toast 报错 |
| 成功启动工具 | `{ ok:true }` | **不弹 Toast**，工具窗口接管反馈 |

## 五、封面：改为读时计算

`updateCoverImages` 只被 `applyCoversToDb()` 调用，作用是把匹配到的封面**写回数据库**。
按决策删除，封面改为每次读取时在内存里算：

- 删除 `electron/core/db.ts` 的 `updateCoverImages`。
- 删除 `electron/core/covers.ts` 的 `applyCoversToDb`，改为导出
  `applyCoversToLibrary()` = `applyCovers(getGames())`（只算不写）。
- `electron/ipc/games.ts` 的 `get_games`、`electron/ipc/covers.ts` 的 `scan_covers` 改调新函数，
  返回结构不变（前端 `api.scanCovers()` 不用改）。
- `games` 表的 `cover_image` **列保留不删**（`CREATE TABLE IF NOT EXISTS` 不会改已存在的旧库，
  删列会破坏兼容）；只是不再写入。`rowToGame` 仍读该列，旧库里已有的值照旧生效。
- 前端 `<img>` 走的仍是 `coverImage` → `imageUrl()` → `read_images_batch`，显示行为不变。

## 六、影响面清单

### 新增

| 文件 | 内容 |
| --- | --- |
| `electron/core/gameSaveHelper.ts` | `resolveHelperExe(): string \| null`；`launchSaveBackup(gameName, paths): { ok, error? }` |
| `electron/core/paths.ts` | 导出通用 `configuredPath(field)`（由现有私有 `configuredDir` 泛化）+ `gameSaveHelperExePath()` |

### 修改

| 文件 | 改动 |
| --- | --- |
| `shared/models.ts`、`electron/core/models.ts`、`src/types/models.ts` | 加 `gameSaveHelperPath` |
| `electron/ipc/saveManager.ts` | 改写 `backup_game_save`；删 `backup_preview`、`nsis_available`；换 import |
| `electron/core/covers.ts` | 删 `applyCoversToDb`，加 `applyCoversToLibrary`；删 `updateCoverImages` import |
| `electron/ipc/games.ts` | `get_games` 改调 `applyCoversToLibrary` |
| `electron/ipc/covers.ts` | `scan_covers` 改调 `applyCoversToLibrary` |
| `src/api/client.ts` | `backupGameSave` 去掉 `outDir` 参数、返回类型改 `{ok, error?}`；删 `getNsisAvailable` |
| `src/components/GameExitBackupPrompt.tsx` | 去掉成功/失败 Toast，仅启动失败时提示 |
| `src/components/GameContextMenu.tsx` | 同上 |
| `locales/*.json` | **不改**。错误文案沿用现有做法：主进程直接返回中文串（如现有 `"游戏不存在"`），前端优先显示 `res.error`、回退到已有的 `backup_failed_body`。单为这一处引入错误码 + i18n 映射会形成两套错误处理风格 |

### 删除

| 文件 | 内容 |
| --- | --- |
| `electron/core/nsis.ts` | 整个文件 |
| `electron/core/saveManager.ts`（**已删除**） | 整个文件（`collectSavePath`/`globMatch`/`splitDirPattern`/`backupFileName`/`desktopPath`，仅服务 `backup_preview` 与旧编译流程） |
| `electron/core/db.ts` | `updateCoverImages` 函数 |
| `src/api/client.ts` | `getNsisAvailable` |

## 七、非目标（明确不做）

1. **sqlite → JSON 迁移**：外部工具要数据的需求已由 `_export-games-json.mjs` 导出 +
   `import-games.bat` 导入满足；且本次采用方式一，工具根本不读 Playday 的数据。
   换主存储要付出「丢 `name` 唯一约束、丢原子写、重写 `db.ts` 全部 SQL 调用点、启动全量解析」
   的代价，属独立重构，单独开 spec。
2. **恢复流程**：仍由工具生成的恢复包 exe 双击执行，Playday 不介入。
3. **`cover_image` 列本身**：不删（旧库兼容），只是不再写。
4. **`coverImage` 字段在 Game 模型与前端的所有引用**：保留。

## 八、验证

1. `config.json` 填好 `gameSaveHelperPath` → 右键游戏「备份存档」→ 工具窗口弹出并自动开始备份，
   桌面出现 `存档备份【游戏名】_时间戳.exe`。
2. 故意把 `gameSaveHelperPath` 指向不存在的文件 → App 弹 Toast「存档备份工具不存在」，不崩。
3. 清空 `gameSaveHelperPath` → App 弹 Toast「未配置存档备份工具路径」。
4. 给某游戏配一条不存在的存档路径 → 工具窗口应逐条列出跳过原因，其余路径正常出包。
5. 在游戏详情/右键菜单确认「应用存档」功能不受影响（走的是 `ipc/saves.ts`，未改动）。
6. 启动 App → 封面正常显示；确认 `library/library.db` 的 `cover_image` 不再被写入
   （改 `coverImage` 相关逻辑后重启，值不变）。
7. `npm run build` / `tsc` 无类型错误（重点看删掉 `getNsisAvailable`、`updateCoverImages` 后
   是否还有残留引用）。
