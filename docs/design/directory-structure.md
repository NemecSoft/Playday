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
├── public/              # 静态资源（字体、图标）
├── locales/             # 打包用语言文件
├── release/             # 打包产物 + 便携数据（data/）
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
└── package.bat          # 打包便携 exe
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
| `components/` | UI 组件（TopBar、Sidebar、Toolbar、GridView、PlanetView、AnnouncementWindow、设置弹窗等） |
| `pages/` | 路由页面（`GameDetailPage`） |
| `stores/` | Zustand 状态（games / settings / library / ui / auth / imageProgress / scroll） |
| `hooks/` | 自定义 hooks（`useVirtualGrid`、`useLazyImage`） |
| `utils/` | 纯逻辑（搜索、主题、封面、planet 分区、assets 图片缓存） |
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
| `server.mjs` | Node 内置 http 后端（零依赖），复用 `release/data` 同一份数据，实现 `/api/<cmd>`、`/CoverImages/*`、`/Game_Details/*`、静态 `dist/` |

## 脚本 `scripts/`

| 类别 | 脚本 | 说明 |
| --- | --- | --- |
| 生成 | `gen-tray-icon.mjs` | 生成 16x16 高对比托盘图标 `public/icons/tray.png` |
| 迁移 | `migrate-cover-paths.mjs` | 迁移数据库封面路径 |
| 迁移 | `migrate-cover-to-release.mjs` | 封面迁移到 release/data |
| 迁移 | `migrate-from-release.mjs` | 从 release 迁移数据 |
| 迁移 | `migrate-libs-to-db.mjs` | 游戏库从 config.json 迁移到数据库表 |
| 校验 | `verify-*.mjs` / `inspect-*.mjs` | 数据库/迁移结果校验 |

## 数据目录 `release/data/`

绿色便携模式：数据放 exe 同级的 `data/`，单一数据源。

```
data/
├── config.json           # 应用设置 { settings: {...} }
├── library/library.db    # sql.js 数据库（games/users/game_libraries/platform）
├── CoverImages/          # 封面图（用户丢图自动匹配）
├── Game_Details/         # 游戏静态详情页目录（可用 settings.gameDetailsDir 改到其它绝对路径）
└── announcements/announcement.html  # 公告文件
```

> 详情页目录可通过 `config.json` 的 `settings.gameDetailsDir` 覆盖（默认用这里的 `Game_Details`），由内置 HTTP 服务器惰性托管，详见 [游戏静态详情页](./game-details.md)。
