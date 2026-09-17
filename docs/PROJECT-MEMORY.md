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
| `path-modes.json` | **所有路径的唯一来源**：dev / release 两套值；写法决定搬不搬（字符串 = 就地、`[源, 目标]` = 部署时搬），部署与升正式都读它 |
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
10. **第三方前端资源只放 `vendor/`**：必须带 `README.md`（版本 / 来源 / SHA256 / 许可 / 升级步骤）
    与许可原文；由本地服务器按 `/vendor/<文件名>` 发出（白名单：裸文件名 + `.js`/`.css`）。
    换播放器这类动播放链路的改动，**先跑真引擎探针再定** —— 见 `docs/design/game-details.md`
    的「内置播放器」一节（那里记着两次实测翻车：模板里的 `transform` 祖先会让 `fixed` 失效）。
11. **改游戏库数据只走"整库 JSON"这一条链**（2026-09-16 起）：`npm run db:export` 导出
    `dev-data/library-json/*.json` → 手改 → `npm run db:import -- --apply`（或双击 `libraryjson-importto-librarydb.bat`）
    回写 → **重启客户端**才生效。它是 schema 驱动的（表和列现发现），**加列加表都不用改代码**。
    别再造"只改某几个字段"的第二条链 —— 旧的人工内容表 + apply 脚本就是这么退役的
    （加一个字段要在三处各改一遍，见 `docs/design/game-content.md`）。
    ⚠️ 回写**不能"按 `electron/core/db.ts` 的 SCHEMA 重建一个新库"**：权威库的真实列与 SCHEMA
    并不一致（多一列 `description_alt`、还没有 `show_bat_console`），重建会**整列丢数据** ——
    正确做法是"复制现库 → 清空目标表 → 插回"。详见 `docs/design/library-json.md`。
12. **文件名必须自带方向，不许"一个名字干几件事"**（2026-09-16 用户要求："要修改成没有歧义的文件名"、
    "明确的命名，不要搞乱七八糟的名字"）。批处理 / 脚本 / 产物一律写成 `<源>-<动作>-<目标>`
    （全小写 + 连字符），让人**不看内容就知道从哪搬到哪、会不会写库**：
    | 名字 | 方向 |
    | --- | --- |
    | `libraryjson-importto-librarydb.bat` | `dev-data\library-json\*.json` → 权威库（会写库，先预览后确认，写前自动备份） |
    | `librarydb-exportto-libraryjson.bat` | 权威库 → `dev-data\library-json\*.json`（只读库，会覆盖 JSON） |
    | `librarydb-backup.bat` | 权威库 → `library.db.bak-<时间戳>`（只复制） |
    ❌ 反面例子（2026-09-16 已拆掉）：`library-json.bat` —— 一个文件同时干"导出"和"回写"**两个方向**，
    还得记 `export` 参数才知道它往哪边搬。**方向不明 = 双击错文件 = 直接改到权威库**，
    这类错代价最大（生产机上是数据）。
    两个对称名词的定义写在每个 bat 头部（只在 `docs\design\library-json.md` 与这三个 bat 里出现）：
    `libraryjson` = `dev-data\library-json\*.json`（人工编辑的镜像）；`librarydb` = `<数据根>\Admin\library.db`（权威库）。
13. **bat 里不要出现裸的 `<` `>`（cmd 会把它们当重定向，不是字面量）**：`title` / `echo` / `set /p` 提示语里
    写 `->`、`<数据根>`、`<时间戳>` 这类占位符时，cmd 在**解析阶段**就把 `>` `<` 当重定向操作符 ——
    后果是**真的会在当前目录创建垃圾文件**（2026-09-16 实测：三个新 bat 跑一次就在仓库根生成了
    `backup）`、`librarydb）`、`libraryjson）`、`权威库）` 四个文件），并往 **stderr** 吐
    `The system cannot find the path specified.` —— `chcp 65001` 之后这句会变成**英文**，
    于是极容易被误读成"脚本坏了 / 执行不了"（我就先误判成 shell 把命令拼坏了）。
    正确写法：占位符用全角 `＜数据根＞`、箭头用 `→`；非要字面量就 `^<` `^>` 转义。
    同类老坑已一并修掉：`dev-client.bat`（每次启动都会吐一个 `config.json)...`）、`sync-tags.bat`、`package.bat` 各一处。
    自查：搜 `^\s*echo .*[<>]`（`>nul` / `2>nul` / `^<` 是正常的）。
14. **写执行脚本用 PowerShell，bat 只当"双击壳"**（2026-09-16 用户指定："以后写执行脚本用 powershell，
    别用 bat 了，bat 只是调用 ps，运行双击方便，不然你写得太乱了。各种垃圾文件都出。"）：
    · **逻辑写在 `.ps1`**（或沿用已有的 node 脚本，如 `scripts/library-json.mjs`）。
    · **`.bat` 只做四件事**：切到脚本目录（`cd /d "%~dp0"`）、摆好环境（如 proto Node 的 PATH）、
      调 `powershell -NoProfile -ExecutionPolicy Bypass -File xxx.ps1 %*`、`pause`（让双击能看到结果）。
    · **为什么**：cmd 的解析层（重定向、括号块、`^` 转义、`%` 展开、`chcp 65001` 之后的英文报错）
      坑一个接一个，而且**踩中的代价是"静默产生垃圾文件 + 误导性报错"**（§13 那 4 个垃圾文件就是这么来的）。
      PowerShell 有正经的参数/异常/错误处理，写脚本不用跟解析器搏斗。
    · **先例**：`data-dir.bat` 已是薄壳（`for /f` 取 `node scripts/data-dir.mjs --bat` 的输出）。
    · **反面教材**（已改造）：`libraryjson-importto-librarydb.bat` / `librarydb-exportto-libraryjson.bat` /
      `librarydb-backup.bat` 曾经是"150+ 行逻辑塞在 bat 里、`set /p` + 括号块、`for /f` 解析文件名"的形态；
      **2026-09-16 当天已按这条规则改成**"~21 行壳 bat + `scripts\*.ps1`（逻辑）"，别照旧形态写。
    · ⚠️ **`.ps1` 必须存成 UTF-8 带 BOM**：PowerShell 5.1 对**无 BOM** 的 .ps1 按 ANSI 解码 → 中文全乱码
      （PS 7 才默认 UTF-8）。现有三个 ps1 都是 `EF BB BF` 开头的；注意 PS 7 的 `Set-Content` 默认**不写 BOM**，
      别拿它存 ps1。验证：读文件头 3 字节是不是 `EF BB BF`。
    · ⚠️ **"确认 Y 才继续"必须正向判**（2026-09-16 实测踩中）：`Read-Host` 在 stdin 被重定向 / 读到 EOF 时
      返回 `$null`，而 `$null -notmatch '^[Yy]$'` **不是** $true —— 集合型 `-notmatch` 返回的是"过滤结果"，
      空结果在 if 里当 $false → **写入被放行**（确认环节形同虚设）；而对 `$null` 调 `.Trim()` 又会直接抛错。
      正确写法：先 `$answer = if ($null -eq $raw) { '' } else { [string]$raw }` 归一化，再
      `if ($answer.Trim().ToLowerInvariant() -ne 'y') { 取消 }`。
      **通则：判据要"只有明确同意才动数据"，永远别把"没读到"当成同意。**

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
| **不用 GUI 改数据（整库 JSON）** | `docs/design/library-json.md` |
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

- **启动复制规则 = 用户指定的"大小 + 时间戳任一不同就复制"，别把它和"内容是否一致"混掉（2026-09-16，
  用户明确要求文档按他说的写）**：规则本身在 `shared/librarySync.ts` 一字未改（严格相等、不做容差）。
  现象是：`dev-data/library/library.db`（副本）的 mtime 永远比 `Admin/library.db`（权威库）新 ——
  复制会把权威库的 mtime 带过去（那一刻两边相等 —— 实测复现过），但副本是**活库**：进入系统时
  `migrateAddColumns()` 补 `show_bat_console` 列 + `persist()` 写一次、**退出时 `closeDb()` 再落盘一次**
  （`main.ts` 的 `before-quit`）→ 副本 mtime = "最后一次被应用写的时刻"，**于是每次进入系统按规则又复制一遍**
  （每次都复制，这符合规则，不是失效）。**副本时间戳 ≠ 内容**：实测内容一致（同尺寸 2,244,608 字节、
  6 张表行数相同、除那一列外哈希一致）。教训：**同一个"库"的两个判断用两套判据 ——
  程序判"要不要复制"看大小+时间；人判"内容一致吗"看内容；"时间戳相等"在这套设计下看不到，别拿它当判据。**
  写给用户的规则：`docs/design/data-models.md`「启动复制判定」+ `docs/design/database-schema.md` §双库机制规则 4；
  现场数据见 `docs/design/library-json.md` §7。
  **已修（2026-09-16）**：把 `show_bat_console` 列补进权威库（顺带回写用户删掉的 1 行，
  备份 `dev-data/Admin/library.db.bak-20260916-043456`）→ 副本不再多一列、进入系统复制后**不再被写回**，
  运行期间两库 mtime 相等；退出应用那次 `closeDb()` 落盘仍会让副本变新（设计如此）。
- **客户端同步行为按用户要求改了三条（2026-09-16，用户原话："启动就比较…不一致就得复制，现在没有复制"、
  "退出应用，不能写库"、"绝对不能回写"）**：
  ① **比较时机提到应用启动**：新导出 `syncRuntimeDatabase()`（`electron/core/db.ts`），
  `main.ts` 的 `whenReady` 里先调它、再弹公告窗口；`openDb()` 里保留一次幂等调用
  （所以 `exe --check` 自检也走同一条路）。重活（sql.js 初始化 + 读进内存）仍留在"进入系统"。
  ② **`closeDb()` 不再 `persist()`**（退出只关连接）。去掉是安全的：审计过 `db.ts` 里每个写语句
  （upsertGame / deleteGame / 时长 / 上次会话 / 收藏 / 隐藏 / 用户增删改 / 补列）**都已"改完立即
  persist()"**，退出时那次整体导出是多余重写，还会把副本 mtime 改成"退出时刻"、破坏跳过判定。
  ③ **`persist()` 加硬断言**：写目标若解析成权威库路径就抛错（判据是纯函数 `shared/librarySync.ts`
  的 `sameFilePath`，有单测）—— 把"客户端绝对不能回写权威库"从口头约定变成代码级保障。
  结果：没改动的启动/退出之后两库"大小 + 时间"一直一致 → 下次启动跳过复制；只有运行期写数据或
  `db:import` 回写后才复制。文档：`data-models.md`「启动复制判定」、`database-schema.md` 规则 4、
  `library-json.md` §7。
- **整库 JSON 那三个 bat 改成"壳 bat + .ps1"（2026-09-16，用户要求"以后写执行脚本用 powershell…
  bat 只是调用 ps，运行双击方便"，规则见 §三.14）**：逻辑搬到 `scripts/libraryjson-importto-librarydb.ps1`
  （编排：环境 → 前置检查 → 预览 → 确认 → 写入 → 报回退点）、`scripts/librarydb-exportto-libraryjson.ps1`、
  `scripts/librarydb-backup.ps1`；三个 bat 只剩 ~21 行壳（`cd /d "%~dp0"` → `powershell -NoProfile
  -ExecutionPolicy Bypass -File …` → 带退出码 → `pause`）。**bat 文件名一个字没变**（文档引用零改动）、
  双击体验不变；退出码变成"真"的（以前 bat 出错也返 0，自动化判不出来）。三个 ps1 都实跑验证过
  （回写预览/取消、导出到临时目录、备份），stderr 全空。⚠️ ps1 要 UTF-8 带 BOM（见 §三.14）。
  另：`sync-tags.bat` 这类旧链 bat 用户已确认**废弃**（数据只走整库 JSON 这一条链，见 §三.11）——
  文件还在，删不删等用户发话（多处文档仍引用它，删的话要一起清）。
- **一次"我自己踩的"事故与恢复（2026-09-16）**：测试"壳 + ps1"回写时，确认环节被 §三.14 那个
  `$null -notmatch` 的坑绕过 —— 我以为"无变化"的测试 A 其实把你待回写的那一行（第 0 行 `intro`）
  写进了库（结果正好是你要的 ✓），紧接着测试 B 又把我构造的假值 `测试：这行改了` 写进了**真库** ✗。
  已用 `dev-data/library-json/games.json` 覆盖回去（备份 `library.db.bak-20260916-050540`），第 0 行 `intro`
  确认是你的值；确认环节改成"正向判 Y"并复测：空输入 → `已取消`、不写库、stderr 干净。
  **教训**：给"会写数据"的流程做自动化测试时，先用 `--dir` + 临时库/dry-run 把写入路径断掉，别拿真库试。
  顺带：那次也暴露了"指纹不一致时 `--force` 继续"的文案写成 `[拒绝]` 很误导，已改成按 `--force` 自适应。
- **三个 bat 改名成"源 → 目标"（2026-09-16，用户原话："要修改成没有歧义的文件名" / "明确的命名，
  不要搞乱七八糟的名字" → 规范见硬约定 §三.12）**：`library-json.bat`（一个文件干两个方向）
  拆成 `librarydb-exportto-libraryjson.bat`（库 → JSON）与 `libraryjson-importto-librarydb.bat`
  （JSON → 库），备份 bat 改名 `librarydb-backup.bat`；`export` 参数随之取消（不再需要记参数）。
  同时把"**写库前先备份原库**"做成显式可见的一步：每次 `--apply` 前留
  `library.db.bak-<本地时间戳 YYYYMMDD-HHMMSS>`（本地时间替代原 UTC ISO 名，同秒连备加 `-2` 后缀，
  **绝不覆盖旧备份**），并新增手动入口 `npm run db:backup` / 双击 `librarydb-backup.bat`；
  写完后 bat 会把这次的回退点文件名直接报出来。备份**没有关闭开关**（不提供 `--no-backup`：
  它是最后一道回退手段，能关掉就总有人在最需要的那天关掉它）。
  两个实测坑：① **备份放脚本里**、不是 bat 里 copy —— 这样命令行回写也绕不过去，且命名规则只有一份；
  ② Windows 的 `CopyFile` **沿用源文件的修改时间**，所以备份的 mtime 是"库里数据最后写入的时间"、
  不是"做这份备份的时间"（连备两次会一模一样）→ bat 里挑"最新那份"必须按**文件名**排
  （`dir /o-n`，定宽时间戳的字典序 = 时间序），按时间排会挑错。
  改名牵动 14 处引用（含 `build.config.ts` 的 exe 进程名清单、`PROJECT-MEMORY.md`、4 个脚本头注释、
  架构守卫注释与两篇文档）。验证：`npm run check` 全绿（458 测试 + 四道守卫）；三个 bat 都在沙箱实跑过
  （含导出的成功与报错两条路径）；真库与真 `dev-data\library-json` 全程未动。
- **数据管理换链（2026-09-16）**：游戏库的人工内容（简介/地区/标签/权限等级/存档路径/评分…）
  不再走"人工内容表 → apply 脚本"，改成**整库 JSON**：`npm run db:export` / `npm run db:import`
  （或双击 `libraryjson-importto-librarydb.bat`），一表一文件落在 `dev-data/library-json/`。旧链的
  `data/game-content.json`、`scripts/apply-game-content-to-db.mjs`、`sync-game-content.bat` 已删，
  `scripts/gen-game-content.mjs` 改成给 `games.json` 补空缺。实测：导出→不改→回写**零差异**
  （4 个文件哈希一致）；拼错列名、主键重复、数组列写成字符串这些手改错误都会在写库前拦下。
  那 8 个游戏只在旧内容表里的内容（简介/地区/标签/存档路径）已**回写进库**（备份
  `dev-data/Admin/library.db.bak-2026-09-15T19-23-46-171Z`，当时只改这 8 行）。
  ⚠️ 仍待确认：这 8 个游戏的 `game_level` 两边不一致（旧内容表 = 2、库里 = 1）—— 那直接影响
  黄金/钻石门禁，**刻意没有自动覆盖**，确认后改 `games.json` 的 `game_level` 再回写。
- **踩坑：导出方向原本没有保护（2026-09-16）**：合并完人工内容后顺手又跑了一次 `db:export`，
  而导出是"用库里的值覆盖 JSON"——**刚合并的内容被旧值直接抹掉了**（指纹只防"拿旧 JSON 回写"
  那个方向）。已补上：文件与库不一致时**拒绝导出**，要 `--force` 才覆盖。
  教训通用：**一个"镜像"文件有两个方向，两个方向都要防覆盖**，只做一边等于没做。
- **整库 JSON 只管 `games`（2026-09-16 用户决定）**：`users` 不用了 —— 等级/门店沿用旧系统的
  `YunGame_UserList.json`，等新系统稳定后再重新设计；`game_libraries` 设计已废弃。
  所以 `dev-data/library-json/` 下只有 `games.json`（+ 元数据）。要管别的表用 `--tables xxx` 显式指名。
  ⚠️ 停用某张表时**必须删掉它的 json 文件**：导入会把"有 json 文件的表"整表替换，旧快照留着就会回写。
- **`game_libraries` 整套移除（2026-09-16，用户原话："都废弃。太麻烦了"）**：删掉建表语句 /
  `getGameLibraries` 等 CRUD / `settings.ts` 的 `getLibraries()` / 三条 `*_game_library` IPC /
  `shared/launchPaths.ts` 的库占位符解析（`resolveLibraryPlaceholder`）/ `GameLibrary` 类型
  （含守卫 ENTITIES 名单里的那条）/ 脚本占位符 `{LibraryName}` / `upsertGame()` 的路径自动规范化。
  **实测本机库里 0 条路径用 `{库名}`**（只有 1 行 `game_library` 列写着 `{GameLibrary1}`，是历史标签），
  所以这次移除没影响任何游戏的启动。
  ⚠️ 路径现在只有两种形态：**绝对路径** / **`{InstallDir}\…`**；再遇到 `{库名}` 会**明确报错**
  「库占位符已废弃」——刻意不静默当相对路径拼到游戏根上（那会报"文件不存在"，把排查方向带偏）。
  旧库里的 `game_libraries` 表、`games.game_library` 列都**保留不删**（没有代码读它们，同 `cover_image` 的处理）。
- **第二条 JSON 回写链也退役了（2026-09-16）**：`import-games.bat` 与
  `scripts/migrate-playnite/playday-db.mjs` 已删除（后者带手写字段映射表 = "加字段要改一处"的病根）。
  ⚠️ **但仓库根 `games.json` 及其导出（`_export-games-json.mjs` / `export-games.bat`）保留** ——
  它是 `dev-tools/GameSaveHelper`（随包发的存档备份工具）的数据源，且那工具是**按精确文本锚点**读它的
  （`\n\t\t"name": "` / `\n\t\t"savePaths"`）：camelCase 字段名、**tab 缩进**、文件名都不能动。
  区分：`dev-data/library-json/games.json` = 可编辑的管理镜像（snake_case、整表快照）；
  仓库根 `games.json` = 给存档工具看的只读导出（camelCase、tab）。

- **已落地并验证**：运行库静默检测安装（VC++ x64/x86 + VP9 扩展，真机跑通）；
  `runtimeDir` / `yungamestartDir` 进配置链；封面传输改裸字节 + 并发 6 + 队列后进先出；
  去掉两层 `requestIdleCallback` 延迟（用户回报"现在就很快啦"）；预载重复读修掉。
- **工具**：封面瘦身已按约定搬进 `dev-tools/cover-optimizer/`（自带 README，2026-09-14）。
  搬家时修掉一个隐藏坑：脚本原来靠"上一级目录"找 `config.json`（住在 `scripts/` 时正好对），
  进 `tools/` 后会去找 `tools\config.json` —— 已改成"向上找 path-modes.json 标记"，与目录深度无关。
  在临时目录实测：含中文文件名的大 PNG 1,706 KB → 233 KB（省 86%），带透明通道的那张按规则不动。
- **规则变更（2026-09-14）**：存档备份不再看用户等级 —— 黄金版也能备份钻石版游戏的存档，
  退出后照常提示。"能不能玩"的门禁仍只在启动那一条路上（`electron/core/process.ts`）。
  改动点：`electron/ipc/saveManager.ts` 删掉两处 `canPlay`（前端菜单与退出弹窗本来就没拦）。
  文档：`docs/design/user-level-detection.md` §2/§3、`docs/design/save-backup-tool.md` §4.3。
- **新增自检模式（2026-09-14）**：`PlayniteUI.exe --check`（exe 名见 `build.config.ts` 的
  `CLIENT_EXE_NAME`）—— 检查"每个游戏的启动项是否存在"与"每个游戏的 savePaths 是否存在"，
  **只写日志、不建任何窗口**（服务器/无人值守环境用）。
  日志：`<数据根>\logs\check-latest.log`（另有带时间戳的留档）；退出码 0/1/2 = 正常/发现问题/自检失败。
  关键设计：判据复用真实启动链路的函数（不是另写一份），所以它预测的就是"用户点下去会不会成功"；
  规则层单测在 `electron/core/launchCheck.test.ts`。文档见 `docs/design/launch-and-paths.md` §8。
- **未做**：这个工具还没在**真实封面库**上跑过 —— 库里 15% 是超大 PNG（单张空解码 463ms），
  这是下一个还能明显提速的杠杆。
- **仓库卫生**：有 3 个垃圾文件（`0`、`as2err.txt`、`{http.get(url`）曾被误提交、删除动作未提交；
  根目录还留着一个临时探针 `_img-perf.js`。
- **注意**：本文件写下的那一刻，工作区有 38 条未提交改动 —— 没提交 = 重装会丢。

## 七、怎么往里写（以后的记忆都写这里）

- **功能/设计层面的结论** → 写成 `docs/design/<功能名>.md`（会被文档守卫校验路径与相对链接）。
- **会话级、跨领域的上下文**（约定、坑、用户偏好、交接状态）→ 追加到本文件，
  **每条带日期**，过时的直接改掉或标注作废，别让文档变成考古层。
- **不要**写进 `.codebuddy/`（除了 `rules/`）——那是本机目录、不进版本库，重装即失。
- 本机记忆库里只保留一条"指路"记录：项目记忆以仓库为准。真正的记忆在仓库。
