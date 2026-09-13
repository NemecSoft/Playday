# 目录结构

Playday 采用 **Electron 主进程 + React 渲染进程 + 可选网站端** 的分层布局，职责清晰、单一数据源。

## 顶层概览

```
Playday/
├── electron/            # 主进程（Node/Electron 后端）
├── src/                 # 渲染进程前端（React 18）
├── server/              # 网站端后端（Node http，复用同一份数据）
├── shared/              # 前后端共享的纯逻辑
├── scripts/             # 数据迁移/校验脚本
├── tools/               # 工具目录（各自带 README / 说明）
│                        #   yungamestart/     C++ 开机自启：判定黄金/钻石版 + 建桌面快捷方式（见 yungamestart.md）
│                        #   GameSaveHelper/   存档备份/还原工具（C++ + 自带整套便携 NSIS，origin: NemecSoft/GameSaveHelper）
│                        #   nircmd/           第三方命令行工具 NirCmd（游戏启动 bat 用它做窗口居中/音量等）；
│                        #                     生产环境对应 <YunGame>\Tools\nircmd\，游戏 bat 里硬编码的就是那个路径
│                        #   runtime/          运行库安装包（VC++ 运行库 x64/x86、VP9 解码扩展）；
│                        #                     随客户端发到 resources\runtime\，启动时静默检测安装（见 runtime-deps.md）
├── public/              # 静态资源（字体、图标）
├── locales/             # 打包用语言文件
├── path-modes.json      # 三种模式（dev/prerelease/release）的目录规则：**唯一来源**，config.json 由它生成
├── config.json          # 生效配置（开发态）。路径字段别手工改，改 path-modes.json 再生成
├── dev-data/            # 开发/测试态的数据根（库 + 权威库 + 公告；不算构建产物）
├── release/             # **纯打包产物**：正式包（X 盘 config.json + 随包 data/），整目录不入库
├── release_test/        # 预发布包（D 盘 config.json，不带数据）—— 与 release/ 分开放
├── .pack-tmp/           # electron-builder 中转目录（打包成功后自动删除）
├── dist/                # 前端构建产物（vite build 输出）
├── dist-electron/       # 主进程编译产物（tsc 输出）
├── build.config.ts      # 命名/版本配置（APP_NAME 等）
├── electron-builder.yml # 打包配置
├── vite.config.mts      # 渲染进程构建配置
├── tsconfig.json        # 渲染进程 TS 配置
├── tsconfig.main.json   # 主进程 TS 配置
├── tailwind.config.js   # Tailwind 配置
├── postcss.config.js    # PostCSS 配置
├── ARCHITECTURE.md      # 双端架构总览
├── push.bat             # 一键推送脚本
├── dev-client.bat       # 开发启动（客户端）
├── dev-admin.bat        # 开发启动（管理端）
├── deploy-web.bat       # 一键部署网站端
├── test-web.bat         # 网站端测试
├── sync-tags.bat        # 标签同步（json → 权威库）
├── sync-game-content.bat # 游戏内容同步（简介/地区/标签 → 库）
├── data-dir.bat         # 开发态数据路径（其它 bat 用 call 取，值来自 path-modes.json）
├── package.bat          # 打包便携 exe 到 <输出目录>（默认 release/；纯产物，不碰数据）
├── build-release.bat    # 出正式包（X 盘 → release/；双击即用，无参数）
└── build-prerelease.bat # 出测试/预发布包（D 盘 → release_test/；双击即用，无参数）
```

## 主进程 `electron/`

| 文件 | 职责 |
| --- | --- |
| `main.ts` | 应用入口：创建窗口、注册 IPC、托盘、系统菜单清理、`enterSystem()` 流程、`--admin` 判断 |
| `config.ts` | 从 `build.config.ts` 读取应用名/版本 |
| `preload.ts` | 通过 `contextBridge` 暴露 `window.ipc` 给渲染进程 |
| `windows.ts` | 三个 BrowserWindow 工厂（客户端/公告/管理端），无边框 + 应用图标 |
| `core/paths.ts` | 数据根定位（`configRoot()`：环境变量 → exe 同级 data → 项目根） |
| `core/db.ts` | sql.js 数据库访问层（建表、CRUD、`persist()` 落盘） |
| `core/models.ts` | 数据模型（`Game`、`AppSettings`、`DEFAULT_SETTINGS` 等） |
| `core/settings.ts` | 设置读写（`config.json`），`getLibraries()` 游戏库 |
| `core/auth.ts` | 登录/权限（用户等级）、企业用户 IP 匹配 |
| `core/covers.ts` | 封面图库匹配、图片读取 |
| `core/tags.ts` | 自动标签 |
| `core/process.ts` | 游戏进程启动、时长追踪 |
| `core/scriptRunner.ts` | 脚本启动（pre/post launch/exit） |
| `core/tray.ts` | 托盘图标（tray.png）+ 右键菜单 |
| `core/gameServer.ts` | 静态详情页容器（本地 HTTP 服务器） |
| `ipc/*.ts` | IPC 命令注册：`games` / `covers` / `auth` / `admin` / `announcement` / `gameHtml` / `system` / `register` |

## 渲染进程 `src/`

| 目录 | 职责 |
| --- | --- |
| `api/ipc.ts` | 传输层：桌面走 `window.ipc`，网站走 `fetch /api/*` |
| `api/client.ts` | 类型化命令封装（`api.getGames()` 等） |
| `components/` | UI 组件（TopBar、Sidebar、Toolbar、GridView、AnnouncementWindow、设置弹窗等） |
| `pages/` | 路由页面（`GameDetailPage`） |
| `stores/` | Zustand 状态（games / settings / library / ui / auth / imageProgress / scroll） |
| `hooks/` | 自定义 hooks（`useVirtualGrid`、`useLazyImage`） |
| `utils/` | 纯逻辑（搜索、主题、封面、assets 图片缓存） |
| `i18n/` | 国际化配置 + `locales/` 三语字典 |
| `lib/` | 工具库（`utils.ts` 等） |
| `types/` | TypeScript 数据模型（与主进程返回结构一致） |
| `styles/` | 全局样式（`global.css`、`tokens.css`），CSS 变量多主题 |

## 共享逻辑 `shared/`

| 文件 | 职责 |
| --- | --- |
| `search.ts` | 搜索纯逻辑（前后端共用） |
| `validate.ts` | 校验逻辑（前后端共用） |

> `shared/` 让搜索/校验等纯函数在主进程、渲染进程、网站端三处复用，避免重复实现。

## 网站端 `server/`

| 文件 | 职责 |
| --- | --- |
| `server.mjs` | Node 内置 http 后端（零依赖），复用 `dev-data` 同一份数据，实现 `/api/<cmd>`、`/CoverImages/*`、`/Game_Details/*`、静态 `dist/` |

## 脚本 `scripts/`

| 类别 | 脚本 | 说明 |
| --- | --- | --- |
| 生成 | `gen-tray-icon.mjs` | 生成 16x16 高对比托盘图标 `public/icons/tray.png` |
| 迁移 | `migrate-cover-paths.mjs` | 迁移数据库封面路径 |
| 迁移 | `migrate-cover-to-release.mjs` | 封面迁移到 dev-data |
| 迁移 | `migrate-from-release.mjs` | 从 release 迁移数据 |
| 迁移 | `migrate-libs-to-db.mjs` | 游戏库从 config.json 迁移到数据库表 |
| 校验 | `verify-*.mjs` / `inspect-*.mjs` | 数据库/迁移结果校验 |
| 出包 | `prepare-release.mjs` | 按 `path-modes.json` 生成/校验某模式（dev / prerelease / release）的 `config.json`，release 模式顺带复制随包数据；规则逻辑在 `shared/pathModes.ts`（见 [路径模式与出包](./release-build.md)） |
| 路径 | `lib/devData.mjs` | **开发态数据路径的唯一来源**（读 `path-modes.json` 的 dev 段；支持 `YUNGAME_DATA_DIR` 覆盖） |
| 路径 | `data-dir.mjs` | 给 cmd 用的薄壳：打印数据根 / 权威库 / 运行时副本（bat 侧入口是仓库根的 `data-dir.bat`） |

## 数据目录：`dev-data/`（开发态）与 `data/`（发布态）

同一个"数据根"概念，两套落点（完整说明见 [出包与发布变体](./release-build.md)）：

| 场景 | 数据根 | 谁在用 |
| --- | --- | --- |
| 开发 / 测试（D 盘） | 仓库内 `dev-data/`（`config.json` 里是相对路径） | `dev-client.bat`、`npm run dev`、网站端 |
| 发布包（X 盘） | exe 同级的 `data/`（由 `build-release.bat` 生成） | 打包后的 `PlayniteUI.exe` |

> 历史：2026-09-14 之前数据根是**打包目录下的 `data` 子目录** —— 打包产物和数据共用一条路径，
> 清一次打包目录就等于清数据，而打包脚本又会反复重写它。现在 `release/` 是纯产物目录
> （整目录不入库、随时可删掉重打），数据在 `dev-data/`，并且这条边界由架构守卫强制
> （源码/文档里再出现旧路径会让 `npm run check` 失败）。

```
<主程序目录>/config.json   # 应用设置 { settings: {...} }（跟主程序走，不在数据目录里）

<数据根>/
├── Admin/library.db      # 权威库（源库）：数据唯一来源，只读（客户端启动时复制给运行时副本）
├── library/library.db    # 运行时副本：所有读写都落这一份
├── CoverImages/          # 封面图（用户丢图自动匹配；本机 config.json 里指向 D 盘独立目录）
├── Game_Details/         # 详情页静态页 + 「修改器」「游戏存档」子目录（同上，可指向别处）
├── announcements/        # 公告 announcement.html
└── logs/                 # 崩溃日志 / 错误上报限流状态
```

## 路径配置（config.json → settings）

上述目录**都不写死在代码里**，都可以在 `config.json` 的 `settings` 段里改：

| 字段 | 默认 | 作用 |
| --- | --- | --- |
| `coverImagesDir` | `<数据根>/CoverImages` | 封面图目录（读图白名单跟随它） |
| `gameDetailsDir` | `<数据根>/Game_Details` | 详情页 HTML/视频 + 修改器 + 应用存档 |
| `announcementsDir` | `<数据根>/announcements` | 公告目录（`announcement.html`） |
| `libraryDir` | `<数据根>` | 数据库**库根**：运行时副本所在，也是权威库的默认父目录 |
| `sourceLibraryDir` | `<库根>/Admin` | 权威库（源库）**目录**：只读数据来源，运行时副本由它复制 |
| `defaultGameRootPath` | `<数据根>` | 游戏相对路径的基准（见 [启动与路径规则](./launch-and-paths.md)） |
| `gameSaveHelperPath` | 未配置（备份不可用） | 存档备份工具 GameSaveHelper.exe |

**统一语义**（所有 `xxxDir` 字段一致）：

| 配置值 | 结果 |
| --- | --- |
| 未配置 / `""` / 纯空白 | 默认目录 `<数据根>/<默认名>` |
| 绝对路径（`E:/x`、`E:\x`、`//NAS/share`、`\\NAS\share`） | 原样使用 |
| 相对路径 | 以**应用 exe 所在目录**为基准（`electron/core/paths.ts::appRoot()`；开发态 = 工程根） |

> ⚠️ 相对路径**不跟数据根**：数据根本身会被 `YUNGAME_DATA_DIR` / exe 位置改变，拿它当基准会让
> "同一个相对路径"在不同启动方式下指到不同地方，用户没法预期。exe 所在目录才是能自己判断的锚点
> （"就在程序旁边"），这也是绿色便携的本意。
> 因此**同一个值在两种布局下会落到不同位置** —— 这正是"打包版读自己的 `config.json`"的原因：
> 开发态写 `dev-data`（相对工程根），打包版写 `data`（相对 exe 同级），两边指向同一份数据。

**分隔符**：写的规范形式是 `/`（JSON 里不用转义，`//NAS/share/...` 直接写）；`\` 也照样认，
库里现有数据不用改。详见 [启动与路径规则](./launch-and-paths.md) 的「分隔符约定」。

实现是 `shared/pathConfig.ts`（零依赖纯函数 + 单测 `shared/pathConfig.test.ts`）；
网站端 `server/paths.mjs` 是同一套语义的另一份实现，两者有一组 **parity 单测**逐项比对，
改一边忘另一边会直接测失败。`scripts/check-architecture.mjs` 还禁止在解析器之外
用 `path.join` 拼这些目录名。

> ⚠️ 关于 `libraryDir`：只配置**库根**，`Admin/library.db` 与 `library/library.db` 两级
> 结构固定挂在它下面 —— 这样"配置的库"和"被复制的库"永远是同一对文件，数据来源仍然唯一。
> 直接暴露"运行时库文件路径"会破坏这条约束（复制目标可能指向另一个文件），所以不做。

> 详情页目录由内置 HTTP 服务器惰性托管，详见 [游戏静态详情页](./game-details.md)。
