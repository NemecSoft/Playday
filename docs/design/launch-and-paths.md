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
| **路径比较时** | 两侧必须过**同一个** `normalizePath()`。反例：`fs.realpathSync()` 返回原生 `\`，与 `/` 形式的封面目录比较会全部判不在（白名单失效 → 界面一片占位符） |

实现：`shared/launchPaths.ts` 的 `normalizePath` / `joinPaths` / `toCmdPath`（均有单测）。

## 1. 涉及的路径字段

| 字段 | 存的是什么 | 例子 |
| --- | --- | --- |
| `install_directory` | 安装目录，**按游戏根存相对路径** | `..\X\Sephiria` |
| `actions[].path` | 启动动作路径（可能含占位符） | `{InstallDir}\golan.bat` |
| `defaultGameRootPath`（config.json） | **游戏根**：所有相对路径的基准 | 生产 `X:\YunGame\Playnite` |

## 2. 三种解析基准（优先级从高到低）

| # | 原始 `path` 形态 | 基准 | 例（真实数据） | 单测 |
| --- | --- | --- | --- | --- |
| 1 | **相对路径**（不以 `{` 开头、也不是绝对路径） | **安装目录** | `TPC.exe`、`bin\Inversion.exe` | `规则1：…相对路径…` |
| 2 | `{游戏库名}\rest` | **库根**（`game_libraries` 表） | `{Gamelibrary1}\game1\g.exe` | `规则2：…{库名}…` |
| 3 | 其余相对结果 | **游戏根** `defaultGameRootPath` | 见 §3 | `规则3：…` |
| — | 绝对路径（`D:\…`、`\\server\…`） | 原样 | `X:\YunGame\Z\a.exe` | `绝对路径始终原样` |

> 第 1 条是 Playnite 语义：动作路径写 `TPC.exe` 指的是"游戏自己目录下的 TPC.exe"。
> 实测数据里 493 个动作只有文件名、32 个是 `bin\`/`win_x64\` 这类子目录 —— 都靠这条。

## 3. `{InstallDir}` 占位符

`{InstallDir}` 在**启动时**展开为 `game.installDirectory`（`electron/core/process.ts` 里
经 `expandVariables()`）。关键点：

- `install_directory` **本身是按游戏根存的相对路径**（如 `..\X\Sephiria`），
  所以展开 `{InstallDir}\golan.bat` 得到 `..\X\Sephiria\golan.bat`，
  它是"相对游戏根"的路径 → **走第 3 条基准**，不能再按安装目录拼一次。
- 游戏没配 `install_directory` 却又用到 `{InstallDir}` → 返回**明确错误**
  「该游戏未配置安装目录（install_directory 为空）」，
  而不是拼出一个不存在的怪路径再报含糊的"文件不存在"。
- 展开流程：`{库名}` / `{InstallDir}` 等占位符先展开 → 再按上表解析基准。

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
| 显示窗口（`showBatConsole=true`） | `cmd /d /s /c start "" /wait "<bat>"` —— `start` 会为目标进程新建控制台窗口（`CREATE_NEW_CONSOLE`），不受父进程控制台状态影响 |
| 设置入口 | 设置 → 通用 → 「运行 .bat/.cmd 指令时显示控制台窗口」（`showBatConsole`） |

> 顺带一条踩坑记录：显式调 `cmd.exe /c "<bat>"`（自己拼引号）在**路径含空格**时会被
> cmd 拆断，实测只有 `shell: true`（Node 负责引号）+ `start` 两种组合是稳的。

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

## 7. 数据里的约定与特殊用法

- **`added` 写成 2089 年 = 永久置顶**（有意为之，不是脏数据）：默认「添加时间倒序」
  会把它们排在最前，用来把重点游戏钉在顶部。
- 存档备份动作的路径形如 `..\Tools\GameSaveHelper\GameSaveHelper`（辅助动作，
  不参与启动选择）。

## 待确认

- 赛菲莉娅-网吧联机版的备份动作路径 `..\Tools\GameSaveHelper\GameSaveHelper`，
  按 §2 第 1 条（相对安装目录 `X:\YunGame\X\Sephiria`）上跳一级得到
  `X:\YunGame\X\Tools\GameSaveHelper\...`；而该游戏 `golan.bat` 里硬编码的是
  `X:\YunGame\Tools\nircmd\nircmd.exe`（即 `X:\YunGame\Tools\`）。
  两者是否本该指向同一层（数据里少写一层 `..`），待确认。
  单测 `规则1：…含 .. 上跳` 目前锁定的是"按既有规则算出来的结果"。
