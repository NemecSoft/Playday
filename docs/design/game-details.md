# 游戏静态详情页（Game Details）设计

## 概述

每个游戏可以有一个**独立的静态详情页**（HTML 页面，含玩法说明、截图、视频等），放在本机某个目录下按"每游戏一个子目录"组织。前端打开游戏详情时，用一个内置的本地 HTTP 服务器把这个页面托管出来，浏览器/WebView 就能正常加载其中的 css/js/图片/视频，并支持锚点跳转。

这是对原版 Playnite 详情页能力的移植，采用"静态文件 + 本地 HTTP 托管"的成熟方案（类似本地文档服务器 / 静态站生成器，避免把 HTML 直接塞进前端 iframe 而丢失资源加载与相对路径能力）。

## 核心配置：`gameDetailsDir`

### 含义

`AppSettings.gameDetailsDir?: string` 指定"游戏静态详情页目录"：

- **留空 / 未设置** → 用默认目录 `<数据根>/Game_Details`。
- **设置为绝对路径** → 详情页整体改从该目录读取（HTML + 视频都由内置 HTTP 服务器托管该目录）。

字段定义位置：

| 层 | 文件 | 内容 |
|----|------|------|
| 主进程模型 | `electron/core/models.ts` | `AppSettings.gameDetailsDir?: string`（默认 `undefined`） |
| 前端类型 | `src/types/models.ts` | 与主进程对齐 |
| 前端 store | `src/stores/settingsStore.ts` | 默认 `undefined` |

配置持久化在 **`config.json` 的 `settings` 段**，**不存数据库**。例如：

```json
{
  "settings": {
    "gameDetailsDir": "D:/Addons"
  }
}
```

### 读取逻辑

主进程 `electron/core/paths.ts`：

```ts
// 游戏静态详情页目录。
// 默认是 <数据根>/Game_Details；如果用户设置了 gameDetailsDir（config.json），
// 则整体替换为该绝对路径（HTML + 视频都由内置 HTTP 服务器托管该目录）。
export function gamesHtmlDir(): string {
  return configuredDetailsDir() ?? path.join(configRoot(), "Game_Details");
}
```

`configuredDetailsDir()` 直接解析 `config.json`（**不 import `settings.ts`，避免 `paths ↔ settings` 循环依赖**），仅当值是合法绝对路径时才采用，否则回退默认。

> **生效时机**：`gameDetailsDir` 在详情页服务器启动时读取一次。设置 UI（`GeneralSection.tsx`）有明确提示"修改后需重启应用生效"。

### 设置入口

`src/components/settings/GeneralSection.tsx` 提供"游戏详情页目录"输入框：

- 输入绝对路径 → 点"应用目录" → `save({ gameDetailsDir })`（空串则存 `undefined` 恢复默认）。
- 点"恢复默认" → 清空并保存 `undefined`。

## 目录组织约定

详情页根目录下，**每个游戏一个子目录**，子目录名优先用**游戏 id**，其次用**游戏名**：

```
<详情页根>/
├── <游戏id>/           # 优先（id 稳定、无重名）
│   └── index.html
└── <游戏名>/           # 兜底（按名匹配，兼容无 id 场景）
    └── index.html
```

对应查找函数 `electron/ipc/gameHtml.ts::gameHtmlPagePath()`：

```ts
const idCandidates = [gameId, gameName];
for (const c of idCandidates) {
  const p = path.join(root, c, "index.html");
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
}
return null; // 前端显示"未找到详情页"
```

> **同一目录还承载"修改器"**：`electron/ipc/trainer.ts` 用同样的"id → 游戏名"规则，在该游戏子目录下找 `修改器/` 子目录来发现修改器 exe。因此 `gameDetailsDir` 一旦改到 `D:/Addons`，修改器目录也一并跟随。

## 本地 HTTP 服务器：`electron/core/gameServer.ts`

详情页由**内置的本地 HTTP 服务器**托管（Node 内置 `http`，零依赖，不引 express）。它负责：

- 把 `<详情页根>/<游戏名>/` 下的静态文件以 `/games/<游戏名>/<相对路径>` 的 URL 暴露出来。
- 支持 **Range 请求**（视频拖动播放关键），读文件流式返回。
- 提供 `/api/videos` 动态接口，列出某游戏 `videos/` 文件夹下的视频（含子目录分组）。
  扫描/分组/排序逻辑在 `electron/core/videoLibrary.ts`，与详情页前端用的 `get_game_videos` 是同一份。
- 防路径穿越：不允许 `..` 或绝对路径段，保证不越出详情页根目录。

### 启动时机：惰性启动（重要）

**服务器不在应用启动时预启动**，而是**第一次打开详情页时**才启动，以缩短应用启动时间。这是 2026-08-19 的优化改动。

具体链路：

1. `electron/main.ts` 启动时**不再**调用 `startGameServer()`（只在退出时 `stopGameServer()` 兜底关闭）。
2. 前端 `GameDetailPage.tsx` 打开详情页时调用 `api.getGameServerUrl()` → 主进程 `get_game_server_url` IPC。
3. 该 IPC 处理函数（`electron/ipc/gameHtml.ts`）判断服务器是否已启动：
   - 已启动 → 直接返回已有 base URL（`startGameServer` 内部有 `if (server) return baseUrl` 守卫，重复调用安全）。
   - 未启动 → `await startGameServer(gamesHtmlDir())` 现场启动，返回新 URL。
   - 启动失败 → 返回空串，前端 `gamePageUrl` 为空，优雅降级（不显示详情页 iframe），不崩溃。

```ts
registerCommand(ipc, "get_game_server_url", async () => {
  if (getGameServerBaseUrl()) {
    return getGameServerBaseUrl();
  }
  try {
    return await startGameServer(gamesHtmlDir());
  } catch (e) {
    console.error("[get_game_server_url] 惰性启动详情页服务器失败:", e);
    return "";
  }
});
```

> 前端拿到 base URL 后，拼出页面地址：`${serverUrl}/games/${encodeURIComponent(game.name)}/index.html`。

## 本地视频（游戏目录下的 `videos/`）

详情页还会把该游戏的**本地视频罗列在页面里**（排在页面原有内容的下面）。约定是放在游戏目录下的 `videos/`：

```
<详情页根>/<游戏名>/videos/             ← 直接放这里的排在最前面
<详情页根>/<游戏名>/videos/实况/         ← 子文件夹就是一组（组标题 = 目录名）
```

- **即插即用**：视频丢进 `videos/` 就出现在页面里。不改数据库、不改详情页 HTML、不用重启
  （每次打开详情页重新扫一次，响应带 `Cache-Control: no-store`）。
- **排版**：bilibili 式的**卡片网格**（响应式 `auto-fill minmax(230px, 1fr)`）——
  上面预览封面 + 右下角时长，下面两行标题；点卡片**就地展开播放器**（占满整行，同一时刻只放一个），
  再点"收起"复原。
- **预览封面**三级兜底（谁先有就用谁）：

  | 优先级 | 来源 | 谁来做 |
  |---|---|---|
  | ① | 与视频**同名的图片**（`1.mp4` 旁边的 `1.jpg/.jpeg/.png/.webp`） | 服务端发页面时直接给 `src`（`findVideoPoster()`） |
  | ② | 没有同名图片 → **就地抓视频的一帧**放进 `<video>`+canvas（同一来源，画布不会脏） | 页面里的注入脚本（顺带把时长填进角标） |
  | ③ | 抓不到（编码不支持 / 元数据读不出）→ 深色占位块 + 播放按钮 | —— |

  为什么不抽帧交给 ffmpeg：本项目零原生依赖（绿色打包），而"抓一帧"浏览器自己就会做。
- **排序**：自然序 —— `实况2.mp4` 排在 `实况10.mp4` 前（`electron/core/videoLibrary.ts`）。
- **目录解析规则**与详情页 / 修改器 / 应用存档一致：优先游戏 id 子目录，其次游戏名子目录
  （统一在 `electron/core/gameDirs.ts`，不再各写一份）。
- **放不了的封装**（`.mkv` / `.flv` / `.avi` / `.mov`）：Chromium 解不了这类容器，卡片上标注
  "可能需外部播放器"、也不去抓帧，点击请主界面用系统默认播放器打开（`shell.openPath`），
  不甩给用户一个必然黑屏的播放器。能用内置播放器的只有 `.mp4` / `.m4v` / `.webm` / `.ogv`
  （判定：`isWebPlayable()`）。
- **内置播放器：DPlayer**（2026-09-14 换掉原生 `<video controls>`；随包发布，见 `vendor/README.md`）
  - **为什么换**：原生控件是 shadow DOM —— 做不出"页面全屏 + 全屏"**并排**的按钮，菜单里的
    "下载"也只能用 `controlsList=nodownload` 整个关掉。用户要的就是那种（B 站式的）手感。
    注：B 站自己的网页播放器是**闭源混淆**的（社区那些"B 站播放器"都是反混淆产物），
    他们开源的是 flv.js / mpegts.js 那套流媒体库 —— 本地 mp4 一个都用不上。
  - **随包与路由**：`vendor/DPlayer.min.js`（1.27.1，MIT，304,629 字节，SHA256 见 `vendor/README.md`）
    由本地服务器按 `/vendor/<文件名>` 发出（`electron/core/vendorAssets.ts`：只放行裸文件名 +
    `.js`/`.css` 白名单，防穿越）；打包由 `electron-builder.yml` 的 extraResources 带到
    `resources/vendor`。注入的 `<script src="/vendor/DPlayer.min.js">` 必须是**同源绝对路径**
    （页面在 `/games/<目录名>/index.html`，相对路径会解析到游戏目录里去）。经典脚本按文档顺序
    执行，所以紧随其后的内联脚本里可以直接用 `DPlayer`。
  - **藏掉本地视频用不到的控件**（没有弹幕源、也不用无线投屏）：`.dplayer-send-icon` /
    `.dplayer-comment-icon` / `.dplayer-comment-setting-icon` / `.dplayer-airplay-icon`。
    留下的就是：播放/暂停、进度、时间、音量、倍速设置、**页面全屏、全屏**（DPlayer 原生的
    两个按钮并按，就是我们最初想要的位置）。
  - **「页面全屏」键默认是藏起来的**（它自带的 `display:none` + 悬停全屏键才浮出、且飘在它上方
    30px）。我们只改**它自己**的 `display`/`position` 让它常显并排 —— ⚠️ **别去改父容器
    `.dplayer-full` 的 display**：改成 flex 会让旁边的「设置」齿轮错位 6px（实测：齿轮
    y=743/底 781，两个全屏键 y=737/底 775，用户报的"三个按钮高度不一致"就是这个；改回行内流后
    三个图标统一 y=737、40x38、底 775）。
  - **网页全屏的定位由我们接管**：DPlayer 自己会给 body 加 `.dplayer-web-fullscreen-fix`
    （`position: fixed`），可模板里一旦有祖先带 `transform`，`fixed` 的包含块就不再是视口 ——
    真引擎实测播放器只有 **550x482**（窗口 1200x800）。所以借它的 `webfullscreen` /
    `webfullscreen_cancel` 事件，把播放器容器搬进挂在 body 上的 `.yungame-player-overlay`。
    实测：进全屏后播放器 = **1200x800 @(0,0)**、锁页面滚动；退出后回到卡片 **866x496**。
  - **退出时必须自己清这两个类**：`.dplayer-fulled`（在播放器上）与
    `dplayer-web-fullscreen-fix`（在 body 上）。聚焦探针实测：调它的 `fullScreen.cancel()`
    **不会**清它们（调用前后 DOM 状态一点没变），留着会让缩略图塌成 0 高、播放器变成
    302x375；手动清掉后立刻恢复 866x496。成因是我们中途搬走过容器，它自己的簿记对不上。
    另外 **DPlayer 的键盘热键里没有 Esc**（只有空格 / ←→ / ↑↓ / M / F），Esc 退出是我们加的。
  - **收起卡片**：`dp.destroy()` **不摘自己的 DOM**（实测收起后 `.dplayer` 与容器都还在），
    所以 closeCard 把整块容器一起移除；同时显式 `pause()` 一次，好让父页面收到停止通知、
    背景音乐恢复（跨源 iframe 收不到 `<video>` 事件，全靠 `postMessage`）。
  - **兜底**：`typeof DPlayer !== "function"` 时（`/vendor/` 路由挂了 / 模板自己的 CSP 挡了外部
    脚本）退回原生 `<video controls>` —— 少两个按钮，但不能"点了卡片什么都不出来"。
  - **取舍：没有画中画按钮**（1.27.1 没做），原生的画中画按钮因此没了；右键视频理论上还能用
    Chromium 自带菜单里的画中画。想要按钮就得自己补一个（或换控件可完全自定义的库，如 ArtPlayer）。
  - **验证方式（动播放器必跑）**：真 Electron 引擎 + 带 `transform` 的假详情页跑**完整链路**
    （真实注入产物 + 真实 `/vendor/` 路由 + 真实 mp4）—— ① 控制条有"页面全屏/全屏"且无下载项
    ② 能播、能拖（Range）③ 页面全屏真的铺满窗口并锁滚动 ④ 再点/ Esc /「收起」都干净退出、
    无残留、无控制台报错。单测（`electron/core/gameDetailInject.test.ts`）钉住产物里的这批约定，
    防止谁顺手改回去。
  - **为什么是"搬 DOM"而不是"给缩略图加 `position: fixed`"（2026-09-14 实测）**：
    旧写法（`.is-pagefull .yungame-video-thumb { position: fixed; inset: 0 }`）在真实模板页里失效 ——
    现象是缩略图缩成**一条细长黑条、视频被挡在后面**。成因未逐一坐实（最可能是祖先的 `transform`
    让 `fixed` 的包含块不再是视口，`inset` 也就失去了意义），但**换法本身不依赖模板布局**：
    覆盖层的祖先只有 `body`。验证方式：真 Electron 引擎 + 一个"容器带 `transform`"的假详情页，
    `getBoundingClientRect()` 与 `elementFromPoint()` 实测 —— 覆盖层/视频 = 整窗、
    中心命中的是 `VIDEO`、**覆盖层里的退出键也点得到**、Esc 后视频搬回卡片。
    按钮会搬出卡片，所以点击监听从 `root` 挪到了 `document`，控件样式也不再挂在
    `.yungame-videos` 下面（搬出去后那层选择器就失效了）。

### 怎么"进"到页面里：服务端注入（关键设计）

详情页是 **iframe 里的独立静态页面**，与主界面**跨源** —— 父页面既塞不进 DOM、也收不到它的
`<video>` 事件。所以视频区块由**本地 HTTP 服务器在发 `index.html` 这一步注入**
（`electron/core/gameDetailInject.ts`）：

| 环节 | 做法 | 为什么 |
|------|------|--------|
| 注入点 | 优先插进页面自己 `.container` 的**内部末尾**（排在所有 `.section` 之后） | 直接放 `</body>` 前会跑到居中容器之外：宽度、留白全对不上，与上面的卡片错位 |
| 退路 | 没有 `.container` → `</body>` 前自己补一层；连 `</body>` 都没有 → 追加末尾 | 模板千奇百怪，宁可难看也不能丢内容 |
| 链接 | **相对路径** `videos/<编码后的文件名>` | 页面地址是 `/games/<目录名>/index.html`，相对路径自动解析正确 —— 不用在这里再判断"目录名是 id 还是游戏名" |
| 样式 | 外壳复用页面自己的 `.section`，只补视频相关的 scoped 类（`yungame-*`） | 跟着页面原有观感走；换模板也不会花 |
| 文案 | 服务端一份小表，语言由 iframe URL 的 `?lang=` 带过来 | 注入的是静态页，主进程读不到打包后的 `locales/*.json`（那些被编进前端 bundle） |
| 只注入首页 | 只有 `<游戏名>/index.html` 会注入，更深层的 `index.html` 不动 | 游戏页面自己的子目录不该被改 |

### 主界面怎么配合

| 需求 | 做法 |
|------|------|
| 顶栏**不再有**视频入口（2026-09-14 需求） | 视频区块由注入脚本放进详情页 HTML，**页面自己就显示**，app 侧再来一个"滚过去"的按钮是重复的，已删除（连同注入脚本里那个 `playday-scroll-to-videos` 监听）。`get_game_videos` 仍要调用：它是下面两条逻辑的数据来源 |
| 修改器 / 应用存档入口**按内容显隐**（2026-09-14 需求） | `修改器/`、`游戏存档/` 目录里没有 `.exe`（目录不存在、为空、或扫描失败都算）→ **不显示**对应按钮 —— 空入口只会让人白点。判据就是 IPC 返回的列表长度（`trainer.ts` / `saves.ts` 在目录缺失时都返回 `[]`） |
| 播视频时暂停背景音乐 | 注入脚本在 `play` / `pause` / `ended` 时 `parent.postMessage` 通知主界面（`playday-video-play` / `playday-video-stop`），主界面据此让音乐让位/恢复（见 [背景音乐](./background-music.md) 第七节） |
| mkv/flv 这类要系统播放器 | 注入脚本发 `playday-video-external` + `rel`，主界面用 `get_game_videos` 里的 `absPath` 调 `open_video_external`（iframe 里拉不起系统播放器） |
| 顶栏**正中**加「开始游戏」（2026-09-15 需求） | 按钮**绝对居中**（`absolute left-1/2 -translate-x-1/2`）：左边「返回 / 修改器 / 应用存档」有几个都不影响它落在正中间（用 flex 顺序会被挤偏）。点击走 `launchGame()`，与卡片 / 右键菜单同一条链路；**游戏运行中也照旧可点**（用户要求"不要太严格"，点了就是再启动一次）。显示条件 = `authStore.loaded && canPlay(userLevel, game.gameLevel)` —— 黄金版看钻石版游戏不渲染，规则见 [用户等级检测](./user-level-detection.md) |

> 与顶部"视频"tab 的区别：那个 tab 读**数据库** `games.videos` 字段（外链 / YouTube 嵌入）；
> 这里读**磁盘上**的 `videos/` 目录。两者互不影响、互不依赖。

## IPC 命令

| 命令 | 作用 | 实现 |
|------|------|------|
| `get_game_html_page` | 返回某游戏详情页本地路径（不存在返回 null） | `gameHtmlPagePath()` |
| `get_game_server_url` | 返回 HTTP 服务器 base URL；未启动则**惰性启动** | `getGameServerBaseUrl()` / `startGameServer()` |
| `list_game_html_dirs` | 列出详情页根目录下有哪些游戏的详情页（管理端诊断） | `readdirSync` + 检查 `index.html` |
| `get_game_videos` | 列出某游戏 `videos/` 里的本地视频（外部播放要用的绝对路径；也是"播视频时音乐让位 / 顶栏已不再显示数量徽章"的数据来源） | `resolveGameSubpath()` + `scanVideos()` |
| `open_video_external` | 用系统默认播放器打开某个视频（内置放不了的封装走这条） | `shell.openPath` |

## 双端差异

| 能力 | 桌面端（Electron） | 网站端（`server/server.mjs`） |
|------|:---:|:---:|
| 详情页托管 | 本地 HTTP 服务器 `gameServer.ts` | `/Game_Details/*` 静态路由 |
| 目录 | `gamesHtmlDir()`（默认 `<数据根>/Game_Details`） | 与桌面端同一套解析（`server/paths.mjs` 读 config.json 的 `gameDetailsDir`） |
| 惰性启动 | ✅（第一次打开详情页时） | 网站端服务器常驻，无此概念 |
| `get_game_html_page` | ✅ | ✅ |
| `get_game_server_url` | ✅ | 网站端无此命令（页面直接同源访问 `/Game_Details/*`） |

> 网站端 `server.mjs` 直接以静态路由 `/Game_Details/*` 托管同一份详情页，不依赖桌面端的内置 HTTP 服务器。
> ⚠️ 因此**网站端没有视频注入**（那是桌面端本地服务器在发文件时做的）：网吧客户端不受影响，
> 若哪天要让网站端也显示这些视频，需要在 `server.mjs` 里做同样的一次注入（`gameDetailInject` 是纯函数，可直接复用）。

## 相关文件索引

| 文件 | 职责 |
|------|------|
| `electron/core/paths.ts` | `gamesHtmlDir()` / `configuredDetailsDir()` 解析详情页目录 |
| `electron/core/gameServer.ts` | 本地 HTTP 服务器（静态托管 + Range + videos API） |
| `electron/core/gameDirs.ts` | "优先游戏 id、其次游戏名"的目录解析（详情页 / 修改器 / 存档 / 视频共用） |
| `electron/core/videoLibrary.ts` | 视频扫描 / 分组 / 自然排序 + "能否内置播放"的判定（HTTP 与 IPC 共用） |
| `electron/core/gameDetailInject.ts` | 把「游戏视频」区块注入到详情页 HTML（注入点、样式、脚本、文案） |
| `electron/ipc/gameHtml.ts` | 详情页相关 IPC（含惰性启动 `get_game_server_url`） |
| `electron/ipc/trainer.ts` | 复用详情页目录发现修改器 |
| `electron/ipc/gameVideos.ts` | 视频列表 IPC + 用系统播放器打开 |
| `src/pages/GameDetailPage.tsx` | 前端打开详情页、拼 URL、懒加载服务器；修改器 / 应用存档入口（**按目录内容决定是否显示**）；视频不再有 app 侧入口 |
| `src/components/settings/GeneralSection.tsx` | `gameDetailsDir` 配置 UI |
| `server/server.mjs` | 网站端 `/Game_Details/*` 静态路由 |
