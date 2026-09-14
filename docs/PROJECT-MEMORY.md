# 项目记忆（换机器 / 重装系统 / 新会话的交接文档）

> **这份文件是干什么的**：把"项目上下文"从某台机器、某次对话里**搬进仓库**，纳入版本控制。
> 重装系统、换电脑、新开的 AI 会话，读完它 + `ARCHITECTURE.md` 就能接上。
>
> 与 `ARCHITECTURE.md` 的分工：那里讲**架构怎么做**（一套前端、两种后端、传输层怎么切）；
> 这里讲**上下文**——东西放哪、约定是什么、踩过哪些坑、哪些事不能反着做、用户要什么。
>
> 为什么不放在本机记忆库：本机记忆库（`~/.codebuddy/memery/`）重装即失。曾经的真实情况是——
> 那里存着一份 2026-07 的跨项目用户档案，**关于本项目一条都没有**，项目知识全在 `docs/` 里。
> 所以规矩定为：**项目记忆一律写进仓库**。

---

## 一、这个项目是什么

- **云游游戏库管理器**（内部名 Playday / YunGame）：Electron + React 18 + TypeScript + Vite，
  `src/` 一套前端源码同时支撑**桌面端（Electron IPC）**与**网站端（HTTP）**，数据单一来源。
  架构细节见 `ARCHITECTURE.md`。
- **使用场景是网吧**（正式机 + 测试机），不是单机自用工具。这条决定了很多取舍：
  要能整包拷贝部署、运维不装环境、多台机器行为必须一致、失败要静默兜住而不是弹窗。
- 游戏库规模参考：约 1369 个游戏、1373 张封面（合计约 448 MB，其中 15% 是超大 PNG）。

## 二、东西都放在哪（最容易搞错的地方）

| 位置 | 是什么 |
| --- | --- |
| `d:\AI\Code\Playnite\Playday` | 本机（开发机）源码 |
| `D:\YunGame\PlayNite` | 测试机的数据源（游戏库 / 封面 / 详情页 / 公告） |
| `X:\YunGame\Playnite` | 正式机（网吧）的应用目录 |
| `path-modes.json` | **所有路径的唯一来源**：dev / prerelease / release 三套值，出包时写进 `config.json` |
| `config.json` | 运行时配置（由上面那张表生成，不手工改；`npm run check` 会校验一致） |
| `docs/design/` | 设计文档主体（每个功能一篇，改动要同步） |
| `dev-data/` | 开发态数据根（`npm run dev` 用） |

## 三、硬约定（每条都是踩过坑才写下的）

1. **提交门槛**：`npm run check`（两端类型检查 + 全量单测 + 架构/i18n/文档/字号四个守卫）必须全绿。
2. **路径不许写死在代码里**：一律走 `path-modes.json` → `config.json`，有守卫拦着。
   —— 包括"程序自带资源放哪"这类（运行库、自启工具）也要显式配，别用隐式默认值。
3. **结论要落进 `docs/design/*.md`**：不要只留在对话里、也不要只留在代码注释里。
   本文件存在的唯一原因就是这个。
4. **调 Windows 系统模块的 PowerShell 必须用绝对路径**：
   `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`。
   PATH 上的 `powershell` 在这台机器上是 PowerShell 7.6.5，它加载不了 `Appx` 模块
   （实测 `Operation is not supported on this platform. (0x80131539)`）。
5. **别给 PowerShell 加 `-WindowStyle Hidden`**：本机实测会让它以 `-1` 退出、stdout/stderr 全空
   （窗口是外层 `spawn` 的 `windowsHide` 关的）。表现是"检测结果永远为空"，极难联想。
6. **别用 `requestIdleCallback(run, { timeout: N })` 做延迟优化**：它不是"稍后做"，是
   "**最多等 N 毫秒**"——主线程一忙就是 N。用在几毫秒的活上等于白送几百毫秒到几秒延迟
   （"封面要 3 秒才出来"就是这么来的，实测见 `docs/design/cover-images.md`）。
   要让路就用确定的、可恢复的挂起（`suspendImageLoading` 那类）。
7. **读取不变式**：同一张图 / 同一个文件，同一时刻只有一条读取在飞。跨"单图 / 批量"两条路也要成立
   （预载曾经同一张图读两遍）。
8. **不要未经许可删文件**（用户明确要求）。
9. **第三方二进制随包发**（`tools/nircmd`、VC 运行库、GameSaveHelper 的 NSIS）：
   注意代码签名范围与许可，别让打包器给微软原版安装包再签一次名。

## 四、要查什么去哪里

| 想查 | 看 |
| --- | --- |
| 双端架构、传输层、命令名约定 | `ARCHITECTURE.md` |
| 目录结构总览 | `docs/design/directory-structure.md` |
| 启动链路与各类路径 | `docs/design/launch-and-paths.md` |
| 出包流程与三种模式（盘符差异） | `docs/design/release-build.md` |
| 封面加载、性能、缓存 | `docs/design/cover-images.md` |
| 运行库静默检测安装 | `docs/design/runtime-deps.md` |
| 开机自启小工具 | `docs/design/yungamestart.md` |
| 存档备份工具 | `docs/design/save-backup-tool.md` |
| 用户等级（黄金/钻石版）判定 | `docs/design/user-level-detection.md` |
| 主题与配色体系 | `docs/design/themes-styles.md` |
| GPU 加速相关 | `docs/design/gpu-acceleration.md` |

## 五、用户要什么（沟通与交付）

- **中文**沟通，请求简洁直接，但**解释要详尽且带"为什么"**——只给结论会被追问。
- 代码注释要写**环境背景与约定**（为什么这里必须这么写、反着写会出什么事），不是复述代码在做什么。
- 偏好**实测数字**胜过推测：给结论时带上量化证据（"一屏 30 张 133ms → 79ms"这种）。
- 决策快，常说"一手改掉"；此时直接改，不要反复确认。
- 交付偏好**结构化**（表格 / 清单 / 对照），并给出可执行的下一步。
- 强烈反对未经许可删文件。
- 想"让我记住"某事时，落点应当是仓库文档（本文件的"怎么往里写"）。

## 六、最近一次交接（2026-09-14，这部分会过时，看 git 状态为准）

- **已落地并验证**：运行库静默检测安装（VC++ x64/x86 + VP9 扩展，真机跑通）；
  `runtimeDir` / `yungamestartDir` 进配置链；封面传输改裸字节 + 并发 6 + 队列后进先出；
  去掉两层 `requestIdleCallback` 延迟（用户回报"现在就很快啦"）；预载重复读修掉。
- **未做**：封面瘦身工具（`optimize-covers.bat` / `scripts/optimize-covers.ps1`）还没在真实库上跑
  —— 库里 15% 是超大 PNG（单张空解码 463ms），这是下一个还能明显提速的杠杆。
- **仓库卫生**：有 3 个垃圾文件（`0`、`as2err.txt`、`{http.get(url`）曾被误提交、删除动作未提交；
  根目录还留着一个临时探针 `_img-perf.js`。
- **注意**：本文件写下的那一刻，工作区有 38 条未提交改动 —— 没提交 = 重装会丢。

## 七、怎么往里写（以后的记忆都写这里）

- **功能/设计层面的结论** → 写成 `docs/design/<功能名>.md`（会被文档守卫校验路径与相对链接）。
- **会话级、跨领域的上下文**（约定、坑、用户偏好、交接状态）→ 追加到本文件，
  **每条带日期**，过时的直接改掉或标注作废，别让文档变成考古层。
- **不要**写进 `.codebuddy/`（除了 `rules/`）——那是本机目录、不进版本库，重装即失。
- 本机记忆库里只保留一条"指路"记录：项目记忆以仓库为准。真正的记忆在仓库。
