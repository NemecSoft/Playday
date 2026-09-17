# 启动与路径规则（权威说明）

> **本文是路径/启动规则的唯一权威说明。**
> 代码实现是 `shared/launchPaths.ts`（零依赖纯函数，不 import electron/fs），
> 每条规则都有对应单测 `shared/launchPaths.test.ts` —— `npm test` 会跑，
> `npm run check` 会同时跑测试和文档校验（`scripts/check-docs.mjs`）。
> **改规则必须同时改本文与单测。**
>
> 为什么必须这么较真：这条链路上出过一串"能编译、能发布、但悄悄错"的问题 ——
> `{InstallDir}` 展开规则只写在迁移工具 README 里而代码从未实现（755 个游戏启动全坏）、
> Windows 上直接 spawn `.bat` 抛 `EINVAL`、启动失败原因被前端吞掉、
> 关掉 bat 控制台被判成游戏退出。它们都不是"能力不足"，而是"没人守规则"。

## 0. 分隔符约定：统一用 `/`

| 项 | 规则 |
| --- | --- |
| **输出的规范形式** | 一律 `/`：`D:/YunGame/X/y.bat`、`//NAS/Games/x.exe` |
| **输入接受范围** | `\` 与 `/` 都收。库里现存的 `bin\Inversion.exe` 这类写法**不需要迁移** |
| **写 config.json** | 推荐 `/`：JSON 里 `\` 必须写成 `\\`（难写、难读）；网络路径直接写 `//NAS/share/...` |
| **交给 cmd.exe 时** | 用 `toCmdPath()` 换回 `\` —— cmd 会把以 `/` 开头的 token 当开关，`//NAS/share/x.bat` 直接传会被判成非法开关 |
| **交给其它命令行工具时** | **同一个 `toCmdPath()`，同样必须 `\`**：`robocopy` 的位置参数（`/` 开头会被当开关）、`msiexec /i <包>`、拼进 PowerShell `-Command` 的脚本字符串、以及交给 NSIS / 存档工具 `settings.json` 的路径。**2026-09-16 实测定下**：`msiexec /i "X:/YunGame/Tools/Redist/msxml4sp3.msi" /qn` 在 cmd 与 Windows PowerShell 5.1 里**都不认**，换成 `X:\YunGame\…` 才装得上。<br>⚠️ 判据不是"怎么调"，而是"**收参数的那个程序会不会把自己那条命令行再解析一遍**"：普通程序 argv 直传（`spawn(exe, argv, { shell: false })`）时 `/` 没事（CreateProcess 接受 `/`）；但 `msiexec`、WiX Burn 安装器、NSIS **会再解析一次** —— 哪怕 argv 直传、路径带 `/` 照样炸（2026-09-16 用户在 cmd 与 Windows PowerShell 5.1 里各试一次，**两边都失败** —— 两个 shell 唯一的共同环节就是 msiexec，足见是它自己的解析器，不是 shell）。拿不准就一律 `toCmdPath()`。 |
| **路径比较时** | 两侧必须过**同一个** `normalizePath()`。反例：`fs.realpathSync()` 返回原生 `\`，与 `/` 形式的封面目录比较会全部判不在（白名单失效 → 界面一片占位符） |

实现：`shared/launchPaths.ts` 的 `normalizePath` / `joinPaths` / `toCmdPath`（均有单测）。
使用点：`electron/core/process.ts`（用 cmd 启动 `.bat`）；另外**部署脚本**在调 robocopy（位置参数）与生成给外部工具读的路径时也必须过它
（一键部署的设计见 [部署与路径模式表计划](../plans/2026-09-16-deploy-and-path-modes.md)）。

## 1. 涉及的路径字段

| 字段 | 存的是什么 | 例子 |
| --- | --- | --- |
| `install_directory` | 安装目录，**按游戏根存相对路径** | `..\X\Sephiria` |
| `actions[].path` | 启动动作路径（可能含占位符） | `{InstallDir}\golan.bat` |
| `defaultGameRootPath`（config.json） | **游戏根**：所有相对路径的基准 | 生产 `X:\YunGame\Playnite` |

## 2. 解析基准（优先级从高到低）

| # | 原始 `path` 形态 | 基准 | 例（真实数据） | 单测 |
| --- | --- | --- | --- | --- |
| 1 | **相对路径**（不以 `{` 开头、也不是绝对路径） | **安装目录** | `TPC.exe`、`bin\Inversion.exe` | `规则1：…相对路径…` |
| 2 | 其余相对结果 | **游戏根** `defaultGameRootPath` | 见 §3 | `规则2：…` |
| — | 绝对路径（`D:\…`、`\\server\…`） | 原样 | `X:\YunGame\Z\a.exe` | `绝对路径始终原样` |

> 第 1 条是 Playnite 语义：动作路径写 `TPC.exe` 指的是"游戏自己目录下的 TPC.exe"。
> 实测数据里 493 个动作只有文件名、32 个是 `bin\`/`win_x64\` 这类子目录 —— 都靠这条。

> ⚠️ **库占位符（`{Gamelibrary1}\rest` → 库根）已废弃**（2026-09-16，`game_libraries` 整套移除）。
> 实测库里 0 条路径用它。现在遇到 `{库名}` 开头的路径会**明确报错**
> 「路径里的库占位符已废弃」，不再解析 —— 详见 [data-models.md](./data-models.md) 的「游戏路径规范」。

## 3. `{InstallDir}` 占位符

`{InstallDir}` 在**启动时**展开为 `game.installDirectory`（`electron/core/process.ts` 里
经 `expandVariables()`）。关键点：

- `install_directory` **本身是按游戏根存的相对路径**（如 `..\X\Sephiria`），
  所以展开 `{InstallDir}\golan.bat` 得到 `..\X\Sephiria\golan.bat`，
  它是"相对游戏根"的路径 → **走第 2 条基准**，不能再按安装目录拼一次。
- 游戏没配 `install_directory` 却又用到 `{InstallDir}` → 返回**明确错误**
  「该游戏未配置安装目录（install_directory 为空）」，
  而不是拼出一个不存在的怪路径再报含糊的"文件不存在"。
- 展开流程：`{InstallDir}` / `{GameName}` 等占位符先展开 → 再按上表解析基准。
  （脚本里可用的占位符与启动动作共用一套，见 `electron/core/scriptRunner.ts` 的 `expandVariables`；
  `{LibraryName}` 已随 game_libraries 一起移除。）

## 4. 游玩指令 vs 辅助动作

- 只有 `actions[].isPlayAction === true` 且 `path` 非空的动作进**候选列表**。
  存档备份之类的辅助动作虽然也是 `File` 类型，但不参与启动选择
  （实测 1276 个游戏里有 1245 个曾因把它们算进候选而误弹选择窗）。
- 候选 0 个 → 走「无动作」分支：在安装目录里自动找 exe（`findGameExecutable`）。
- 候选 1 个 → **直接启动它**（显式把该动作 id 传给主进程，不依赖 `play_task` 兜底）。
- 候选 >1 个 → 弹窗让用户选（当前数据里只有 18 个游戏属于这种情况）。

## 5. `.bat` / `.cmd` 的启动（Windows）

实测数据里 417/1280 个游玩指令是 `.bat`（`golan.bat` 283 个、`go.bat` 116 个），
它们是网吧的**菜单式启动器**（选单人/联机/主机/客机），必须让人看到窗口。

| 主题 | 规则 |
| --- | --- |
| 能否直接 spawn | **不能**。Windows 的 CreateProcess 不认脚本文件，Node 会抛 `EINVAL`。必须经 `cmd.exe` 执行。 |
| 隐藏执行（`showBatConsole=false`） | `spawn('"<bat>"', args, { shell: true, windowsHide: true })` |
| 显示窗口（`showBatConsole=true`） | `cmd /d /s /c start "" /wait "<comspec>" /c "<bat>"` —— `start` 会为目标进程新建控制台窗口（`CREATE_NEW_CONSOLE`），不受父进程控制台状态影响；**`start` 里必须再套一层 `cmd /c`**（理由见下一条）
| 设置入口（全局默认） | 设置 → 通用 → 「运行 .bat/.cmd 指令时显示控制台窗口」（config.json 的 `showBatConsole`） |
| **逐游戏覆盖**（2026-09-15 加） | 库列 `games.show_bat_console` / 内容表字段 `batconsole`（**无界面**，按需配例外的那几个）。**三态**：`NULL` = 跟随全局设置、`0` = 强制隐藏、`1` = 强制显示。归并只在一处（`launchGame` 入口），规则在 `shared/launchPaths.ts` 的 `resolveShowBatConsole` |

**逐游戏覆盖的两个坑（都是静默失效 —— 改之前先看 `shared/launchPaths.ts` 那段注释）**：

1. **归并必须用 `??` 不能用 `||`**：写成 `game || global` 时，逐游戏的 `false`（强制隐藏）会被
   当成"没配"回落到全局值 —— 这个配置**永远不生效**；
2. **库里的 NULL 必须映射成"未配置"**，不能写成 `!!行值`：`!!null` 得 `false`，等于给所有游戏
   强写"总是隐藏"，全局开关就此变成**死设置**。

两条都有反向断言钉住（`shared/launchPaths.test.ts` 的「逐游戏显示控制台的归并」）。

> 顺带一条踩坑记录：显式调 `cmd.exe /c "<bat>"`（自己拼引号）在**路径含空格**时会被
> cmd 拆断，实测只有 `shell: true`（Node 负责引号）+ `start` 两种组合是稳的。

**`start` 里为什么还要再套一层 `cmd /c`（2026-09-14 修的，用户报"退出游戏后窗口不关"）**：

`start` 对 `.bat` 是用 **`cmd /K`** 跑的 —— 真机探针抓到常驻进程
`cmd.exe /K <bat>`。后果有两个，都不是"看着别扭"而是功能故障：

1. 脚本结束后那个 shell 不退 → 控制台窗口卡在 `D:\...>` 提示符上（就是用户截图那个状态）；
2. 外层 `/wait` **永远不返回** → §6 里"脚本退出 = 计时结束"不再成立，只能靠 exe 轮询兜底。

显式写 `cmd /c` 后实测（真 Electron 引擎 + GUI 父进程 + 脚本固定跑 5 秒）：

| | 脚本跑完 | 外层 cmd 退出 | 结束后残留 |
| --- | --- | --- | --- |
| 旧写法 `start "" /wait "<bat>"` | 7.5s | **永不退出** | **2 个（`/K` shell + 外层）** |
| 现写法 `start "" /wait "<comspec>" /c "<bat>"` | 5s | 5.2s（= 脚本结束） | **0 个** |

含空格路径、带参数（bat 里 `%*` 拿到传参）也一并实测通过。
参数表由 `shared/launchPaths.ts` 的 `batConsoleArgs()` 生成，单测
`shared/launchPaths.test.ts` 钉住形状（含"不许退回旧写法"的反向断言）。

## 6. 计时（进程监控）

用 bat 启动时，`cmd.exe` 只是"启动器"，游戏是它拉起的另一个进程 —— 只监听启动器退出，
玩家关掉控制台就会被误判成游戏退出（计时中断）。规则：

```
游戏在运行  =  启动器进程还活着
            或 安装目录下任一 .exe 对应的进程在跑（Playnite MonitorProcessNames 语义）
两者都不成立才结算
```

- 实现：`electron/core/process.ts` 的 `startCombinedPolling`，每 3 秒用一次
  `tasklist /fo csv /nh` 取全部进程名比对（不需要提权、不需要 WMI）。
- 进程名单来自安装目录下递归枚举的 `*.exe`（按目录缓存）。
- 逐游戏覆盖：`monitor_exe` 字段（`进程名|窗口标题关键字`）优先于上面的自动判定。
- 查询失败时**保守当作"还在运行"**，宁可多算也不误判退出。
- ⚠️ 前提：§5 那条命令行必须让"脚本结束 = 启动器结束"成立。`start` 用 `cmd /K` 跑脚本的
  问题（2026-09-14 修）会同时破坏这一点 —— 外层 `/wait` 永不返回，计时只能靠 exe 轮询兜住。

## 7. 数据里的约定与特殊用法

- **`added` 写成 2089 年 = 永久置顶**（有意为之，不是脏数据）：默认「添加时间倒序」
  会把它们排在最前，用来把重点游戏钉在顶部。
- 存档备份动作的路径形如 `..\Tools\GameSaveHelper\GameSaveHelper`（辅助动作，
  不参与启动选择）。

## 8. 自检模式：`exe --check`（不起 GUI，服务器上可跑）

用途：**上线前 / 运维巡检**，一次跑完全库，回答两个问题：

1. 每个游戏 `action` 指定的启动项，在这台机器上是否**存在**；
2. 每个游戏的 `savePaths` 是否**存在**。

只写日志、**不创建任何窗口**（服务器、无人值守环境可能根本跑不了图形界面）。

```bat
REM 正式机上（在 exe 所在目录执行）
REM exe 名 = build.config.ts 的 CLIENT_EXE_NAME（现名 PlayniteUI，命令行里要写全 .exe）
PlayniteUI.exe --check
```

> 开发机自测：`npx electron . --check`（跑的是 `dist-electron` 编译产物）。

输出（**以日志文件为准**：打包后的 exe 是 GUI 子系统程序，直接跑时 stdout 可能看不到）：

| 文件 | 说明 |
| --- | --- |
| `<数据根>\logs\check-<时间戳>.log` | 留档 |
| `<数据根>\logs\check-latest.log` | 最新一次，固定路径（脚本/运维直接取这个） |

退出码：`0` = 没问题；`1` = 发现问题；`2` = 自检本身失败（读不到库等）。

## 9. 路径报告：`exe -log`（照常进界面，多写一份"实际全路径"日志）

用途：**排查"测试机能跑、正式机不跑"**。config.json 里的路径是**故意写成相对值**的
（`data`、`runtime`、`tools/GameSaveHelper/GameSaveHelper.exe`，见 [路径模式与部署](./release-build.md)），
真正落在哪个盘、哪个目录，取决于 exe 在哪、数据根在哪 —— 那正是这类故障的现场证据。

```bat
PlayniteUI.exe -log
```

与 `--check` 的分工（两个参数互不影响）：`--check` 是**独立模式**（跑完就退、不起界面），
`-log` **只是多写一份日志、照常进界面** —— 它要回答的是"真的跑起来时，各个目录落在哪"。

输出（同样**以日志文件为准**）：

| 文件 | 说明 |
| --- | --- |
| `<数据根>\logs\paths-<时间戳>.log` | 留档 |
| `<数据根>\logs\paths-latest.log` | 最新一次，固定路径（就拿它与另一台机器 diff） |

内容 = 头部（时间 / 版本 / 打包态 / 进程 / 应用目录 / 数据根 / 配置文件 / 资源目录）+ **每个路径字段两行**：

```
  runtimeDir
    原值  ：runtime
    实际  ：X:\YunGame\Playnite\runtime  [缺失]
```

「原值」照抄 config.json —— 一眼看出配置里写的是相对还是绝对；「实际」是**生产解析函数**算出来的
全路径（报告不自己算 PATH，否则会与运行时脱节），后面标 `[存在]` / `[缺失]`。未配置的字段写"（未配置）"，
**不冒充"缺失"**（没配 ≠ 缺文件）。另有"派生路径"一段：权威库、运行时副本、公告文件、随包前端资源、日志目录
—— 这些配置里不写、但要真出事最先出问题的路径。

**怎么用**：测试机与正式机各带 `-log` 启动一次，把两份 `paths-latest.log` 并排 diff ——
字段顺序固定（同一份代码），「原值」多半相同（都由同一张表生成），「实际」会随盘符 / 应用目录变化；
再看 `[缺失]`：缺失项 = 这个功能在这台机器上**静默失效**。

### 开发态怎么看

`dev-client.bat` **已经带 `-log`**（不用记参数），报告落在 `<仓库>\dev-data\logs\paths-latest.log`。
开发态的"数据根"由 `path-modes.json` 的 dev 段决定，而 `dev-client.bat` 会先 `call data-dir.bat` 设好
`YUNGAME_DATA_DIR` —— 所以报告读到的与你实际跑的是同一处。

⚠️ **直接 `npx electron . -log`（不带环境变量）会看错地方**：`configRoot()` 在开发态会回退到**工程根**
（`electron/core/paths.ts`），于是报告与日志落到 `<仓库>\logs\`，运行时副本也建到 `<仓库>\library\`。
想看"真正的开发态路径"就用 `dev-client.bat`，或自己先设 `YUNGAME_DATA_DIR`。
另：跑的是 `dist-electron` 编译产物，改了 `electron/**` 或 `shared/**` 要先 `npm run build`
（`dev-client.bat` 每次启动都会替你编译一遍）。

> 报告里的路径**按实际值原样显示**：绝对路径保持 config.json 里的写法（`D:/…`），
> 相对路径解析后是 `/` 还是 `\` 取决于那个字段的解析器；看着不统一是正常的 ——
> 两台机器上同一个字段的写法一致，所以不碍 diff。

判据**不是另写一份**，而是复用真实启动链路的函数：动作选择 `process.resolveAction`、
路径解析 `shared/launchPaths.ts` 的 `resolveActionPath`、存在性/可执行校验 `process.validateLaunchPath`、
自动找 exe `process.findGameExecutable`；存档路径也与备份链路一致（只做 `resolvePath`，
**不额外展开** `{InstallDir}`）—— 自检要回答的是"用户点下去会不会成功"，不是"理想情况"。
把整个库跑一遍不建窗口的代价：不需要 Chromium 窗口栈，`app.whenReady()` 之前就发起、跑完 `app.exit()`。

规则层单测：`electron/core/launchCheck.test.ts`（含 `{InstallDir}` 未配、
`*.*` 要匹配无扩展名文件这类真实踩过的坑）。

两类发现的读法：

- **启动项问题** = 这个游戏在这台机器上点"开始游戏"会失败（路径/配置问题，必须处理）。
- **存档路径「无匹配文件」** 多数是"这个游戏还没人玩过"（存档目录本来就还没生成），不一定是配置错；
  但「目录不存在」若**整片**出现，多半是盘符 / 游戏库路径配错了。

> ⚠️ 跑在**没装游戏**的机器上（典型：开发机）会得到满屏"不存在" —— 那是正常的，
> 它要跑在目标机器上才有意义。参考：开发机 1277 个游戏里 1275 个报启动项问题（库里指向 D 盘，
> 而这台开发机并没有那些目录）。

## 待确认

- 赛菲莉娅-网吧联机版的备份动作路径 `..\Tools\GameSaveHelper\GameSaveHelper`，
  按 §2 第 1 条（相对安装目录 `X:\YunGame\X\Sephiria`）上跳一级得到
  `X:\YunGame\X\Tools\GameSaveHelper\...`；而该游戏 `golan.bat` 里硬编码的是
  `X:\YunGame\Tools\nircmd\nircmd.exe`（即 `X:\YunGame\Tools\`）。
  两者是否本该指向同一层（数据里少写一层 `..`），待确认。
  单测 `规则1：…含 .. 上跳` 目前锁定的是"按既有规则算出来的结果"。
