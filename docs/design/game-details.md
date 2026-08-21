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

## IPC 命令

| 命令 | 作用 | 实现 |
|------|------|------|
| `get_game_html_page` | 返回某游戏详情页本地路径（不存在返回 null） | `gameHtmlPagePath()` |
| `get_game_server_url` | 返回 HTTP 服务器 base URL；未启动则**惰性启动** | `getGameServerBaseUrl()` / `startGameServer()` |
| `list_game_html_dirs` | 列出详情页根目录下有哪些游戏的详情页（管理端诊断） | `readdirSync` + 检查 `index.html` |

## 双端差异

| 能力 | 桌面端（Electron） | 网站端（`server/server.mjs`） |
|------|:---:|:---:|
| 详情页托管 | 本地 HTTP 服务器 `gameServer.ts` | `/Game_Details/*` 静态路由 |
| 目录 | `gamesHtmlDir()`（默认 `<数据根>/Game_Details`） | `DETAILS_DIR`（固定 `release/data/Game_Details`） |
| 惰性启动 | ✅（第一次打开详情页时） | 网站端服务器常驻，无此概念 |
| `get_game_html_page` | ✅ | ✅ |
| `get_game_server_url` | ✅ | 网站端无此命令（页面直接同源访问 `/Game_Details/*`） |

> 网站端 `server.mjs` 直接以静态路由 `/Game_Details/*` 托管同一份详情页，不依赖桌面端的内置 HTTP 服务器。

## 相关文件索引

| 文件 | 职责 |
|------|------|
| `electron/core/paths.ts` | `gamesHtmlDir()` / `configuredDetailsDir()` 解析详情页目录 |
| `electron/core/gameServer.ts` | 本地 HTTP 服务器（静态托管 + Range + videos API） |
| `electron/ipc/gameHtml.ts` | 详情页相关 IPC（含惰性启动 `get_game_server_url`） |
| `electron/ipc/trainer.ts` | 复用详情页目录发现修改器 |
| `src/pages/GameDetailPage.tsx` | 前端打开详情页、拼 URL、懒加载服务器 |
| `src/components/settings/GeneralSection.tsx` | `gameDetailsDir` 配置 UI |
| `server/server.mjs` | 网站端 `/Game_Details/*` 静态路由 |
