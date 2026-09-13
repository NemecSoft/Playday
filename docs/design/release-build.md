# 路径模式与出包（dev / prerelease / release）

> 需求原话：*"封面图片、音乐、视频数据要和项目解耦。用一个 json 文件先设定规则：
> 开发模式、预发布模式、发布模式要指定的目录。比如游戏详情：开发模式和预发布模式 `D:\Addons`，
> 发布模式是 `X:\Addons`。"* + *"真正的 release 要把 D 盘全部修改为 X 盘（D 测试、X 正式）。"*

一句话：**所有环境相关目录只写在 `path-modes.json` 一张表里**，三种模式各一套取值；
`config.json` 由它生成、并被测试与脚本校验一致 —— 谁手工改了配置、或忘了同步规则，都会当场失败。

## 一、为什么要有这张表

封面图、音乐、游戏详情（含里面的 `videos/` 视频）、游戏库、公告，都是**环境相关的数据**：
同一份代码，在测试机要读 D 盘、在正式机要读 X 盘。它们**不该待在工程目录里**，也不该散在
十几个 bat / 脚本里各写一份 —— 那样出包时靠人逐个改，漏一个就是"正式机上打不开库/没封面"，
而且**不报错**。

现在：

| | 位置 | 谁在读 |
| --- | --- | --- |
| 规则（唯一来源） | `path-modes.json`（仓库根，入库） | `scripts/prepare-release.mjs`、单测 |
| 生效配置 | `config.json`（主程序同级，入库） | 桌面端 `electron/core/paths.ts`、网站端 `server/paths.mjs` |
| 发布配置 | 输出目录里的 `config.json`（出包时生成）：正式 `release/`、预发布 `release_test/` | 打包后的 exe |

## 二、三种模式

| | `dev`（开发） | `prerelease`（预发布/测试） | `release`（正式） |
| --- | --- | --- | --- |
| 盘符 | D 盘 | D 盘 | **X 盘** |
| 封面 | `D:/YunGame/PlayNite/CoverImages` | 同左 | `X:/YunGame/PlayNite/CoverImages` |
| 音乐 | `D:/KwDownload/song` | 同左 | `X:/KwDownload/song` |
| 详情页 + `videos/` 视频 | `D:/Addons` | 同左 | `X:/Addons` |
| 游戏库（库根 / 权威库） | `dev-data` / `dev-data/Admin` | 仓库 `dev-data` 的绝对路径 | `data` / `data/Admin`（随包） |
| 公告 | `dev-data/announcements` | 仓库 `dev-data` 的绝对路径 | `data/announcements`（随包） |
| 游戏根 | `D:/YunGame/Playnite` | 同左 | `X:/YunGame/Playnite` |
| 运行库安装包 | `tools/runtime`（仓库里的源头） | `D:/YunGame/Playnite/runtime` | `X:/YunGame/Playnite/runtime` |
| 开机自启工具 | `tools/yungamestart`（编译源头） | `D:/YunGame/Playnite/yungamestart` | `X:/YunGame/Playnite/yungamestart` |
| 谁在用 | `npm run dev` / `dev-client.bat` / 网站端 | 测试机 | 网吧正式机 |

**为什么 dev / prerelease 的库在仓库里、release 的库随包**：
仓库里的 `dev-data` 是"跟着代码演进的小体积数据"（权威库 + 公告，几 MB），合起来就是**可运行的开发环境**；
而正式机没有开发仓库，绿色便携的本意是"exe 拷到哪、数据跟到哪"（`electron/core/paths.ts` 的
`configRoot()` 在打包态优先认 exe 同级的 `data`）。
prerelease 指向开发机 `dev-data` 的**绝对路径**：它跟开发机是同一份数据，不复制 ——
复制就会有一份迟早过期的副本（表现成"测试机上看到三天前的库"）。

> 视频没有独立字段：它在 `<gameDetailsDir>/<游戏名>/videos/` 下（见 [游戏静态详情页](./game-details.md)
> 的"本地视频"一节），所以跟着详情目录一起切换模式。

## 三、规则文件长什么样

```jsonc
{
  "modes": {
    "dev": {
      "coverImagesDir": "D:/YunGame/PlayNite/CoverImages",
      "gameDetailsDir": "D:/Addons",
      "musicDir": "D:/KwDownload/song",
      "libraryDir": "dev-data",              // 相对路径的基准 = 应用所在目录
      "sourceLibraryDir": "dev-data/Admin",  //   （开发态 = 工程根；打包版 = exe 同级）
      "announcementsDir": "dev-data/announcements",
      "defaultGameRootPath": "D:/YunGame/Playnite",
      "yunGameUserListPath": "D:/YunGame/PlayNite/YunGameConfig/YunGame_UserList.json",
      "yunGameServerStatusPath": ".../YunGame_ServerStatus.json",
      "gameSaveHelperPath": "D:/AI/nsis/GameSaveHelper.exe"
    },
    "prerelease": { /* 同上，但库指向仓库 dev-data 的绝对路径 */ },
    "release":    { /* 全 X 盘，库 = data（随包） */ }
  }
}
```

**改目录只改这张表**，然后：
`node scripts/prepare-release.mjs --mode dev`（写回 `config.json`）/ `--mode release`（出包用；
`--out` 省略时按模式取默认目录，见下）。

## 四、校验（三条，都不靠人记得）

| | 规则 | 在哪 |
| --- | --- | --- |
| 表本身合法 | 三个模式齐全；11 个字段一个不缺、值非空；不许有表外字段 | `readModeTable()`，单测 |
| 盘符与环境一致 | `dev`/`prerelease` 不许出现 `X:\...`；`release` 不许出现 `D:\...` | 同上（混了就抛错，不是警告） |
| 配置与规则一致 | `config.json` 必须等于 `dev` 模式的规则 —— 有人手工改配置就会失败 | `shared/pathModes.test.ts`（`npm run check` 会跑）；也可手动 `--mode dev --check` |

另有存在性检查：`dev` / `prerelease` 模式跑脚本时会检查封面/详情/库/公告目录是否真实存在
（配了但不存在 = 静默失效）；`release` 的 X 盘在开发机上不存在，只在脚本里提示"到正式机上确认"。

## 五、出包流程

```bash
build-prerelease.bat   # 测试包（D 盘）→ release_test\ ：package.bat release_test
                       #   + 按 prerelease 模式写 config.json（不复制数据）
build-release.bat      # 正式包（X 盘）→ release\ ：package.bat release
                       #   + 按 release 模式写 config.json + 把权威库/公告复制成 exe 同级的 data\
```

**两个变体目录必须分开。** 正式包和预发布包**只差 `config.json` 里的盘符**（X 盘 / D 盘），
放进同一个目录就再也无法从路径上分辨"哪份能拷到生产机"——那是事故级歧义。所以：

| 目录 | 内容 | 用途 |
| --- | --- | --- |
| `release\` | X 盘配置 + `<exe 同级>\data` | **可整包拷到生产机**（拷完就能跑） |
| `release_test\` | D 盘配置，不随包带数据 | 测试机专用，**不许上生产机** |
| `.pack-tmp\` | electron-builder 的原始输出（`win-unpacked\`） | 中转，打包成功后自动删除 |

包里的 `yungamestart\`（开机自启的原生小工具，含 1.ico / 2.ico）来自
`tools\yungamestart\dist\` —— 由 `package.bat` 在**清空输出目录之后**复制进去（见
[yungamestart.md](./yungamestart.md)）。没编译过就没有这一层，出包时会打印一行 SKIP 提示，
所以顺序是先 `tools\yungamestart\build.bat`、再出包。

包里的 `<exe 同级>\runtime\`（约 45 MB）是**运行库安装包**：VC++ 运行库 x64/x86 与 VP9 解码扩展，
来自 `tools\runtime\` —— 由 `package.bat` 在**清空输出目录之后**复制进去，与 `yungamestart\`
用的是同一套"exe 同级目录"布局。这个路径正是 `config.json` 的 `settings.runtimeDir`
（正式机 `X:/YunGame/Playnite/runtime`、测试机 D 盘同路径，见上表）。客户端启动时会后台检测、
缺哪个装哪个 —— 详见 [runtime-deps.md](./runtime-deps.md)。
这 45 MB 会跟着 `release\` 一起被拷到生产机；不想随包发的话，删掉 `package.bat` 里那段 robocopy，
再把这三个文件放到每台机器的 `settings.runtimeDir` 目录即可（客户端按顺序找
**配置目录 → exe 同级 → 包内兜底**，所以升级运行库不必重新出包）。

两个脚本都是**双击即用、不带参数**（选错变体在生产上是"读不到库"这种事故，
所以不用命令行参数来选）。真正干活的 `prepare-release.mjs --mode ...` 由它们调用；
它的 `--out` **默认值也按模式分开**（`prerelease` → `release_test`），所以即使有人漏写
`--out`，也不会把测试配置写进正式包目录。

顺序不能颠倒：`package.bat` 会**先清空输出目录**再 robocopy，先写配置会被覆盖掉。

**输出目录每次打包都会被整个清空**（`rmdir /s /q`，并且只在 electron-builder 成功之后执行 ——
所以打包失败不会毁掉上一个还能用的包）。这是刻意的：`robocopy /E` 只覆盖、不删除，上一版残留的
文件（例如升级 electron 后不再存在的 dll）会**静默地**跟着拷到生产机。代价是输出目录里别放自己的
东西（`config.json`、`data\` 由 `prepare-release` 在打包之后重新生成，不受影响）。
`package.bat` 只接受 `release` / `release_test` 两个名字，写错或传绝对路径会被直接拒绝 ——
清空动作前面不留"手滑"的余地。

> 为什么中转目录是固定的、而不是让 electron-builder 直接输出到变体目录：electron-builder 25
> **不支持**命令行覆盖输出目录 —— `-c.directories.output=xxx` 会被它当成配置文件路径
> （报 `ENOENT: 打不开 .directories.output=xxx`）。所以 `electron-builder.yml` 里只配一处
> （`directories.output: .pack-tmp`），变体由 `package.bat` 的 robocopy 目标决定。

`release` 随包只带 **权威库 + 公告**（`Admin/library.db`、`announcements/`）；运行时副本由客户端
首次启动时从权威库复制 —— 带上它等于塞一份迟早过期的副本；`dev-data/Admin/*.bak-*` 那些备份历史
也**故意不带**（否则会让人以为"线上有备份"）。

### Electron 下载走国内镜像

出包时 electron-builder 会下载**官方 electron zip**（形如 `electron-v32.3.3-win32-x64.zip`），
缓存在 `%LOCALAPPDATA%\electron\Cache\<url 哈希>\`。两点容易误解：

- 它**不用** `node_modules/electron/dist` —— 那是 electron 包安装时解压出来的目录，只供本地运行。
  所以"本地已经有 electron.exe"≠"不用下载"。
- 缓存按版本存：换了 electron 版本、或上次下载被打断（根目录留个半截 zip，不算命中），
  下次就会重下 100+ MB。

国内直连 GitHub 慢且常断，所以默认改走 npmmirror：

| 变量 / 配置 | 管哪一段下载 | 设在哪 |
| --- | --- | --- |
| `ELECTRON_MIRROR` | electron zip（Go 版 `app-builder.exe` 直接读） | `package.bat` 第 1.5 步 |
| `ELECTRON_BUILDER_BINARIES_MIRROR` | nsis / winCodeSign 等打包工具包 | 同上 |
| `electron_mirror` | `npm install` 时 electron 包自身的下载 | 仓库根 `.npmrc` |

`package.bat` 里用 `if not defined`，因此**要临时回官方源不用改脚本** —— 在外面设同名环境变量即可
（环境变量优先级高于 `.npmrc`）。`.npmrc` 只加了这一项、**没动 `registry`**：依赖解析来源不变，
`package-lock.json` 不受影响。

> 判断"这次要不要重新下载"：看 `%LOCALAPPDATA%\electron\Cache` 下有没有当前版本 zip 的完整份。
> 下成一次就永久命中，之后离线也能出包。

### 发布前自检

1. `npm run check` 全绿（含"配置与规则一致"的测试）。
2. `node scripts/prepare-release.mjs --mode release --dry-run` —— 逐条核对会改的字段。
3. 在 `release\` 里确认：`PlayniteUI.exe` 存在、`config.json` 存在（且内容是 X 盘）、
   `data\Admin\library.db` 存在、`data\announcements\announcement.html` 存在；
   若本次编译了原生工具，还要有 `yungamestart\yungamestart.exe`（含 `1.ico` / `2.ico`）；
   并且**没有** `.pack-tmp\` 残留。
4. 正式机上确认这些**真实存在**：`X:\YunGame\PlayNite\CoverImages`、`X:\Addons`、
   `X:\YunGame\PlayNite\YunGameConfig\YunGame_UserList.json`、`X:\YunGame\Playnite`。
   注：门店名与等级都来自用户表（`YunGame_UserList.json`）；它缺失时状态栏只是不显示网吧名、
   等级按黄金版处理，不影响启动。

## 六、相关文件

| 文件 | 职责 |
| --- | --- |
| `path-modes.json` | **规则（唯一来源）**：三种模式 × 各数据目录 |
| `shared/pathModes.ts` | 解析 / 套用 / 校验规则（纯函数 + 单测 `shared/pathModes.test.ts`） |
| `scripts/prepare-release.mjs` | 按模式生成或校验 `config.json`；release 模式顺带复制随包数据（`--out` 默认按模式分开） |
| `build-release.bat` / `build-prerelease.bat` | 出包入口（双击即用、无参数）：`package.bat` + `prepare-release`，输出到 `release\` / `release_test\` |
| `config.json` | 开发态生效配置（由规则生成，别手工改路径字段） |
| `scripts/lib/devData.mjs` | **开发态数据路径的唯一来源**（读规则表 + 支持 `YUNGAME_DATA_DIR` 覆盖） |
| `scripts/data-dir.mjs` | 给 cmd 用的薄壳（打印数据根/权威库/运行时副本，供 bat `for /f` 取） |
| `data-dir.bat` | bat 的入口：`call data-dir.bat` 后即可用 `%YUNGAME_DATA_DIR%` 等变量 |
| `scripts/check-architecture.mjs` | 规则 11（不许指回旧数据路径）、规则 12（数据目录名只许在解析器里） |

## 七、开发态路径也只有一个来源

早先 `dev-data` 这个名字在 **8 个 bat + 8 个脚本**里各写一遍，这就是"规则表"要消灭的那类重复。
脚本还要读取两次真实案例：网站端 `server.mjs` 与几个填充脚本的默认值，在数据目录搬家后
**仍指着旧路径**（读不到库却不报错）。所以开发态也收成了单一来源：

```bat
REM 任何 bat 里要数据路径，先取一次：
call "%~dp0data-dir.bat"
REM 之后可用：
REM   %YUNGAME_DATA_DIR%     数据根
REM   %PLAYDAY_ADMIN_DB%     权威库（源库）
REM   %PLAYDAY_RUNTIME_DB%   运行时副本
REM   %PLAYDAY_DATA_REL%     数据根相对仓库的路径（push.bat 用它 grep git status）
```

```js
// 任何 node 脚本里：
import { adminDbPath, runtimeDbPath, devDataDir } from "./lib/devData.mjs";
```

`scripts/check-architecture.mjs` 的规则 12 会**拦下任何再写死的地方**（连 bat 注释里出现这个
目录名都算），所以不会第三次漂移。历史一次性脚本（`verify-*` / `migrate-*` / `_` 前缀）
不在管辖内 —— 它们的默认值可能已过期，但都是一次性工具。
