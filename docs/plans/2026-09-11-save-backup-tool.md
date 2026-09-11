# 存档备份接入 GameSaveHelper 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playday 不再自己拼 NSIS 脚本编译备份 exe，改为调用独立的 GameSaveHelper.exe 完成存档备份；顺带把封面从"写回数据库"改为"读时计算"。

**Architecture:** 新增一个薄接入层 `electron/core/gameSaveHelper.ts`（解析配置里的 exe 路径 + spawn 工具），`ipc/saveManager.ts` 只负责"取游戏 → 展开 `{游戏库名}` 占位符 → 交给接入层"。备份失败/成功的反馈全部由工具自己的窗口承担，Playday 只提示"工具启动失败"。

**Tech Stack:** Electron 32 主进程（TypeScript, CommonJS）、`child_process.spawn`、React 18 渲染进程、sql.js（本次不改数据层）。

## Global Constraints

- **不传 `/q`**：工具必须出窗口（失败原因 + "如何使用备份包"都由它呈现）。
- **不传 `/out:`**：输出位置由工具自己的 `settings.json` 决定，默认桌面。
- **不做预检过滤**：没匹配到文件的存档路径也照传给工具，由工具逐条报错；不允许 App 静默丢弃路径。
- **exe 路径只从 `config.json` 的 `settings.gameSaveHelperPath` 读**，不加自动探测、不加设置界面。
- **相对路径以数据根（`configRoot()`）为基准解析**（与 `coverImagesDir` / `gameDetailsDir` 一致）。
- 不改数据层（sqlite 保持）、不改恢复流程（恢复包仍由工具生成后双击执行）、不改 `ipc/saves.ts`（"应用存档"）。
- 主进程返回的错误文案沿用现有做法：**直接返回中文字符串**（如现有 `"游戏不存在"`），本次不新增 i18n key。
- 项目**没有可运行的测试框架**（`vitest` 未安装、无 `test` 脚本），因此每个任务的验证是 `tsc --noEmit` + 手工验收，不要写跑不起来的测试文件。

---

### Task 1: 配置字段 `gameSaveHelperPath` + 路径解析

**Files:**
- Modify: `shared/models.ts`（`DEFAULT_SETTINGS`，约 64-125 行）
- Modify: `electron/core/models.ts`（`AppSettings`，约 165-254 行）
- Modify: `src/types/models.ts`（`AppSettings`，约 126-202 行）
- Modify: `electron/core/paths.ts`（`configuredDir` → 导出 `configuredPath`；新增 `gameSaveHelperExePath`）

**Interfaces:**
- Consumes: 无
- Produces:
  - `AppSettings.gameSaveHelperPath?: string`（主进程 + 前端两份类型）
  - `DEFAULT_SETTINGS.gameSaveHelperPath: ""`
  - `paths.ts`: `export function configuredPath(field: string): string | null`
  - `paths.ts`: `export function gameSaveHelperExePath(): string | null`

- [ ] **Step 1: 给 `shared/models.ts` 的 `DEFAULT_SETTINGS` 加默认值**

在 `coverImagesDir: ""` 之后加一行：

```ts
  // 存档备份工具 GameSaveHelper.exe 的路径（空 = 未配置，备份不可用）。
  // 绝对路径原样使用；相对路径以数据根为基准解析。
  gameSaveHelperPath: "",
```

- [ ] **Step 2: 给主进程 `electron/core/models.ts` 的 `AppSettings` 加字段**

在 `coverImagesDir?: string;` 之后加：

```ts
  // 存档备份工具 GameSaveHelper.exe 的路径（config.json → settings.gameSaveHelperPath）。
  // 空 / 未设置 = 未配置（备份时返回明确错误）。绝对路径原样；相对路径以数据根为基准。
  gameSaveHelperPath?: string;
```

- [ ] **Step 3: 给前端 `src/types/models.ts` 的 `AppSettings` 加字段**

在 `coverImagesDir?: string;` 之后加：

```ts
  /** Path to GameSaveHelper.exe (save backup tool). Empty/unset = not configured. */
  gameSaveHelperPath?: string;
```

- [ ] **Step 4: 把 `paths.ts` 的私有 `configuredDir` 泛化成导出的 `configuredPath`**

把 `electron/core/paths.ts` 里 `function configuredDir(field: string): string | null {` 整个函数（含上面那段注释）替换为：

```ts
// 读取 config.json 里 settings 下某个"自定义路径"字段（目录或文件都适用）。
// 支持：绝对路径原样使用；相对路径以数据根为基准解析；未配置（含空串）返回 null（用默认）。
// 注意：这里直接解析 config.json，不 import settings.ts，避免 paths ↔ settings 循环依赖。
export function configuredPath(field: string): string | null {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as { settings?: Record<string, unknown> };
    const p = parsed?.settings?.[field];
    if (p && typeof p === "string" && p.trim() !== "") {
      // path.resolve：绝对路径原样返回，相对路径以数据根为基准补全。
      return path.resolve(configRoot(), p.trim());
    }
    return null;
  } catch {
    // config.json 不存在或损坏：没有自定义路径，用默认。
    return null;
  }
}
```

同时把该文件里两处调用改名：

```ts
export function coverImagesDir(): string {
  return configuredPath("coverImagesDir") ?? path.join(configRoot(), "CoverImages");
}
```

```ts
export function gamesHtmlDir(): string {
  return configuredPath("gameDetailsDir") ?? path.join(configRoot(), "Game_Details");
}
```

- [ ] **Step 5: 在 `paths.ts` 末尾加 `gameSaveHelperExePath()`**

```ts
// 存档备份工具 GameSaveHelper.exe 的路径（<主程序目录>/config.json 的
// settings.gameSaveHelperPath）。绝对路径原样；相对路径以数据根为基准；未配置返回 null。
export function gameSaveHelperExePath(): string | null {
  return configuredPath("gameSaveHelperPath");
}
```

- [ ] **Step 6: 类型检查**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无输出（无错误）

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 无输出（无错误）

---

### Task 2: 新增接入层 `electron/core/gameSaveHelper.ts`

**Files:**
- Create: `electron/core/gameSaveHelper.ts`

**Interfaces:**
- Consumes: `gameSaveHelperExePath()`（Task 1）
- Produces:
  - `buildBackupArgs(gameName: string, savePaths: string[]): string[]`
  - `resolveHelperExe(): { path: string } | { error: string }`
  - `launchSaveBackup(gameName: string, savePaths: string[]): { ok: boolean; error?: string }`

- [ ] **Step 1: 创建文件并写入完整内容**

```ts
// 存档备份工具（GameSaveHelper.exe）接入层。
//
// 背景：Playday 原先在 electron/core/nsis.ts 里自己拼 NSIS 脚本 + 调 makensis
// 生成自解压 exe。现改为直接调用独立的 GameSaveHelper.exe（自带 NSIS 发行包、
// 恢复包模板与界面），不再自己编译。完整设计见 docs/design/save-backup-tool.md。
//
// 调用形式（方式一，路径由 App 传入）：
//   GameSaveHelper.exe <游戏名> "路径1" "路径2" ...
// 不传 /q：工具出窗口，失败原因与"如何使用备份包"都由它呈现。
// 不传 /out:：输出位置由工具自己的 settings.json 决定（默认桌面）。

import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { gameSaveHelperExePath } from "./paths";

// 拼装命令行参数：第 1 个是游戏名，其余是存档路径（含通配符，由工具自己匹配）。
// 单独抽成纯函数，便于排查"到底传了什么"。
export function buildBackupArgs(gameName: string, savePaths: string[]): string[] {
  return [gameName, ...savePaths];
}

// 解析 GameSaveHelper.exe 的路径并校验文件存在。
// 返回 { path } 或 { error }，让调用方把 error 直接透给前端。
export function resolveHelperExe(): { path: string } | { error: string } {
  const configured = gameSaveHelperExePath();
  if (!configured) {
    return { error: "未配置存档备份工具路径（config.json → settings.gameSaveHelperPath）" };
  }
  if (!fs.existsSync(configured)) {
    return { error: `存档备份工具不存在：${configured}` };
  }
  return { path: configured };
}

// 启动备份工具（不等待它退出）。
// 工具会打开窗口并在用户关闭前一直存活，所以 detached + unref，不阻塞主进程。
// cwd 设为 exe 所在目录：保证工具找得到自己的 template\ / settings.json / logs\。
export function launchSaveBackup(
  gameName: string,
  savePaths: string[]
): { ok: boolean; error?: string } {
  const resolved = resolveHelperExe();
  if ("error" in resolved) return { ok: false, error: resolved.error };
  const exePath = resolved.path;
  try {
    const child = spawn(exePath, buildBackupArgs(gameName, savePaths), {
      cwd: path.dirname(exePath),
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (err) => {
      console.error("[gameSaveHelper] 启动备份工具失败:", exePath, err.message);
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `启动存档备份工具失败：${msg}` };
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无输出（无错误）

---

### Task 3: 改写 IPC，删除旧的编译链路

**Files:**
- Modify: `electron/ipc/saveManager.ts`（整文件重写）
- Delete: `electron/core/nsis.ts`
- Delete: `electron/core/saveManager.ts`

**Interfaces:**
- Consumes: `launchSaveBackup()`（Task 2）、`resolvePath` / `subscribeGameExit`（`core/process.ts` 既有导出）
- Produces: IPC 命令 `backup_game_save`，入参 `{ gameId: string }`，返回 `{ ok: boolean; error?: string }`；不再注册 `backup_preview` 与 `nsis_available`。

- [ ] **Step 1: 用以下内容整体替换 `electron/ipc/saveManager.ts`**

```ts
// 存档管理 IPC 命令：备份游戏存档。
//
// 备份动作本身由独立的 GameSaveHelper.exe 完成（生成自解压恢复包），Playday 只负责
// 把"游戏名 + 展开后的存档路径列表"传给它。完整设计见 docs/design/save-backup-tool.md。
//
// 注意：不传 /q —— 工具会自己开窗口显示进度、失败原因和"如何使用备份包"，
// 所以这里的返回值只表示"工具是否成功启动"，不代表备份已经成功。
import { ipcMain, BrowserWindow } from "electron";
import { getGame } from "../core/db";
import { getLibraries } from "../core/settings";
import { launchSaveBackup } from "../core/gameSaveHelper";
import { resolvePath, subscribeGameExit } from "../core/process";
import { registerCommand } from "./registry";

export function registerSaveManagerIpc(ipc: typeof ipcMain) {
  // 游戏退出后【不自动备份】，改为把"游戏刚退出、可考虑备份"推给所有窗口的渲染进程。
  // 前端监听 game_exited 事件 → 弹"是否备份存档？"确认框 → 用户选"是"再调 backup_game_save。
  // 这样避免游戏中自动备份因存档文件被锁定而失败，也避免每次都生成 exe 垃圾文件。
  subscribeGameExit((payload) => {
    // 只有该游戏配置了存档路径时才需要提示用户（没配存档路径的备份无意义）。
    if (!payload.hasSavePaths) return;
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send("game_exited", {
        gameId: payload.gameId,
        gameName: payload.gameName,
      });
    }
  });

  // 备份某游戏的存档：启动 GameSaveHelper.exe（不等待它退出）。
  // 入参：{ gameId }。返回 { ok } 只表示"工具已启动"。
  registerCommand(ipc, "backup_game_save", async (a: { gameId?: string }) => {
    const game = a?.gameId ? getGame(a.gameId) : undefined;
    if (!game) return { ok: false, error: "游戏不存在" };

    const savePaths = game.savePaths ?? [];
    if (savePaths.length === 0) {
      return { ok: false, error: "该游戏未配置存档路径" };
    }

    // 展开 {游戏库名} 占位符；通配符原样保留，由工具自己 FindFirstFile 匹配。
    // 故意不过滤"没有匹配文件"的路径：交给工具逐条报告，避免 App 静默丢掉一条路径。
    const libs = getLibraries();
    const resolved = savePaths.map((sp) => resolvePath(sp, libs)).filter((p) => !!p);
    if (resolved.length === 0) {
      return { ok: false, error: "该游戏的存档路径解析后为空" };
    }

    return launchSaveBackup(game.name, resolved);
  });
}
```

- [ ] **Step 2: 删除旧编译链路两个文件**

Run: `rm electron/core/nsis.ts electron/core/saveManager.ts`
（Windows PowerShell 可用 `Remove-Item electron/core/nsis.ts, electron/core/saveManager.ts`）
Expected: 两个文件不存在

- [ ] **Step 3: 确认没有残留引用**

Run: `rg -n "core/nsis|core/saveManager|collectSavePath|compileBackupToExe|nsisAvailable|backupFileName|desktopPath|backup_preview" electron src`
Expected: 无输出（`backup_preview` 已随文件删除；`getNsisAvailable` 在 Task 4 处理）

- [ ] **Step 4: 类型检查**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无输出（无错误）

---

### Task 4: 前端适配

**Files:**
- Modify: `src/api/client.ts`（约 155-164 行：`backupGameSave` 与 `getNsisAvailable`）
- Modify: `src/components/GameExitBackupPrompt.tsx`（`handleBackup`，约 46-68 行）
- Modify: `src/components/GameContextMenu.tsx`（`backupSave`，约 50-63 行）

**Interfaces:**
- Consumes: `backup_game_save`（Task 3，返回 `{ ok, error? }`）
- Produces: `api.backupGameSave(gameId: string)`，返回 `Promise<{ ok: boolean; error?: string }>`

- [ ] **Step 1: 改 `src/api/client.ts`**

把这一整段：

```ts
  // —— 存档备份 ——
  // 检测本机是否有 NSIS 编译器（生成备份 exe 的前提）。
  getNsisAvailable: () => call<boolean>("nsis_available"),
  // 备份某游戏的存档：生成自解压 exe，默认放桌面。
  backupGameSave: (gameId: string, outDir?: string) =>
    call<{ ok: boolean; file?: string; fileName?: string; error?: string }>(
      "backup_game_save",
      outDir ? { gameId, outDir } : { gameId }
    ),
```

替换为：

```ts
  // —— 存档备份 ——
  // 备份某游戏的存档：启动 GameSaveHelper.exe，由它生成自解压恢复包。
  // 返回的 ok 只表示"工具已启动"；备份是否成功由工具窗口自己呈现。
  backupGameSave: (gameId: string) =>
    call<{ ok: boolean; error?: string }>("backup_game_save", { gameId }),
```

- [ ] **Step 2: 改 `src/components/GameExitBackupPrompt.tsx` 的 `handleBackup`**

把 `handleBackup` 整个函数替换为：

```tsx
  const handleBackup = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const res = await api.backupGameSave(pending.gameId);
      // 成功启动后不再弹 App 通知：备份进度、失败原因和"如何使用备份包"都由
      // GameSaveHelper 自己的窗口呈现，App 再提示一遍会重复打扰用户。
      // 只有在"工具没能启动"时才需要 App 报错（未配置路径 / exe 不存在 / 无存档路径）。
      if (!res?.ok) {
        void api.showNotification(
          t("backup_failed_title"),
          res?.error || t("backup_failed_body", { name: pending.gameName })
        );
      }
    } catch (e) {
      void api.showNotification(t("backup_failed_title"), String(e));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };
```

- [ ] **Step 3: 改 `src/components/GameContextMenu.tsx` 的 `backupSave`**

把 `backupSave` 整个函数替换为：

```tsx
  // 手动备份存档：启动 GameSaveHelper.exe，由它生成自解压恢复包。
  // 成功不弹 Toast（工具窗口自己显示），只在"工具没能启动"时提示。
  const backupSave = async () => {
    if (!game.id) return;
    try {
      const res = await api.backupGameSave(game.id);
      if (!res?.ok) {
        void api.showNotification(
          t("backup_failed_title"),
          res?.error || t("backup_failed_body", { name: game.name })
        );
      }
    } catch (e) {
      void api.showNotification(t("backup_failed_title"), String(e));
    }
  };
```

- [ ] **Step 4: 确认无残留引用**

Run: `rg -n "getNsisAvailable|nsis_available|outDir" src/api src/components/GameExitBackupPrompt.tsx src/components/GameContextMenu.tsx`
Expected: 无输出

- [ ] **Step 5: 类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 无输出（无错误）

---

### Task 5: 封面改为读时计算、不落库

**Files:**
- Modify: `electron/core/db.ts`（删除 `updateCoverImages`，约 431-447 行）
- Modify: `electron/core/covers.ts`（`applyCoversToDb` → `applyCoversToLibrary`；改 import）
- Modify: `electron/ipc/games.ts`（`get_games`）
- Modify: `electron/ipc/covers.ts`（`scan_covers`）

**Interfaces:**
- Consumes: 既有 `applyCovers(games)`、`getGames()`
- Produces: `covers.ts` 导出 `applyCoversToLibrary(): { games: Game[]; result: CoverScanResult }`（只算不写）；`updateCoverImages` 与 `applyCoversToDb` 不再存在。

- [ ] **Step 1: 删除 `electron/core/db.ts` 的 `updateCoverImages`**

把从注释 `// 批量更新多个游戏的封面路径。...` 开始到该函数结束（`  persist();\n}`）的整块删除。删除后 `updateGamePlaytime` 直接跟在 `deleteGame` 之后。

- [ ] **Step 2: 改 `electron/core/covers.ts`**

把第 12 行的 import：

```ts
import { getGames, updateCoverImages } from "./db";
```

改为：

```ts
import { getGames } from "./db";
```

再把 `applyCoversToDb` 整个函数（含其上注释）替换为：

```ts
// 给库里所有游戏套封面（读时计算：只改内存里的 Game 对象，不写回数据库）。
//
// 历史：这里原名 applyCoversToDb，会把匹配到的封面写回 cover_image 列。现在
// cover_image 字段不再使用（导出/入库都以空值处理），写回没有意义，反而每次
// 读游戏列表都要全库序列化一次，因此改为纯计算。games 表的 cover_image 列保留
// 不删（旧库兼容），只是不再写入。
export function applyCoversToLibrary(): { games: Game[]; result: CoverScanResult } {
  return applyCovers(getGames());
}
```

- [ ] **Step 3: 改 `electron/ipc/games.ts`**

第 21 行 import：

```ts
import { applyCoversToDb } from "../core/covers";
```

改为：

```ts
import { applyCoversToLibrary } from "../core/covers";
```

`get_games` handler 里的 `const { games } = applyCoversToDb();` 改为：

```ts
    const { games } = applyCoversToLibrary();
```

- [ ] **Step 4: 改 `electron/ipc/covers.ts`**

第 12 行 import：

```ts
import { applyCoversToDb, isInCoverDir } from "../core/covers";
```

改为：

```ts
import { applyCoversToLibrary, isInCoverDir } from "../core/covers";
```

`scan_covers` handler 里的 `const { games, result } = applyCoversToDb();` 改为：

```ts
    const { games, result } = applyCoversToLibrary();
```

- [ ] **Step 5: 确认无残留引用**

Run: `rg -n "updateCoverImages|applyCoversToDb" electron src`
Expected: 无输出

- [ ] **Step 6: 类型检查**

Run: `npx tsc -p tsconfig.main.json --noEmit`
Expected: 无输出（无错误）

---

### Task 6: 全量构建与手工验收

**Files:**
- Modify: `config.json`（把 `settings.gameSaveHelperPath` 填成实际的 exe 路径，用于自测；这一项属于本机配置，可自行决定是否保留）

**Interfaces:**
- Consumes: 前 5 个任务的全部产出
- Produces: 可运行的构建产物

- [ ] **Step 1: 全量构建**

Run: `npm run build`
Expected: `tsc -p tsconfig.main.json` 通过，`vite build` 通过，无报错

- [ ] **Step 2: 配置 exe 路径**

在 `config.json` 的 `settings` 里加：

```json
"gameSaveHelperPath": "D:/AI/nsis/GameSaveHelper.exe"
```

- [ ] **Step 3: 手工验收（逐条打勾）**

Run: `npm run dev`

1. 右键任一**配了存档路径**的游戏 → 「备份存档」→ 工具窗口弹出并自动开始备份，桌面出现 `存档备份【游戏名】_时间戳.exe`；App **不**额外弹成功提示。
2. 退出一个配了存档路径的游戏 → 弹「是否备份存档？」→ 点「是」→ 同上。
3. 把 `gameSaveHelperPath` 改成不存在的路径 → 重新运行 → 点「备份存档」→ App 弹「存档备份工具不存在：…」，不崩溃。
4. 把 `gameSaveHelperPath` 清空 → 点「备份存档」→ App 弹「未配置存档备份工具路径（config.json → settings.gameSaveHelperPath）」。
5. 给某游戏配一条不存在的存档路径（再配一条存在的）→ 工具窗口应逐条列出跳过原因，存在的路径正常出包。
6. 启动 App → 网格封面正常显示；进设置点「重新扫描封面」→ 封面正常刷新（说明 `scan_covers` 仍工作，只是不再写库）。
7. 游戏详情页「应用存档」仍能列出并启动 `游戏存档` 目录下的 exe（走 `ipc/saves.ts`，未改动）。
8. 确认 `release/data/library/library.db` 的 `cover_image` 不再变化：记下某游戏的值 → 触发一次 `get_games`（重启 App）→ 值不变。

- [ ] **Step 4: 若第 3 步发现 exe 路径需要纳入版本管理**

`config.json` 是跟主程序走的本地配置（不进 git 亦可）。若希望团队统一路径，在 `docs/design/save-backup-tool.md` 的配置示例里保持该路径即可，不要新增自动探测逻辑（本计划明确不做）。

---

## Self-Review

**Spec coverage：**

| Spec 章节 | 对应任务 |
| --- | --- |
| 三、配置（新增字段 + 3 处类型 + 解析规则） | Task 1 |
| 四.1 参数拼装（方式一、不做预检过滤） | Task 2 + Task 3 |
| 四.2 进程启动（cwd/detached/unref、不等待） | Task 2 |
| 四.3 错误处理（4 类错误的返回与前端表现） | Task 2 + Task 3 + Task 4 |
| 五、封面改读时计算 | Task 5 |
| 六、影响面（新增/修改/删除清单） | Task 1-5 全覆盖 |
| 七、非目标 | 计划内不含 JSON 迁移、不含 `cover_image` 删列、不含 `ipc/saves.ts` 改动 |
| 八、验证 | Task 6 |

**与 spec 的一处偏离（已确认合理）：** spec 第六章写了"locales 新增错误文案"，本计划**不新增 i18n key**，改为沿用现有做法——主进程直接返回中文错误串（现有代码即如此，如 `"游戏不存在"`），前端优先显示 `res.error`、回退到已有的 `backup_failed_body`。理由：现有主进程错误全是中文硬编码，单为这一处引入错误码 + i18n 映射会形成两套错误处理风格。**spec 第六章那一行需要同步改成"不需要"。**

**类型一致性检查：** `launchSaveBackup(gameName, savePaths): { ok, error? }` 与 IPC 返回类型、`client.ts` 的 `call<{ ok: boolean; error?: string }>`、两个组件的 `res?.ok` / `res?.error` 判断一致；`applyCoversToLibrary(): { games, result }` 与两个 IPC 调用点的解构一致；`configuredPath` 的改名已覆盖 `paths.ts` 内部两处调用点。

**待清理（不属于本计划）：** `locales/*.json` 里 `backup_success_title` / `backup_success_body` 两个 key 在新流程下不再被引用；保留无害，如需清理请单独确认。
