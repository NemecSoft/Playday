# 路径规则与部署（dev / release）

> 需求原话：*"封面图片、音乐、视频数据要和项目解耦。用一个 json 文件先设定规则"* +
> *"我们开发，要反复的发布新的版本，修改之后，要自动把程序和需要的附加资源直接复制到目的地"* +
> *"正式版本是，测试没问题，把测试版本的 config.json 全部 `D:` 修改为 `X:`，数据库中的所有 `D:` 也全部
> 修改为 `X:`，然后全体复制到正式环境上"*。

一句话：**所有环境相关目录只写在 `path-modes.json` 一张表里**；表里的写法本身决定"部署时搬不搬"，
`config.json` 由表生成、被单测与脚本校验一致。日常只有两个动作：**`deploy.bat` 部署测试版**
（构建 + 把程序与素材铺到目的地）和 **`promote.bat` 升正式**（那一份改盘符 → 复制到 X → 校验 → 清走测试目的地）。

## 一、为什么要有这张表

封面图、音乐、游戏详情（含里面的视频）、游戏库、公告、运行库、开机自启工具，都是**环境相关的数据**：
同一份代码，在测试机要读 D 盘、在正式机要读 X 盘。它们**不该待在工程目录里**，也不该散在
十几个 bat / 脚本里各写一份 —— 那样部署时靠人逐个改，漏一个就是"测试机上打不开库 / 没封面"，而且**不报错**。

现在：

| | 位置 | 谁在读 |
| --- | --- | --- |
| 规则（唯一来源） | `path-modes.json`（仓库根，入库） | `scripts/deploy.mjs`、`scripts/promote.mjs`、`scripts/prepare-release.mjs`、单测 |
| 生效配置 | `config.json`（主程序同级，入库） | 桌面端 `electron/core/paths.ts`、网站端 `server/paths.mjs` |
| 部署配置 | **目的地里**的 `config.json`（`deploy.bat` 每次重新生成） | 部署后的客户端 |

## 二、两种模式

| | `dev`（开发，就地跑） | `release`（部署态） |
| --- | --- | --- |
| 目的地根 `defaultGameRootPath` | `.`（仓库根） | `D:/YunGame/PlayNite` |
| 封面 `coverImagesDir` | `D:/YunGame/PlayNite/CoverImages`（就地用） | 搬 `dev-CoverImages` → `CoverImages` |
| 字体 `fontsDir` | `dev-fonts` | 搬 `dev-fonts` → `fonts` |
| 游戏库 `libraryDir` | `dev-data` | 搬 `dev-data` → `data` |
| 公告 | 由库根推导（`<库根>/announcements`） | 同上 |
| 运行库 `runtimeDir` | `tools/runtime`（仓库里的源头） | 搬 `tools/runtime` → `tools/runtime` |
| 开机自启 `yungamestartDir` | `tools/yungamestart`（编译源头） | 搬 `tools/yungamestart/dist` → `tools/yungamestart` |
| GameSaveHelper `gameSaveHelperDir` | `tools/GameSaveHelper/release` | 搬 `tools/GameSaveHelper/release` → `tools/GameSaveHelper` |
| 网吧配置目录 `YunGameConfigDir` | `dev-YunGameConfig` | 搬 `dev-YunGameConfig` → `YunGameConfig` |
| 详情 `gameDetailsDir` | `D:/Addons` | 同左（**就地，不搬**） |
| 音乐 `musicDir` | `D:/Addons/song` | 同左（**就地，不搬**） |
| 谁在用 | `npm run dev` / `dev-client.bat` / 网站端 | 测试目的地（`deploy.bat` 的落点） |

两条容易踩的：

- **`dev-` 前缀 = "仓库里的源，要往目的地搬"**。同一份东西在仓库里叫 `dev-data`、到了目的地叫 `data` ——
  前缀让"这是开发素材、不是运行时数据"一眼可辨，部署脚本也不会把运行时数据当源。
- **视频没有独立字段**：它在 `<gameDetailsDir>/<游戏名>/视频攻略&游戏实况/` 下（旧的 `videos/` 仍作兜底，
  见 [游戏静态详情页](./game-details.md)），所以跟着详情目录一起"就地用"。
- **`defaultGameRootPath` 同时是"游戏根"和"部署目的地根"**：这不是巧合而是现状 —— 客户端就部署在
  `<游戏根>\PlayniteUI.exe`（`YunGameStart` 建的快捷方式指的就是这个位置），游戏按 `..\X\<游戏名>`
  相对它存放。表里 release 段写的就是 `D:/YunGame/PlayNite`；**Windows 大小写不敏感**，
  `PlayNite` 与 `Playnite` 是同一个目录（下面坑里记了这一条）。

## 三、规则文件长什么样，两种写法

```jsonc
{
  "modes": {
    "dev": {
      "defaultGameRootPath": ".",
      "coverImagesDir": "D:/YunGame/PlayNite/CoverImages",   // 字符串 = 就地用，不搬
      "fontsDir": "dev-fonts",                               //   （相对路径基准 = 应用所在目录）
      "libraryDir": "dev-data",                              // 公告 = dev-data/announcements（推导）
      "runtimeDir": "dev-tools/runtime",
      "yungamestartDir": "dev-tools/yungamestart/dist",
      "gameSaveHelperDir": "dev-tools/GameSaveHelper/release",
      "YunGameConfigDir": "dev-YunGameConfig",               // 里面固定两个文件名
      "gameDetailsDir": "D:/Addons",
      "musicDir": "D:/Addons/song"
    },
    "release": {
      "defaultGameRootPath": "D:/YunGame/PlayNite",
      "coverImagesDir": ["dev-CoverImages", "CoverImages"],  // 数组 = 搬运 [源, 目标]
      "fontsDir": ["dev-fonts", "fonts"],
      "libraryDir": ["dev-data", "data"],
      "runtimeDir": ["dev-tools/runtime", "tools/runtime"],
      "yungamestartDir": ["dev-tools/yungamestart/dist", "tools/yungamestart"],
      "gameSaveHelperDir": ["dev-tools/GameSaveHelper/release", "tools/GameSaveHelper"],
      "YunGameConfigDir": ["dev-YunGameConfig", "YunGameConfig"],
      "gameDetailsDir": "D:/Addons",                          // 就地：本来就在 D 盘、运维维护
      "musicDir": "D:/Addons/song"
    }
  }
}
```

| 写法 | 部署时 | 运行时读 |
| --- | --- | --- |
| `"<路径>"` | **不搬**（数据本来就在那儿） | 这个值 |
| `["<源>", "<目标>"]` | 把**源的内容**并入**目标**（源是文件就放进目录） | **目标** |

- **源**的相对基准 = 仓库根；**目标**的相对基准 = **目的地根**（`defaultGameRootPath`）。两者也可写绝对路径。
- 目标是**文件**（末段有扩展名）时，搬运落到"它所在目录"（判据 `targetIsFile`）；这条是为
  `gameSaveHelperDir` 那类"值要指向具体文件、整目录又都得在"的场景留的。
- **不写成数组的东西永远不进包** —— 音乐与详情是几十 GB 的运维数据，写单路径是唯一正确的写法，
  单测专门盯着这一条（"就地项不许进搬运清单"）。

## 四、校验（都不靠人记得）

| | 规则 | 在哪 |
| --- | --- | --- |
| 表本身合法 | 模式齐全；字段一个不缺、值非空；数组必须两项；目标不许 `..` 跑出目的地；`defaultGameRootPath` 不许写成数组 | `readModeTable()`，单测 |
| 盘符只看**目标** | 目标里的绝对路径：`dev` 不许 `X:`、`release` 不许出现"另一个盘"之外的写法；源在开发机仓库里不受限 | 单测 |
| 配置与规则一致 | `config.json` 必须等于 `dev` 模式的规则 —— 有人手工改路径字段就会失败 | `shared/pathModes.test.ts`（`npm run check` 会跑） |

## 五、两个双击入口

```text
deploy.bat            # 测试版：构建 → 铺到目的地 → 生成 config.json
promote.bat           # 正式版：把测过的那份改盘符 → 复制到 X → 校验 → 清走测试目的地
```

两个都是**双击即用**（都接受一个可选的 `--dry-run` 空跑：只打印计划、一个字节不写）。

### `deploy.bat`：没有"中间包"

```text
[1/4] npm run build                    （主进程 + 渲染层）
[2/4] electron-builder --dir           → .pack-tmp\win-unpacked（中转）
[3/4] node scripts\deploy.mjs          → 程序 + dev-* 素材 + config.json 落到目的地
[4/4] 删掉中转目录
```

为什么不再有 `release_test\` 这样的中间站：**这台机器上的目的地就是测试环境**，多一个中间目录只是多一次
人工搬运，而每一次人工搬运都是一次"拷了旧包"的机会。目的地是谁，由表说了算。

`scripts/deploy.mjs` 干的事（顺序即安全性）：

1. **先打印**要搬什么、要覆盖什么、要清什么（`--dry-run` 只走到这里）；
2. 拦住"客户端还在运行"（覆盖 exe 会中途失败，留下半新半旧的目录）；
3. **安全锁**：目的地非空且没有部署标记 `.playday-deploy.json` → 拒绝写入并告诉你怎么确认。
   （这道锁在 2026-09-17 真的拦下过一次事故：表里的目的地一度被指到另一个 Playnite 目录。）
4. 按**部署记录**清理"上次写过、这次不再需要"的项；
5. 逐项搬运（robocopy `/E` + 大文件多线程）；
6. 按表重新生成 `config.json`；
7. 写下本次记录。

### `promote.bat`：升正式

顺序是刻意的 —— **失败也不丢东西**：

```text
① 复制测试那份 → 正式落点（X 盘；本机没有 X 盘 → release\，结构一模一样，整份拷过去即可）
② 在正式那份上改 config.json：以 D: 开头的值 → X:
③ 迁库：扫 data\Admin\library.db 的所有文本列，只改以 D: 开头的值（先备份，清单全打印）
④ 校验（关键文件 + 文件数）→ 通过之后才清走测试目的地
```

三个要点：

- **不去重新构建**：测过的是**那一个目录**。重新构建 = 换了一份没测过的产物，测试就白做了。
- **不做 `D:→X:` 字符串替换 config 全文**，"以 `D:` 开头的值才改"：只动路径字段，不碰描述文本；
  库同理（`UPDATE ... SET col='X' || substr(col,2)`，其余一个字符不改，所以 `/` 与 `\` 的写法保持原样）。
- **清测试目的地只清"部署记过的"**：目的地与原版 Playnite **共用**同一个目录（见下），
  整目录 `rmdir` 会连原版的 `locales` / `Resources` / `PlayniteUI.exe_orign` 一起删掉。
  要真全清得显式 `--wipe-all`。

## 六、⚠️ 目的地是**和原版 Playnite 共用的目录**

`D:\YunGame\PlayNite` 里原先就有原版 Playnite 的一整套（CefSharp、Themes、Extensions、`locales\`、
`Resources\`、以及被改名备份的 `PlayniteUI.exe_orign`）。我们的客户端**就放进去、覆盖同名文件** ——
因为 `YunGameStart` 的快捷方式指向 `<游戏根>\PlayniteUI.exe`，我们的 exe 必须顶上那个位置。

由此带来两条硬约束：

1. **部署绝不镜像（不用 `/MIR`）**：镜像会把"我们没写过、原版有"的文件当多余删掉，跑一次就打坏原版客户端。
   覆盖策略是"**只删自己写过的**"：`.playday-deploy.json` 里记两份记录 ——
   程序（本次写过的相对路径）与素材（每个文件的 `目的地 + 源`）；下次只清理
   "上次写过、这次产物里没有"和"源已不在仓库"的那些。其余文件一个字节都不动。
2. **`config.json` 是覆盖写**：目的地里那份是部署生成的（原版 Playnite 的配置同名，早已被顶掉）。
   你手工改过的会被下次部署覆盖 —— 要改路径请改 **`path-modes.json`**，要改别的字段改仓库根的 `config.json`。

> 坑：**Windows 大小写不敏感**，`D:/YunGame/Playnite` 与 `D:/YunGame/PlayNite` 是同一个目录。
> 2026-09-17 我就把它当成两个目录，白担心了一场"会不会打坏原版"。写路径时以表里的写法为准。

## 七、库与运行库怎么随包走

- 随包带的是**权威库 + 公告**（`data\Admin\library.db`、`data\announcements\`）；运行时副本
  `data\library\` 由客户端首次启动时从权威库复制 —— 带上它等于塞一份迟早过期的副本。
- `dev-data\Admin\*.bak-*`（备份历史）**绝不进包**：否则会让人以为"线上有备份"。
  这两条由 `deploy.mjs` 传给 robocopy 的 `/XF`、`/XD` 保证（不是靠人不往目录里放东西）。
- 运行库安装包（VC++ x64/x86、VP9 扩展，约 45 MB）落在 `<目的地>\tools\runtime\`，正是
  `settings.runtimeDir` 指的路径。客户端启动时后台检测、缺哪个装哪个，见 [runtime-deps.md](./runtime-deps.md)。
- 开机自启工具落在 `<目的地>\yungamestart\`（`yungamestart.exe` + `1.ico` / `2.ico`），来自
  `dev-tools\yungamestart\dist\`（先跑 `dev-tools\yungamestart\build.bat`，没编译过就没有这一层，
  部署会因为它"源不存在"直接报错 —— 刻意的：缺件不给静默过），见 [yungamestart.md](./yungamestart.md)。
- GameSaveHelper 整目录落 `<目的地>\tools\GameSaveHelper\`（exe 用 `config.json` 的
  `settings.gameSaveHelperDir` 拼固定文件名找到），见 [save-backup-tool](../plans/2026-09-11-save-backup-tool.md)。

## 八、Electron 下载走国内镜像

出包时 electron-builder 会下载**官方 electron zip**，缓存在 `%LOCALAPPDATA%\electron\Cache\`。
两点容易误解：

- 它**不用** `node_modules/electron/dist` —— 那是 electron 包安装时解压的目录，只供本地运行。
- 缓存按版本存：换版本、或上次下载被打断，下次就得重下 100+ MB。

| 变量 / 配置 | 管哪一段下载 | 设在哪 |
| --- | --- | --- |
| `ELECTRON_MIRROR` | electron zip（`app-builder.exe` 直接读） | `deploy.bat` / `package.bat` |
| `ELECTRON_BUILDER_BINARIES_MIRROR` | nsis / winCodeSign 等工具包 | 同上 |
| `electron_mirror` | `npm install` 时 electron 包自身的下载 | 仓库根 `.npmrc` |

都用 `if not defined`，所以**要临时回官方源不用改脚本** —— 在外面设同名环境变量即可。

## 九、发布前自检

1. `npm run check` 全绿（含"配置与规则一致"的测试）。
2. `deploy.bat --dry-run` —— 核对会搬什么、会覆盖什么、会清什么（这一步在真跑之前就能发现问题）。
3. 部署后到目的地确认：`PlayniteUI.exe`、`config.json`（内容是 D 盘）、`data\Admin\library.db`、
   `data\announcements\announcement.html`、`tools\runtime\`、`tools\GameSaveHelper\`、
   `YunGameConfig\`、以及本次编译过的话 `yungamestart\yungamestart.exe`。
4. 跑一次客户端；测试通过再 `promote.bat`。正式机上确认这些**真实存在**：
   `X:\YunGame\PlayNite\CoverImages`、`X:\Addons`、`X:\YunGame\PlayNite\YunGameConfig\YunGame_UserList.json`、
   `X:\YunGame\Playnite`。
   注：门店名与等级都来自用户表；它缺失时状态栏只是不显示网吧名、等级按黄金版处理，不影响启动。

## 十、相关文件

| 文件 | 职责 |
| --- | --- |
| `path-modes.json` | **规则（唯一来源）**：两种模式 × 各目录，写法决定搬不搬 |
| `shared/pathModes.ts` | 解析 / 校验规则 + `copyPlan()` / `targetRoot()` / `runtimeValue()` / `targetIsFile()`（纯函数，单测 `shared/pathModes.test.ts`） |
| `scripts/deploy.mjs` | 部署：安全锁、清单驱动搬运、生成 `config.json`、写部署记录 |
| `scripts/promote.mjs` | 升正式：整包复制 → config 与库改盘符（备份 + 打印）→ 校验 → 清测试目的地 |
| `deploy.bat` / `promote.bat` | 两个双击入口 |
| `scripts/prepare-release.mjs` | 只负责"按模式生成/校验 `config.json`"（`sync-config.bat` 与单测在用） |
| `package.bat` | 只打一个便携产物目录（不部署）；日常用 `deploy.bat` |
| `config.json` | 开发态生效配置（由规则生成，别手工改路径字段） |
| `sync-config.bat` | **dev 模式的同步入口**（双击即用）：预演 → 写入 → 复核；`dev-client.bat` 启动前自动调用 |
| `scripts/lib/devData.mjs` | **开发态数据路径的唯一来源**（读规则表 + 支持 `YUNGAME_DATA_DIR` 覆盖） |
| `scripts/data-dir.mjs` / `data-dir.bat` | 给 cmd 用的薄壳（打印数据根 / 权威库 / 运行时副本） |
| `scripts/check-architecture.mjs` | 规则 11（不许指回旧数据路径）、规则 12（数据目录名只许在解析器里） |

## 十一、开发态路径也只有一个来源

早先 `dev-data` 这个名字在 **8 个 bat + 8 个脚本**里各写一遍，这正是"规则表"要消灭的那类重复。

```bat
REM 任何 bat 里要数据路径，先取一次：
call "%~dp0data-dir.bat"
REM   %YUNGAME_DATA_DIR%     数据根
REM   %PLAYDAY_ADMIN_DB%     权威库（源库）
REM   %PLAYDAY_RUNTIME_DB%   运行时副本
```

```js
// 任何 node 脚本里：
import { adminDbPath, runtimeDbPath, devDataDir } from "./lib/devData.mjs";
```

`scripts/check-architecture.mjs` 的规则 12 会**拦下任何再写死的地方**（连 bat 注释里出现这个目录名都算）。
历史一次性脚本（`verify-*` / `migrate-*` / `_` 前缀）不在管辖内。

## 十二、打包取舍：**性能优先，体积可以让**（2026-09-14 定）

需求原话：*"我们的打包，要以性能优先，空间可以大一点"*。据此逐项的取舍：

| 项 | 决定 | 为什么 |
| --- | --- | --- |
| `vite` 的 `target` | `esnext` | Electron 自带 Chromium 很新，不再为老浏览器转译/打 polyfill |
| `vite` 的 `minify` | `esbuild` | 此前被人为关掉（为诊断只在压缩产物里出现的报错），之后一直没还原 —— 发布包跑的其实是**未压缩**代码 |
| `vite` 的 `sourcemap` | **开启** | 体积换可调试性：压缩后仍能在 DevTools 看到原始源码与精确行号 |
| `manualChunks` | 收敛成 3 类（react / vendor / 业务） | 本地应用读本地文件，chunk 越多启动越慢；原先"每个包一个 chunk"= 68 个 |
| `asar` | 保持开启 | Electron 官方：asar 在 Windows 上减少昂贵的文件系统操作 |
| 体积裁剪 | **不做** | 用户明确允许体积变大；这些都不在启动关键路径上 |
| robocopy | 加 `/MT:16` | 要拷约 250 MB，多线程压墙钟时间；退出码语义不变（0-7 成功，≥8 失败） |

实测（同一台机器、同一份源码）：

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| 渲染层 js 文件数 | 68 | **7**（启动实际加载 **3** 个） |
| 渲染层 js 体积 | 2.5 MB | **1.4 MB**（启动实际解码约 1.05 MB） |
| 启动时 `modulepreload` 条数 | 62 | 0 |
| 构建耗时 | — | 11.6 s |

> ⚠️ 动 `minify` / `manualChunks` 之后**必须真的把产物跑起来看一次**，不能只看构建成功 ——
> 当初关掉压缩就是因为它会在**运行期**报错。验证方法：本地起个静态服务打开
> `dist/index.html?window=client`，确认 `#root` 有子节点、console 里没有 error。
