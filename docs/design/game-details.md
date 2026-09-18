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
├── _shared/            # 框架三件套（shell.html / detail.js / detail.css）+ vendor/
├── <游戏id>/           # 优先（id 稳定、无重名）
│   ├── images/         # 截图（详情页的"游戏截图"就来自这里）
│   ├── 视频攻略&游戏实况/   # 视频（服务器注入"游戏视频"区块时读它）
│   └── …（修改器 / 游戏存档 等）
└── <游戏名>/           # 兜底（按名匹配，兼容无 id 场景）
    └── …
```

> **⚠️ 没有 `index.html` 了**（2026-09-18 起）：详情页改成**按数据现拼**，
> 每个游戏的静态页与 `css/`、`info.json` 全部删除；`<目录>/index.html` 这个路径仍然存在，
> 但它是由服务器**当场拼出来**的（壳页 + 库里的那一行 + 目录里的图片/视频）。

> **⚠️ 版面文件有两份：源在 `scripts/detail-pages/`，运行在 `<详情根>/_shared/`。**
> 两端（桌面端 `electron/core/gameServer.ts`、网站端 `server/server.mjs`）都是从后者实时读的，
> 所以改完源码必须同步一次，否则 git 里是新的、界面上还是旧的，**而且不报错**：
> `npm run detail:sync`（= `node scripts/sync-detail-framework.mjs`，同步 shell.html / detail.js / detail.css / vendor）。
> 好消息：资源是**实时读盘**的，桌面端不用重编译主进程，重新加载详情页即可生效。

对应查找函数 `electron/core/gameDirs.ts::resolveGameDir()`（判断"**目录在不在**"）：

```ts
for (const c of [gameId, gameName]) {          // 优先 id，其次游戏名
  const dir = path.join(root, c);
  if (fs.statSync(dir).isDirectory()) return dir;
}
return null; // 前端显示"详情内容正在建设中"（2026-09-17 起不再显示 404）
```

**判据为什么是"目录"而不是"文件"**：目录里有 `images/`、视频、修改器、存档，文字数据在库里 ——
这些才是"有没有资料"的实质。曾经判据是 `<目录>/index.html` 文件存在性，
静态页一删就**全库被判成"没有资料"**，界面上只剩"《xxx》的详情内容正在建设中"（实测踩过）。
两端必须同一口径：桌面端 `electron/ipc/gameHtml.ts`、网站端 `server/server.mjs` 的
`get_game_html_page` 都返回 `{ path, dir }`（`dir` 供前端拼 iframe 地址 —— 它可能就是游戏 id）。

> **同一目录还承载"修改器"**：`electron/ipc/trainer.ts` 用同样的"id → 游戏名"规则，在该游戏子目录下找 `修改器/` 子目录来发现修改器 exe。因此 `gameDetailsDir` 一旦改到 `D:/Addons`，修改器目录也一并跟随。

## 版面：定版只有一套（2026-09-18 用户定版）

用户原话：*"详情页咱就用这样的版面设计了：上面 封面+说明（可随机左右）；下面 图片+视频+其他
（选项卡也可随机左右）。去掉换版面，直接随机就行了。也就是，不要上下的了。"*

```
┌──────────────────────────────┬──────────────────┐
│ 游戏名 / 原名 / 标签 / 资料行 │                  │
│ 游戏简介                      │      封面        │
├──────────────────────────────┴──────────────────┤
│ ( 游戏截图 ) ( 游戏视频 )      ← 选项卡          │
│ ┌────────────────────────────────────────────┐  │
│ │            大图（当前那张）       [4/8]     │  │  ← 点它开全屏（PhotoSwipe）
│ ├────────────────────────────────────────────┤  │
│ │ [小图][小图][小图][小图][小图][小图][小图]  │  │  ← 全部小图，点一张换大图
│ └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**图片页 = 大图 + 全部小图**（2026-09-18 用户："能全显示出来小图，然后一张一张看大图"）：
用 **Splide 官方的 thumbnails 用法**（主图滑 + 缩略图滑，`isNavigation` 联动 —— 点小图换大图、
大图切换时小图自动高亮），不手写轮播。三件自己的小事：
计数器 `4/8`（Splide 没有原生计数器，只在 `move` 事件里改文字）、
点**大图**开全屏灯箱（PhotoSwipe，索引取主图滑的 `index` —— 大图只有一张，`indexOf` 找不到自己）、
**不用 `cover`**（Splide 的 cover 等于 `object-fit: cover`，会裁图 —— 而"图片绝不裁切"是硬约束）。

- **只有这一套**。曾经有 7 套候选（上下通排 / 海报式 / 沉浸式 / 资料数据页 / 选项卡在右 …），
  按"设计是反复造 → 验证 → 取舍"**全部删除**，连"换个版面""封面左右调换"两个角标按钮也删了 ——
  所以 CSS 里**不该再出现 `html[data-layout="N"]` 这类选择器**（删干净了，别再按编号加回来）。
- **两个方向随机**（每次打开随机一次，写在 `<html>` 属性上，CSS 用 flex 方向/对齐实现 ——
  不改 DOM 顺序，所以不重排内容、不丢滚动位置）：
  * `data-cover-side="left|right"` —— 封面在左还是右；
  * `data-tabs-side="left|right"` —— 选项卡靠左还是靠右。
- 想改成"同一个游戏固定一种"（更像每款游戏有自己的样子），把 `detail.js` 里那两行 `Math.random()`
  换成按游戏名取的稳定哈希即可 —— 这是刻意的取舍点，改起来是一行。

## 本地 HTTP 服务器：`electron/core/gameServer.ts`

详情页由**内置的本地 HTTP 服务器**托管（Node 内置 `http`，零依赖，不引 express）。它负责：

- 把 `<详情页根>/<游戏名>/` 下的静态文件以 `/games/<游戏名>/<相对路径>` 的 URL 暴露出来。
- 支持 **Range 请求**（视频拖动播放关键），读文件流式返回。
- 提供 `/api/videos` 动态接口，列出某游戏**视频目录**（`视频攻略&游戏实况/`，旧名 `videos/` 兜底）下的视频（含子目录分组）。
  扫描/分组/排序逻辑在 `electron/core/videoLibrary.ts`（含目录名候选探测），与详情页前端用的 `get_game_videos` 是同一份。
- 防路径穿越：不允许 `..` 或绝对路径段，保证不越出详情页根目录。

它除了 `/games/`，还有几条"**现取别处资源**"的路由（都不落在详情页根里）：

| 路由 | 取自哪 | 谁在用 | 安全约束 |
| --- | --- | --- | --- |
| `/CoverImages/<文件名>` | config 的 `coverImagesDir`（`core/coverAssets.ts`） | **详情页的封面** —— 页面里只放这一个 URL，不再复制副本 | 只放行裸文件名 + 封面扩展名白名单 |
| `/fonts/<文件名>` | 生效的 fonts 目录（`core/fonts.ts`） | 应用自带字体 | 白名单 + CORS（开发态页面在 5173） |
| `/music/<相对路径>` | config 的 `musicDir`（`core/music.ts`） | 背景音乐 | CORS + Range（能拖进度） |
| `/vendor/<文件名>` | `vendor/`（`core/vendorAssets.ts`） | 内置播放器 DPlayer | 只放行裸文件名 + `.js/.css` |

> `/CoverImages/<文件名>` 这条**路径约定与网站端 `server/server.mjs` 完全一致** ——
> 同一份生成的详情页（`Addons/` 里那些 `index.html`）在桌面端和网站端都要能显示封面。

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

## 本地视频（游戏目录下的 `视频攻略&游戏实况/`）

详情页还会把该游戏的**本地视频罗列在页面里**（排在页面原有内容的下面）。目录名有**两个候选**，
**按顺序探测、谁存在用谁**（`electron/core/videoLibrary.ts` 的 `VIDEO_DIR_NAMES` / `findVideoDir()`）：

```
<详情页根>/<游戏名>/视频攻略&游戏实况/            ← 2026-09-17 起的新名（优先）
<详情页根>/<游戏名>/视频攻略&游戏实况/实况/        ← 子文件夹就是一组（组标题 = 目录名）
<详情页根>/<游戏名>/videos/                      ← 旧名，保留为兜底（老数据没搬完的机器照样能看）
```

- **为什么改名**（2026-09-17 需求）：视频攻略 / 游戏实况的数据量太大，用中文目录名把这一类素材
  跟别的（截图 / 攻略 html / 修改器）分开。需求原话：*"原来叫 videos，但现在数据太大……
  默认用检测是不是有 视频攻略&游戏实况，有就把这个文件夹下的视频罗列出来"* —— 所以是**探测**，
  不加配置项、不加开关。
- ⚠️ **URL 前缀必须跟着"实际命中的那个目录名"走**：页面里的链接是相对路径
  （`<命中目录名>/<编码后的文件名>`），漏了这条就是"界面里什么都没有、控制台一片 404"。
  两个出口都要传：服务端注入（`buildVideoSection({ videoDirName })`）与 IPC
  （`get_game_videos` 的 `urlPath`）。目录名里带 `&`，**必须编码成 `%26`** —— 否则浏览器把它
  当查询串分隔符，路径被截断。
- **即插即用**：视频丢进那个目录就出现在页面里。不改数据库、不改详情页 HTML、不用重启
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
| 链接 | **相对路径** `<命中目录名>/<编码后的文件名>`（目录名由调用方传进来的 `videoDirName` 决定；`&` → `%26`） | 页面地址是 `/games/<目录名>/index.html`，相对路径自动解析正确 —— 不用在这里再判断"目录名是 id 还是游戏名"；但**必须**用真实命中的那个视频目录名，否则整片 404 |
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
> 这里读**磁盘上**的视频目录（`视频攻略&游戏实况/`，旧名 `videos/` 兜底）。两者互不影响、互不依赖。

## 详情页跟随主界面主题（2026-09-15）

详情页模板自带一套**浅色**样式（`body` 是 `#f6f7f9`、卡片 `#fff`、正文 `#222`，见 `D:/Addons/<游戏>/css/style.css`）。
它嵌在深色界面里就是一块白纸（现场反馈"跟外面完全脱节"）。现在**服务器在发页面时把当前主题注入进去**。

**封面版式（2026-09-18 用户要求"封面再大一些，左右占满"）**：模板原本是"封面固定 240px 在左、信息在右"的横排，
现在改成封面独占一整行的 banner ——

```css
.hero { flex-direction: column; }                                  /* 原来没这句（横排） */
.hero-cover { flex: 0 0 auto; width: 100%; }                       /* 原来 flex: 0 0 240px */
.hero-cover img { max-height: 560px; object-fit: cover; object-position: center top; }  /* 原来没有后三项 */
```

为什么 `max-height` + `object-fit`：封面图横竖版都有，竖版占满整行会到 1300+ px 高；给个上限再按顶部裁切，
横版封面基本不被裁。**改的是页面自己的 `css/style.css`**，不是主题注入那条路 —— 那边是"只动颜色"
（`detailTheme.test.ts` 有断言禁止出现 `display:` / `font-size:` / `margin`），而版式属于页面自己的排版资产。
批量改的脚本：`scripts/enlarge-hero-cover.mjs`（默认只预览，`--apply` 才写，`--revert --apply` 回退；
实测 1327 份 `css/style.css` 里 1326 份模板一致，剩 1 份模板不同、脚本会单独报出来跳过）。

| 维度 | 做法 | 为什么 |
| --- | --- | --- |
| 注入时机 | **服务端**发 `index.html` 那一刻（`serveGameDetailIndex`），和视频区块同一处 | 颜色必须在**首帧之前**就是对的。若改成"父页面 postMessage 再改 iframe"，每次打开详情页都会先闪一下它的浅色主题 |
| 主题从哪来 | 渲染层读 `:root` 的**计算值**（`--bg-base` / `--text-primary` / …）→ IPC `set_detail_theme` → 主进程存一份 | 只有渲染层知道当前主题（`themeLibrary` 是 60KB 的 TS 数据，只打进前端 bundle）。读计算值还顺带覆盖了"设主题的每一个入口"（顶栏下拉 / 设置里的配色与风格 / 设计器），不必让每个入口各自记得同步一次 |
| 为什么不塞进 URL（`?lang=` 那条路） | —— | iframe 里的页面会**自己内部跳转**（点标签、"返回全部游戏"），查询串一跳就丢；放主进程状态里则每一页都带上 |
| 注入位置 | `</head>` **之前**（也就是页面自己的 `<link rel="stylesheet">` 之后） | 我们的规则和页面同名同优先级（`.section` / `.tag`…），靠**顺序**赢，不用 `!important` |
| 覆盖什么 | 只覆盖**颜色**：页面底色/正文、卡片（`.hero`/`.section` 底 + 描边）、`h2` 左侧色条、标签、表格分隔线、链接、滚动条 | 版式、间距、字号、字体一律不动 —— 那是页面自己的排版资产，且我们看不到全部 1000+ 页面的实际结构，改版式就是赌 |
| 卡片描边从哪来 | 原样式是白底 + `rgba(0,0,0,.06)` 极浅投影，深色下投影等于看不见 → 去投影、补一圈 `--border` 描边 | 否则卡片边界消失、整页糊成一片 |
| 系统绘制部分 | `:root` 上加 `color-scheme: dark/light` | 滚动条、表单控件、原生 `<video>` 控件是**系统画的**，我们的 CSS 管不到；不加就是深色页面配一条白滚动条 |
| 视频区块 | 它自己的 CSS 颜色改成 `var(--主题变量, 原浅色值)`；DPlayer 的进度条色也取当前 `--accent` | 不跟着改就会变成"深色页面里的几块白砖"。带原值兜底：没配主题时页面还是它原来的浅色样子 |
| 换主题后 | 渲染层派发 `yungame:detail-theme-changed`，`GameDetailPage` 重载那个 iframe | 颜色是**发 HTML 时**注入的，已经在看的页面不会自己变。重载会丢滚动位置/正在播的视频 —— 但切主题是用户主动做的，不重载更像是没生效 |
| 启动兜底 | `main.tsx` 启动完成后无条件 `syncDetailTheme()` 一次 | 两条恢复路径都要求"存过主题"；全新机器两处都空 → 界面用 `tokens.css` 默认配色，谁都不会来同步 → 详情页还是浅色 |
| 失败时 | 静默：拿不到桥（网站端 `server.mjs` 没这条命令）、载荷为空 → **什么都不注入**，页面保持原样 | 这是锦上添花的能力，不该在主界面弹任何东西 |

**作用范围**：只有**游戏详情页**（相对详情根正好是 `<一级目录>/index.html`，即 `isGameDetailIndex`）会被注入。
「游戏资料」那个**总目录页**（`/games/index.html`）走的是另一条分支（`serveFileAt`），**没有**注入 ——
它要单独做（选择器完全不同：卡片墙 + 搜索框 + 1280 张封面），目前保持原样。

### 安全：服务端不信任送进来的东西

`set_detail_theme` 的载荷最终会被拼进 `<style>`，所以 `core/detailTheme.ts` 会**先清洗再用**：

- 变量名必须匹配 `--[a-z0-9-]{1,48}`；
- 值里不允许出现 `<` `>` `{` `}` `;` `\` 和 CSS 注释（合法色值里都不会有；出现即意味着想跳出声明块或 `</style>` 标签），另外限长 240 字符；
- 变量条数上限 96；清洗后一个都不剩 → 返回 `null`，调用方**不注入**（而不是注入一个半残的样式把页面搞花）。

### 怎么验的（真引擎探针）

`_probe-detail-theme/`（仓库根，探针产物目录，可随时删）：

```bat
:: 默认拿 30XX 那一页；换一页再验就把游戏名当最后一个参数
npx vite-node -c vitest.config.mts _probe-detail-theme/run.mts
npx vite-node -c vitest.config.mts _probe-detail-theme/run.mts -- "暗黑破坏神2：重制版"
```

它拿**真实**详情页（+ 页面自己的 `css/style.css` + 图片）用真实注入函数生成页面，在真 Electron 里量计算样式。
2026-09-15 实测（`30XX` 与 `暗黑破坏神2：重制版` 两页都过，说明这套模板是共用的）：

- 15 项计算样式全部等于注入的调色板（`body` #0e0e16 / 卡片 #15161f + 描边 / `h2` 色条 = accent / …），
  「视频卡片底色」也确实是主题色；
- **对照组**（同一页面不注入）仍是原生浅色（`body` rgb(246,247,249)、卡片 rgb(255,255,255)）——
  证明"变色的是我们注入的那部分"，不是源页面本来就深色；
- 对比度：正文 7.67:1、标题 14.60:1、标签 6.79:1、dim 级 4.44:1（阈值口径见下）。

> 探针踩过的两个坑（都是**测量方式**的坑，不是实现的）：`td` 只设了 `border-bottom`，
> 量 `border-top` 会得到 `currentColor`（= 文字色）这种假结论；表格第一列是被我们刻意压到 dim 的
> 字段名，混在"表格单元"里按正文 4.5 判会误判。阈值口径与 `src/utils/__tests__/themeContrast.test.ts`
> 一致：正文 4.5、次要 3.0、弱化(dim) 2.6。

## 主界面：「游戏资料」选项卡（总目录页）

详情根目录下还有一个 **`index.html`** —— 它不是某个游戏的，而是整个静态站点的**总目录页**
（卡片墙 + 搜索框，卡片指向各游戏的 `<游戏名>/index.html`）。顶栏的「游戏资料」选项卡把这一页
整页嵌进界面，与「主页」同级（**2026-09-15 需求**）。

| 维度 | 做法 | 为什么 |
| --- | --- | --- |
| 渲染 | iframe → `<服务器 base>/games/index.html` | 那份页面是现成的内容资产（1280 个游戏、自带搜索与封面），重写一个列表既没必要，也会变成两处各说一遍 |
| 服务器 | **一行都不用改** | 服务器本来就按 `/games/<相对路径>` 托管详情根，而总目录页里的卡片是**相对链接**（`007…/index.html`、`images/cover.jpg`），在 `/games/` 这个基准下正好落到已支持的路由上。实测 2026-09-15：`/games/index.html` → 200 / 376 KB / title「游戏库 · 全部游戏介绍」，封面图也是 200 |
| 点卡片 | **在 iframe 里原地跳转**（用静态站自己的链接） | 跨源 iframe 父页面拦不到点击；这个选项卡的定位是"翻资料"，不需要 app 侧的「开始游戏 / 修改器」—— 那些在游戏详情页（主页卡片点「详情」进去） |
| 挂载 | **首次进入才挂载、之后常驻**（切走只 `display:none` 隐藏） | 常驻是为了保留搜索词与滚动位置（**卸载会让 iframe 重新加载**）；首次才挂是因为这页 376 KB + 1280 张懒加载封面，不该拖慢启动 |
| 地址 | `src/utils/gameDataUrl.ts` 的 `gameDataPageUrl()` | ⚠️ 必须是 `<base>/games/index.html` —— **裸 `/games/` 会被防穿越规则判成"空目录"直接 403**（实测）：页面上只看到一片空白，很难联想到原因。单测钉住（含反向断言） |
| 失败态 | 服务器没起来（base 为空）→ 显「游戏资料页不可用」 | 不静默给一张白页 |

落点：选项卡在 `src/components/TopBar.tsx`，内容在 `src/components/views/GameDataView.tsx`，
"首次进入才挂载 / 切走只隐藏"在 `src/components/MainContent.tsx`。

**标签点击**：游戏页里的标签云会 `parent.postMessage({ type: "playday-filter-by-tag", tag })`。
这条监听挂在 `src/App.tsx`（全局）—— **两个来源都会发**（详情页，以及资料页里点进去的游戏页），
所以那里除了设筛选，还必须**切回「主页」选项卡**：选项卡由 `uiStore.activeTab` 决定、不跟着路由走，
只 `navigate("/")` 的话在「游戏资料」里点标签会"整屏没反应"。

**与详情页相比的两处已知差异**（都只在「游戏资料」里出现，属于刻意接受的取舍，不是 bug）：

| 差异 | 原因 |
| --- | --- |
| 播放视频时**背景音乐不会让位** | 「放视频时音乐暂停」的监听挂在 `src/pages/GameDetailPage.tsx`（只在详情路由下挂载），资料页里播视频它收不到 |
| `mkv/flv/avi` 这类**要系统播放器的视频点不开** | 页面发的是 `playday-video-external`（只带 `rel`），需要挂载中的详情页拿自己的 `videos` 列表解析绝对路径；资料页里没有那份上下文。要看这类视频就从主页卡片进详情页 |

## IPC 命令

| 命令 | 作用 | 实现 |
|------|------|------|
| `get_game_html_page` | 返回某游戏详情页本地路径（不存在返回 null） | `gameHtmlPagePath()` |
| `get_game_server_url` | 返回 HTTP 服务器 base URL；未启动则**惰性启动** | `getGameServerBaseUrl()` / `startGameServer()` |
| `list_game_html_dirs` | 列出详情页根目录下有哪些游戏的详情页（管理端诊断） | `readdirSync` + 检查 `index.html` |
| `get_game_videos` | 列出某游戏视频目录里的本地视频（外部播放要用的绝对路径；也是"播视频时音乐让位 / 顶栏已不再显示数量徽章"的数据来源）。`urlPath` 的前缀是**实际命中的目录名**，不写死 `videos` | `resolveGameVideoDir()` + `scanVideos()` |
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
| `electron/core/gameDetailInject.ts` | 把「游戏视频」区块注入到详情页 HTML（注入点、样式、脚本、文案）。颜色用 `var(--主题变量, 原浅色值)`，跟随注入的主题 |
| `electron/core/detailTheme.ts` | 详情页**主题注入**：清洗渲染层送来的配色 → 生成覆盖样式 → 插到 `</head>` 前（见上一节） |
| `electron/core/detailTheme.test.ts` | 单测：清洗（挡 `</style>`/跳出声明块）、`:root` 与覆盖规则、注入位置与幂等 |
| `src/utils/themeApply.ts` | `applyPaletteTheme` 末尾 + 启动时 `syncDetailTheme()`：读 `:root` 计算值送主进程，成功后再派发 `yungame:detail-theme-changed` |
| `src/pages/GameDetailPage.tsx` | 监听上面那个事件 → 重载详情页 iframe（颜色要重载才变）；iframe 底色从 `bg-white` 改成 `bg-base` |
| `_probe-detail-theme/` | 真引擎探针（真实页面 + 真实注入 + 计算式量测），结论见上一节 |
| `electron/ipc/gameHtml.ts` | 详情页相关 IPC（含惰性启动 `get_game_server_url`） |
| `electron/ipc/trainer.ts` | 复用详情页目录发现修改器 |
| `electron/ipc/gameVideos.ts` | 视频列表 IPC + 用系统播放器打开 |
| `src/pages/GameDetailPage.tsx` | 前端打开详情页、拼 URL、懒加载服务器；修改器 / 应用存档入口（**按目录内容决定是否显示**）；视频不再有 app 侧入口 |
| `src/components/views/GameDataView.tsx` | 「游戏资料」选项卡：iframe 嵌总目录页（惰性取服务器地址 + 两种失败态） |
| `src/utils/gameDataUrl.ts` | 总目录页地址拼装（`/games/index.html`；裸 `/games/` 会 403） |
| `src/components/MainContent.tsx` | 选项卡容器：资料页**首次进入才挂载、之后常驻**（隐藏而非卸载，保留搜索词与滚动位置） |
| `src/components/settings/GeneralSection.tsx` | `gameDetailsDir` 配置 UI |
| `server/server.mjs` | 网站端 `/Game_Details/*` 静态路由 |
