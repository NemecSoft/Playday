# Playday 整体架构

## 技术栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 桌面框架 | **Electron ^32** | Chromium + Node，主进程承载后端与系统能力，渲染进程承载 React 前端 |
| 前端 | React 18 + TypeScript 5 + Vite 5 | Vite 构建产物输出到 `dist/`，由 Electron 加载 |
| 状态管理 | Zustand 5（UI/本地状态）+ TanStack Query 5（服务端缓存） | 分工明确 |
| 路由 | react-router-dom v6（HashRouter） | 客户端/管理端共用同一套路由 |
| 样式 | 纯手写 CSS（`global.css` + `tokens.css`，CSS 变量多主题） + Tailwind | 主题/风格由 themeLibrary/styleLibrary 驱动 |
| 存储 | **sql.js（SQLite WebAssembly）** | 游戏库 / 用户 / 游戏库（根目录）/ 平台 |
| 设置 | `config.json`（JSON 文件，不进数据库） | 语言 / 主题 / 风格 / 登录 / 布局等 |
| 国际化 | i18next + react-i18next | 英语(en-US) / 简体中文(zh-CN) / 繁體中文(zh-TW) |
| 打包 | electron-builder | 便携绿色版（免安装，见 [electron-builder.yml](../../electron-builder.yml)） |

> **双端（一套代码）**：桌面端（Electron IPC）与网站端（Node `server/server.mjs` HTTP）共用
> `src/` 同一套前端源码、复用同一份数据，切换只在传输层 `src/api/ipc.ts` 一处（见 [双端架构](./dual-end.md)）。

## 进程模型（Electron）

```
┌─────────────────────────────────────────────────────────────┐
│  主进程（Node）  electron/main.ts                            │
│  ├─ electron/config.ts            命名/版本配置              │
│  ├─ electron/core/*               后端逻辑（db/process/…）   │
│  ├─ electron/ipc/*                IPC 命令注册（ipcMain）    │
│  ├─ electron/windows.ts           三个 BrowserWindow 工厂    │
│  └─ electron/preload.ts           注入 window.ipc            │
└───────────┬─────────────────────────────────────────────────┘
            │ ipcRenderer（contextBridge）
┌───────────▼─────────────────────────────────────────────────┐
│  渲染进程（Chromium） src/*  React 18                        │
│  src/api/ipc.ts  (invoke/call 传输层)                        │
│  src/api/client.ts（类型化命令封装）                         │
│  src/components · src/pages · src/stores · src/utils        │
└─────────────────────────────────────────────────────────────┘
```

- **主进程**：负责数据库（sql.js）、设置、进程启动、封面、托盘、公告、窗口创建、IPC 命令注册。
- **渲染进程**：纯 React 前端，不直接碰数据库，所有读写经 `api` 层转发。
- **preload**：通过 `contextBridge` 暴露 `window.ipc`（`invoke` / `send` / `on`），是渲染进程访问主进程的唯一通道。

## 模块划分

### 主进程（`electron/`）

| 模块 | 职责 |
| --- | --- |
| `main.ts` | 应用入口，创建窗口、注册 IPC、托盘、系统菜单清理、`enterSystem()` 流程 |
| `config.ts` | 从 `build.config.ts` 读取应用名/版本等配置 |
| `preload.ts` | 暴露 `window.ipc` 给渲染进程 |
| `core/paths.ts` | 数据根定位（`configRoot()`：环境变量 → exe 同级 data → 项目根） |
| `core/db.ts` | sql.js 数据库访问层（建表、CRUD、`persist()` 落盘） |
| `core/models.ts` | 数据模型（`Game`、`AppSettings` 等） |
| `core/settings.ts` | 设置读写（`config.json`） |
| `core/auth.ts` | 登录/权限（用户等级）、企业用户 IP 匹配 |
| `core/covers.ts` | 封面图库匹配、图片读取 |
| `core/tags.ts` | 自动标签 |
| `core/process.ts` | 游戏进程启动、时长追踪 |
| `core/scriptRunner.ts` | 脚本启动（pre/post launch/exit） |
| `core/tray.ts` | 托盘图标 + 右键菜单 |
| `core/gameServer.ts` | 静态详情页容器（本地 HTTP 服务器） |
| `ipc/*.ts` | 各领域 IPC 命令注册（games/covers/auth/admin/announcement/gameHtml/system/register） |

### 渲染进程（`src/`）

| 目录 | 职责 |
| --- | --- |
| `api/ipc.ts` | 传输层：桌面走 `window.ipc`，网站走 `fetch /api/*` |
| `api/client.ts` | 类型化命令封装 |
| `components/` | UI 组件（顶栏、侧边栏、工具栏、视图、设置、公告窗口等） |
| `pages/` | 页面组件（如 `GameDetailPage` —— 2026-09-15 起它是**选项卡内容**、不再是路由页面，见 [顶层选项卡](./main-tabs.md)） |
| `stores/` | Zustand 状态（games/settings/library/ui/auth 等） |
| `utils/` | 纯逻辑（搜索、主题、封面、planet 分区等） |
| `i18n/` | 国际化配置 + `locales/` 三语字典 |
| `types/` | TypeScript 数据模型 |
| `styles/` | 全局样式，CSS 变量驱动多主题 |

### 网站端（`server/`）

`server/server.mjs`：Node 内置 http（零依赖），复用同一份 `library.db` / `config.json` / `CoverImages` / `Game_Details`，提供 `/api/<cmd>`、`/CoverImages/*`、`/Game_Details/*`、静态 `dist/`。数据目录与桌面端**走同一套配置**（`config.json` 的 `coverImagesDir` / `gameDetailsDir` / `announcementsDir` / `libraryDir`，见 `server/paths.mjs`）。**网站版不支持启动游戏**，仅只读浏览/登录/封面/详情。

## 数据流

```
React UI (src/components)
    │  api.getGames() 等
    ▼
src/api/client.ts → src/api/ipc.ts
    │   桌面: window.ipc.invoke(cmd)     网站: fetch POST /api/<cmd>
    ▼
后端（桌面: electron/ipc/* 或 网站: server.mjs handleApi）
    │
    ▼
sql.js (library/library.db) / config.json / 文件系统 / 进程启动
```

前端不直接接触数据库；所有读写经传输层走对应后端。状态在 React 侧用 Zustand 维护，由命令返回结果驱动更新。

## 窗口管理

三个窗口，共用同一份 `dist/index.html`，靠 URL query `?window=` 区分：

| 窗口 | 创建函数 | 触发方式 | 渲染内容 |
| --- | --- | --- | --- |
| 客户端主窗口 | `createMainWindow()` | 正常启动 | `<App />`（游戏库主界面） |
| 公告窗口 | `createAnnouncementWindow()` | 正常启动先弹 | `<AnnouncementWindow />`（点"进入系统"进主窗口） |
| 管理端窗口 | `createAdminWindow()` | `--admin` 参数 | `<App />` 内管理界面 |

> 客户端启动流程：先公告窗口 → 点"进入系统" → 调 `enterSystem()` 关闭公告、创建主窗口。
> 管理端（`--admin`）不经过公告，直接打开管理窗口。

## 关键设计决策

1. **绿色便携存储**：`configRoot()` 优先用 exe 同级 `data` 目录（便携模式），不写注册表、不用 C 盘。
2. **双端一套代码**：传输层抽象，前端零分叉。
3. **无边框窗口**：`frame:false` + 前端 TopBar 自定义标题栏/窗口控制。
4. **托盘**：`enableTray` / `minimizeToTray` / `closeToTray` 设置，最小化/关闭到托盘。
5. **单一数据源**：游戏数据只存数据库（`Admin/library.db` 权威库），不散落在 config.json。
   （原「游戏库 `game_libraries` 表」已于 2026-09-16 废弃移除；启动路径只有"绝对路径 / `{InstallDir}\…`"两种形态。）
6. **React 18 + react-router v6**：避开 v7 与 React 19 的内部兼容问题。
7. **详情页惰性加载**：游戏详情页本地 HTTP 服务器不在启动时预启动，改为第一次打开详情页时经 `get_game_server_url` 惰性启动（见 [游戏静态详情页](./game-details.md)）。
8. **主题与配色解耦**：主题（视觉风格）只保留苹果 / 浮雕 / 机械感 3 个，且**只做形状与质感、不含颜色**；配色（调色板）全部保留、独立于主题。主题与配色互不冲突（见 [主题与配色规范](./themes-styles.md)）。
9. **多人氛围营造**：通过 provider 抽象层实现"在线用户 / 弹幕 / 活动流"——默认用随机模拟（mockProvider），预留真实后端（realProvider）可无缝切换（见 [多人氛围营造](./community-atmosphere.md)）。
10. **管理端本地网站化**：管理端不再用 Electron GUI 窗口，改为"本地网站"形式——Node http + sql.js 读写权威库，浏览器访问管理页面（复用 admin/src 前端），需 admin 令牌认证（见 [双端架构](./dual-end.md)）。
11. **背景音乐**：目录可配置、随机循环、进主界面自动播放；音频文件走**本地 HTTP 服务器**（`/music/*`）而不是 `file://`，与自带字体同一套理由（见 [背景音乐](./background-music.md)）。
12. **自带字体与字号**：字体来自可配置的 fonts 目录（不依赖系统字体）；"字体大小"是构建期给每处 `font-size` 乘 `--ui-font-scale`，**只放大文字、不动界面尺寸**（见 [主题与配色规范](./themes-styles.md) 第六节）。

## 键盘快捷键

键位选择的总原则：**照抄 Chromium**（本项目就是个 Electron 浏览器壳，用户对 Home / End / PageUp /
PageDown / 空格 / Alt+← 的预期就是浏览器那套），而不是自己发明一套。

| 快捷键 | 作用 | 实现位置 |
| --- | --- | --- |
| `Ctrl+Home` / `Home` | 滚到最上面（**Ctrl 版本在搜索框里也生效**，见下） | `src/hooks/useGlobalShortcuts.ts` |
| `Ctrl+End` / `End` | 滚到最下面（同上） | 同上 |
| `PageUp` / `PageDown` | 翻上一屏 / 下一屏（一屏 = 可视高 − 40px，同 Chromium） | 同上 |
| `Space` / `Shift+Space` | 翻下一页 / 上一页（浏览器习惯） | 同上 |
| `Alt+←` / `Alt+→` | 后退 / 前进（主页 ↔ 游戏详情） | 同上 |
| `/` 或 `Ctrl+F` | 聚焦搜索框 | `src/components/Toolbar.tsx` |
| `Ctrl+滚轮` | 整页缩放（临时，不写设置） | `src/components/ZoomIndicator.tsx` |
| `Alt+滚轮` | 调封面大小（连带每行列数） | `src/components/views/GridView.tsx` |
| `F11` | 全屏切换 | `src/components/TopBar.tsx` |
| `Esc` | 关闭设置弹窗 | `src/components/settings/SettingsModal.tsx` |

设计规则（都是踩过的坑，别绕过）：

1. **判定与 DOM 分离**：键位映射 / 翻页步长 / "该不该让键"都是纯函数，放在
   `src/utils/keyboardScroll.ts`，单测在 `src/utils/__tests__/keyboardScroll.test.ts`；
   hook 只负责装监听与派发。这样加键位 = 改一处纯函数 + 加一条测试。
2. **滚谁由"焦点 → 指针"决定**（`resolveScrollTarget`）：焦点所在的可滚区优先（侧栏、详情页各滚各的），
   其次是指针下的可滚区；**有弹窗时只滚弹窗内部**——否则指针停在背景网格上按 PageDown，
   会出现"弹窗没动、后面的列表滚了"。
3. **绝不抢键**：输入框 / 文本域 / 可编辑区里的 Home/End/空格属于输入框；
   焦点在按钮上时空格是"激活按钮"；`Ctrl+Space`（输入法切换）、`Ctrl+PageUp/PageDown`（浏览器切标签页）
   一律不拦；`Alt` / `Win` 组合键留给别的功能。
   两处**刻意偏离浏览器**（都有单测钉住）：
   - `Ctrl+Home` / `Ctrl+End` 即使在搜索框里也照样滚列表 —— 浏览器里它们是"光标移到开头/结尾"，
     但本应用要的是"一键到最上/最下"，而"搜完想回列表顶部"正是焦点还在搜索框时最常发生的场景。
   - **单行 `<input>` 里的 `PageUp` / `PageDown` 也照样滚列表**（`pageKeysBelongToField`）：
     单行输入框对这两个键没有任何行为，而 Chromium 的默认滚动是"焦点元素的可滚祖先"，
     焦点在工具栏里时找不到，`html`/`body` 又都是 `overflow: hidden` —— 结果什么都不滚
     （症状就是"按 PageUp/PageDown 完全没反应"）。`textarea` / `select` / 可编辑区自己有滚动区，
     照旧让回去；`Home` / `End` / 空格在任何输入控件里都让回去。
4. **尊重 `prefers-reduced-motion`**：减弱动效时用瞬时滚动，不做平滑动画。
5. **虚拟列表的"到最下面"要下一帧再校一次**：总高度会随"行被真实测量"而变大，
   平滑滚动的目标一旦小于新高度就停在半路（症状：`Ctrl+End` 到不了底、像只往下挪一屏）。
   同理，`GridView` 里**不能把 `items.length` 当 `virtualizer.measure()` 的依赖** ——
   滚到列表顶/底时渲染窗口本来就会被裁小、这个值必然变化，全量重测会丢掉真实行高、
   改变总高度，把正在进行的平滑滚动打断/夹回（症状：按 `PageDown` 像没反应）。
   列数/行高变化由 `useVirtualGrid` 内部 `allRows.length` 那条 effect 覆盖。
