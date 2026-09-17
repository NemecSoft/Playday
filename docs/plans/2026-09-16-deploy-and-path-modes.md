# 一键部署（测试版 / 正式版）+ 路径模式表重设计

> ⚠️ **实施完成（2026-09-17）—— 以 [release-build.md](../design/release-build.md) 为准**：
> 表最终收成 **dev / release 两种模式**（没有 `prerelease`，也没有 `release_test\` 中间站）：release 段就是
> 「测试目的地」的定义，正式机那份由 `promote.bat` 从测试目的地升格（改盘符 → 复制 → 校验 → 清走）。
> 因此下面正文里出现的 `prerelease`、`release_test`、`sourceLibraryDir`、`announcementsDir`、
> `gameSaveHelperPath`、`deploy-test.bat` / `deploy-release.bat` 都属于**被取代的中间稿**；
> 落地的入口是 `deploy.bat` 与 `promote.bat`，字段名以现在的 `path-modes.json` 为准。

> 需求原话（2026-09-16）：
> *"因为我们开发，要反复的发布新的版本，修改之后，要自动把程序和需要的附加资源比如 fonts、tools 下的所有吧，
> 直接复制到目的地。比如 gamesavehelper 是把 `tools\GameSaveHelper\release` 下的内容，自动复制到
> `D:\YunGame\PlayNite\tools\GameSaveHelper` 这个目录，并配置 config.json 中 `gameSaveHelperPath`。对吧？
> 这样才能正常运行。要实现的就是『一键部署测试版本』，一键部署正式版本。
> 我觉得，正式版本是，测试没问题，把测试版本的 config.json 全部 d: 修改为 x:，数据库中的所有 D: 也全部
> 修改为 X:，然后全体复制到正式环境上。"*

**Goal:** 两个双击入口 —— **一键部署测试版**（构建程序 + 按表搬附加资源 + 生成 `config.json` → 目的地
`D:\YunGame\PlayNite`，反复可跑）、**一键部署正式版**（取**已测过的那份** + 按 release 表重新生成 `config.json`
+ 库内 `D:`→`X:` → `X:\YunGame\PlayNite`；本机写不到 X 盘就落到**结构完全相同**的 `release\`，整份拷走即可）。

**Architecture:** 规则只写在 `path-modes.json` 一张表里，**值的写法直接带出"搬不搬"**：
`"路径"` = 就地用（不搬）；`["源","目标"]` = 部署时把源的内容搬到目标。纯逻辑（校验 + 运行时取值 + `copyPlan()`）
留在 `shared/pathModes.ts`（可单测，无 fs）；IO 在 `scripts/deploy.mjs`（幂等、只动自己写过的东西、每次打印清单）。

**Tech Stack:** Node 22（ESM；脚本读 `dist-electron/shared/pathModes.js` 编译产物，与现状一致）、sql.js（库内盘符迁移）、
cmd 批处理（双击入口）、robocopy（大目录搬运，沿用 `/MT:16` 与 0-7/≥8 退出码约定）。

## Global Constraints

- **表是唯一来源**：任何"从哪搬到哪"只能写在表里；脚本 / bat 里不许再出现目录常量（沿用架构守卫规则 11/12 的精神）。
- **只搬表里写成数组的项**；字符串 = 就地，一律不动。不这样就等于"整份复制"，会把音乐（`D:/KwDownload/song`，
  几十 GB）和详情（`D:/Addons`）也卷进去。
- **目的地是真目录，不是产物目录**：只删/写 `.playday-deploy.json`（部署清单）里属于我们的东西；
  `YunGameConfig\`、`Addons`、音乐目录、游戏安装目录**一律不碰**。绝不 `rmdir /s /q` 目的地。
- **目标根 = `defaultGameRootPath`**（正是"编译好的程序复制到哪里"）。它本机可写 → 直接部署进去；
  不可写（release 的 X 盘）→ 落 `--out`（默认 `release/`），**目录结构与目标根一模一样**。
- **`config.json` 一律按表重新生成，绝不做 `D:`→`X:` 字符串替换**（反例见 §四）。
- **库内盘符迁移默认 dry-run**：先打印"哪张表 / 哪列 / 前后值"，人确认后才写；只改**值以 `D:\` 或 `D:/` 开头**的，
  不碰描述文本；写前自动备份（沿用 `library.db.bak-<本地时间戳>`）。
- **正式机 GameSaveHelper 统一到 `<正式根>\tools\GameSaveHelper\`**（2026-09-16 用户确认），与测试同构。
- 客户端在跑时覆盖 `PlayniteUI.exe` 会失败 → 明确报错并提示先关客户端，不半途静默。
- **分隔符**：表与 `config.json` 一律写 `/`（JSON 里 `\` 要写成 `\\`，难写难读；规则见
  `docs/design/launch-and-paths.md` §0）。**凡是要交给 Windows 命令行工具"再解析一遍"的路径，必须经
  `shared/launchPaths.ts` 的 `toCmdPath()` 换回 `\`**：`robocopy` 的位置参数（`/` 开头会被当开关）、拼进
  `.bat` / PowerShell 脚本字符串的路径、交给 GameSaveHelper（它再把路径喂给 NSIS）的 `settings.json`。
  2026-09-16 用户实测：`msiexec /i "X:/YunGame/Tools/Redist/msxml4sp3.msi" /qn` 在 cmd 与 PowerShell 5.1 里
  都不认，换 `X:\…` 才装得上。
  判据不是"怎么调"，而是"**收参数的程序会不会把自己那条命令行再解析一遍**"：普通程序 argv 直传
  （`spawn(exe, args, {shell:false})` → CreateProcess 接受 `/`）没事；`msiexec` / WiX Burn / NSIS 会再解析一次，
  带 `/` 照样炸。拿不准就一律 `toCmdPath()`。
  库内盘符迁移（D:→X:）**保持原写法**：`/` 的仍写 `/`、`\` 的仍写 `\`（库里两种都有），只换盘符。
- 文档同步（`docs/design/release-build.md` 等）+ `npm run check` 必须全绿。

## 一、表的新语法

| 写法 | 部署时 | 运行时读 | 例子 |
| --- | --- | --- | --- |
| `"<路径>"` | **不搬** | 这个值 | `"D:/Addons"`、`"X:/YunGame/PlayNite/CoverImages"` |
| `["<源>", "<目标>"]` | 把**源的内容**并入**目标** | **目标** | `["tools/GameSaveHelper/release", "tools/GameSaveHelper"]` |

- **源**的相对路径基准 = 仓库根；**目标**的相对路径基准 = **目标根**（`defaultGameRootPath`），也可写绝对路径。
- 源是**文件**、目标是**目录** → 复制进目录（`sourceLibraryDir` 靠这条：运行时值仍是目录 `data/Admin`）。
- 源是**目录** → 内容并入目标（GameSaveHelper 靠这条：`release\` 里的 exe/settings.json/template/assets/nsis 全过去）。
- **运行时值 = 目标**（`resolveModeSettings` 只多这一层解引用，其余逻辑不变）。

## 二、两条一键入口

| 入口 | 干什么 | 落点 |
| --- | --- | --- |
| **`deploy-test.bat`** | ① 构建程序 → ② 按表搬附加资源 → ③ 生成 `config.json` → ④ 写部署清单 | `D:\YunGame\PlayNite`（真部署、幂等、反复跑） |
| **`deploy-release.bat`** | ① 取**测试目的地**那份 → ② 按 release 表重新生成 `config.json` → ③ 库内 `D:`→`X:` → ④ 按清单搬 | `X:\YunGame\PlayNite`；本机不可写 → `release\`（结构同 X 盘） |

`release\` **不是中间站**，是"X 盘在开发机上不存在时的等价落点"：两处结构永远一致，拷过去即可。

## 三、新表（三个模式的完整取值）

**dev —— 全字符串（就地，不部署）**

```jsonc
"dev": {
  "coverImagesDir":   "D:/YunGame/PlayNite/CoverImages",
  "gameDetailsDir":   "D:/Addons",
  "musicDir":         "D:/KwDownload/song",
  "fontsDir":         "fonts",
  "libraryDir":       "dev-data",
  "sourceLibraryDir": "dev-data/Admin",
  "announcementsDir": "dev-data/announcements",
  "defaultGameRootPath": "D:/YunGame/PlayNite",
  "runtimeDir":       "tools/runtime",
  "yungamestartDir":  "tools/yungamestart",
  "gameSaveHelperPath": "tools/GameSaveHelper/release/GameSaveHelper.exe",
  "yunGameUserListPath":     "D:/YunGame/PlayNite/YunGameConfig/YunGame_UserList.json",
  "yunGameServerStatusPath": "D:/YunGame/PlayNite/YunGameConfig/YunGame_ServerStatus.json"
}
```

**prerelease —— 该搬的写成数组（目的地 `D:/YunGame/PlayNite`）**

```jsonc
"prerelease": {
  "coverImagesDir":   ["CoverImages", "CoverImages"],
  "gameDetailsDir":   "D:/Addons",                  // 就地：本来就在 D 盘
  "musicDir":         "D:/KwDownload/song",         // 就地：几十 GB，绝不搬
  "fontsDir":         ["fonts", "fonts"],
  "libraryDir":       "data",                       // 位置；数据由下面两行搬
  "sourceLibraryDir": ["dev-data/Admin/library.db", "data/Admin"],
  "announcementsDir": ["dev-data/announcements", "data/announcements"],
  "defaultGameRootPath": "D:/YunGame/PlayNite",     // ← 目标根
  "runtimeDir":       ["tools/runtime", "runtime"],
  "yungamestartDir":  ["tools/yungamestart/dist", "yungamestart"],
  "gameSaveHelperPath": ["tools/GameSaveHelper/release", "tools/GameSaveHelper"],
  "yunGameUserListPath":     "YunGameConfig/YunGame_UserList.json",      // 运维文件，不搬
  "yunGameServerStatusPath": "YunGameConfig/YunGame_ServerStatus.json"
}
```

**release —— 同构，只有盘符与"哪些就地"不同（目的地 `X:/YunGame/PlayNite`）**

```jsonc
"release": {
  "coverImagesDir":   "X:/YunGame/PlayNite/CoverImages",   // 正式机既有数据，就地（不搬）
  "gameDetailsDir":   "X:/Addons",
  "musicDir":         "X:/Addons/song",                    // ⚠️ 不是 D 盘的目录名（见 §四）
  "fontsDir":         ["fonts", "fonts"],
  "libraryDir":       "data",
  "sourceLibraryDir": ["dev-data/Admin/library.db", "data/Admin"],
  "announcementsDir": ["dev-data/announcements", "data/announcements"],
  "defaultGameRootPath": "X:/YunGame/PlayNite",
  "runtimeDir":       ["tools/runtime", "runtime"],
  "yungamestartDir":  ["tools/yungamestart/dist", "yungamestart"],
  "gameSaveHelperPath": ["tools/GameSaveHelper/release", "tools/GameSaveHelper"],
  "yunGameUserListPath":     "X:/YunGame/PlayNite/YunGameConfig/YunGame_UserList.json",
  "yunGameServerStatusPath": "X:/YunGame/PlayNite/YunGameConfig/YunGame_ServerStatus.json"
}
```

**盘符校验要改**：数组只看**目标**（源是本机仓库路径，不受盘符约束）；目标可相对（`data/Admin`）也可绝对（`D:/…`）。

## 四、⚠️ "把 config.json 里的 D: 改成 X:"不成立的三处反例

| 字段 | 测试 | 正式 | 为什么字符串替换会错 |
| --- | --- | --- | --- |
| `musicDir` | `D:/KwDownload/song` | `X:/Addons/song` | **目录名都不同**，替换后得到 `X:/KwDownload/song`（不存在） |
| `gameSaveHelperPath` | `<根>/tools/GameSaveHelper/…` | 现状是 `X:/YunGame/Tools/GameSaveHelper/…` | 结构不同（`PlayNite\tools` vs `YunGame\Tools`）→ 本次**统一**成前者（见 §六.1） |
| `coverImagesDir` | 从仓库搬 | `X:/YunGame/PlayNite/CoverImages`（**就地**） | 正式机那份是既有数据，不该被 D 盘那份覆盖 |

结论：正式步 = **按 release 表重新解析** + 库内盘符迁移，不是替换测试的 config.json。

## 五、部署算法（`scripts/deploy.mjs`）

```
计划 = copyPlan(表, mode)            // 纯函数：每条 { src, dst, 说明 }
目标根 = 表[mode].defaultGameRootPath
if 目标根 本机不可写: 目标根 = --out（默认 release/）

① 打印：模式、目的地根、搬运清单、将要覆盖/删除什么（--dry-run 到此为止）
② 读上一次的 .playday-deploy.json → 删除它列出的旧文件（防"上一版残留的 dll 跟着走"）
③ 逐条搬：目录用 robocopy /E /MT:16（退出码 ≥8 报错）；单文件用 fs.copyFileSync
④ 写 <目标根>/config.json（resolveModeSettings 的结果，CRLF）
⑤ 写新的 .playday-deploy.json（本次写了哪些顶层项）
```

**正式升格** = 同一套算法，但：源换成**测试目的地**（`<测试根>/<同一相对目标>`，因为两边结构同构），
`config.json` 用 **release 表**生成，库走盘符迁移。

## 六、已知坑 / 待确认（实现时必须处理）

1. **GameSaveHelper 的位置有三个口径**，本次统一到 `<根>\tools\GameSaveHelper\`：
   - `config.json` 的 `gameSaveHelperPath`（正式现状 `X:/YunGame/Tools/…`）
   - 它自己的 `release\settings.json` 里 `gamesJson` / `coverDir`（**也都是 D 盘路径**，升格时要一起换）
   - 游戏数据里的动作路径：`docs/design/launch-and-paths.md` §待确认 记着 `..\Tools\GameSaveHelper\…` 与
     `X:\YunGame\Tools\nircmd\…` 的口径不一致 → **实现前先扫库**（`actions` / `play_task` / `other_tasks` 里含
     `GameSaveHelper` 或 `Tools\` 的值有多少处、指向哪），否则"配置指对了、游戏里点备份还是老路径"。
2. **`nircmd` 不搬**：游戏自己的 bat 里硬编码 `X:\YunGame\Tools\nircmd\nircmdc.exe`（`CoverImages/golan.bat` 等），
   搬走会坏游戏启动。它不在表里（app 不读它），保持由运维放在 `X:\YunGame\Tools\nircmd\`。
3. **`cover-optimizer` 不搬**：开发期优化封面用的工具，运行期不需要。
4. **dev 的 `gameSaveHelperPath` 现状指向 `tools/GameSaveHelper/GameSaveHelper.exe`（该文件不存在**，
   真实产物在 `release\` 下）→ 顺手修正为 `release\GameSaveHelper.exe`。
5. **`defaultGameRootPath` 拼写混用**：`Playnite` / `PlayNite`（Windows 不区分大小写，同一个目录，但人看像两个）
   → 统一写成 `PlayNite`。
6. **正式机上要挪一次**：`X:\YunGame\Tools\GameSaveHelper\` → `X:\YunGame\PlayNite\tools\GameSaveHelper\`
   （`X:\YunGame\Tools\nircmd\` 不动）。

## Tasks

### Task 1: 表语法（`shared/pathModes.ts` + 单测）

- [ ] 值类型 `string | [string, string]`；`readModeTable` 校验（数组长度=2、两项非空、目标不许越出目标根、
      盘符只校验目标）；`resolveModeSettings` 取"运行时值"（数组取目标）；新增纯函数 `copyPlan(table, mode)`
- [ ] 单测：数组语法、就地 vs 搬运、相对/绝对目标解析、盘符反例、`copyPlan` 清单与顺序
- [ ] 现有表（全字符串）仍然合法 → 保证这一步单独落地时 `npm run check` 全绿

### Task 2: 按新语法重写 `path-modes.json`（§三 三个模式）

### Task 3: `scripts/deploy.mjs`（部署算法 §五，含 `--dry-run`、清单、robocopy）

路径交给 robocopy / 写进给外部工具读的文件前，一律经 `toCmdPath()`（见 Global Constraints 的"分隔符"）。

### Task 4: 双击入口 `deploy-test.bat` / `deploy-release.bat`（替换 `build-prerelease.bat` / `build-release.bat`，
撤销 `release_test`；`package.bat` 改成"只构建到 `.pack-tmp`"，搬运交给 deploy）

### Task 5: 正式升格（源=测试目的地 + release 表生成 config + 按清单搬）

### Task 6: 库盘符迁移脚本（默认 dry-run、只改盘符开头的值、先出清单、写前备份）

### Task 7: 文档同步（`release-build.md` 重写、`directory-structure.md`、`PROJECT-MEMORY.md`、`ARCHITECTURE.md`、
`electron-builder.yml`/`package.bat` 注释）+ `npm run check` 全绿
