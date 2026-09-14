# Playday 双端架构（桌面 GUI + 网站 一套代码）

> 本文档说明 Playday 如何做到「桌面端 GUI（Electron）」与「网站端（浏览器）」共用同一套前端代码、复用同一份数据。核心思路是：**一套前端源码，两种运行时后端，切换只在一个传输层**。
>
> 📌 换机器 / 重装系统 / 新会话请先读 [docs/PROJECT-MEMORY.md](./docs/PROJECT-MEMORY.md)：
> 项目上下文、硬约定（踩过的坑）、用户偏好、文档地图、交接状态都在那里。

---

## 一、总览

```
                     ┌─────────────────────────────────────┐
                     │        一套前端源码 (src/)          │
                     │  React 18 + Vite + react-router v6   │
                     └───────────────┬─────────────────────┘
                                     │  通过传输层选择后端
                                     ▼
              ┌──────────────────────┴──────────────────────┐
              │                                             │
    ┌─────────▼─────────┐                        ┌─────────▼─────────┐
    │  桌面端 (Electron) │                        │  网站端 (Node)    │
    │  window.ipc        │                        │  fetch /api/*     │
    │  ipcMain.handle    │                        │  server.mjs       │
    └─────────┬─────────┘                        └─────────┬─────────┘
              │ 读写                                          │ 读写（只读为主）
              ▼                                              ▼
    ┌──────────────────────────────────────────────────────────────────┐
    │              同一份数据（单一数据源）：dev-data/              │
    │  library/library.db（游戏库） │ config.json（设置）              │
    │  CoverImages/（封面） │ Game_Details/（详情页） │ announcements/ │
    └──────────────────────────────────────────────────────────────────┘
```

**关键设计原则**：

1. **前端代码零分叉**——桌面端和网站端跑的是 `src/` 同一套组件、同一套 store、同一套页面。
2. **后端逻辑通过「传输层」切换**——前端不关心数据来自 Electron IPC 还是 HTTP，只管调命令。
3. **数据单一来源**——两端都读写 `dev-data/` 下同一份数据（桌面端能写，网站端目前只读）。

---

## 二、传输层：`src/api/ipc.ts`

这是整套兼容架构的枢纽。前端所有数据访问都走这里，由它决定走桌面 IPC 还是网站 HTTP：

```ts
export function invoke<T>(cmd: string, args?): Promise<T> {
  if (window.ipc) {
    // 桌面端：有 window.ipc（Electron preload 注入）就走 Electron IPC
    return window.ipc.invoke(cmd, args);
  }
  // 网站端：没有 window.ipc，就用 HTTP POST 到 /api/<cmd>
  return fetch(`/api/${cmd}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args ?? {}),
  }).then((r) => r.json());
}
```

- **命令名（cmd）两端必须完全一致**：桌面端对应 `ipcMain.handle(cmd, ...)`，网站端对应 `server.mjs` 的 `case cmd`。
- **参数统一对象包装**：前端始终用 `{ path, id, ... }` 对象传参，两端 handler 自己解析。
- 前端 `src/api/client.ts` 把常用命令封装成方法（`getGames()`、`readImage()` 等），业务代码不直接碰传输层。

---

## 三、两端后端对比

| 能力 | 桌面端（Electron 主进程） | 网站端（server/server.mjs） |
|------|--------------------------|------------------------------|
| 传输方式 | `window.ipc.invoke`（IPC） | `fetch POST /api/<cmd>` |
| 读取游戏库 | `ipcMain.handle("get_games")` 读 sql.js | `case "get_games"` 读 sql.js |
| 读取封面 | `read_image` / `read_images_batch`（base64） | `read_image` / `read_images_batch`（base64） |
| 读取设置 | 读/写 `config.json` | 读 `config.json`（只读） |
| 读取公告/详情 | 读文件 | 读文件 |
| 启动游戏 | ✅ 支持 | ❌ 返回「网站版不支持启动游戏」 |
| 登录/权限 | ✅ 完整 | ⚠️ 部分（未完全覆盖） |
| 写数据库 | ✅ | ❌（只读） |

**相同点**：都用 sql.js 读 `library/library.db`，都用同一套字段映射（`rowToGame`）。

---

## 四、数据来源：单一数据源 `dev-data/`

- `library/library.db` — 游戏库（SQLite，sql.js 读取）
- `config.json` — 用户设置（主题/风格/语言等）
- `CoverImages/` — 游戏封面图
- `Game_Details/` — 游戏详情 HTML 页
- `announcements/` — 公告

**网站端路径**：`server/server.mjs` 里 `DATA_DIR = YUNGAME_DATA_DIR || server/../dev-data`，默认复用桌面端同一份数据。可以用环境变量 `YUNGAME_DATA_DIR` 覆盖指向其他数据目录。

**注意**：桌面端可以写数据，网站端目前是只读模式（不写库、不写配置）。未来如需网站端写，需在 `server.mjs` 补写接口并加权限校验。

---

## 五、字段映射一致性（重要教训）

前端 `src/types/models.ts` 定义了 `Game` 类型（`genre`、`developer`、`publisher` 等都是数组）。**桌面端主进程 `electron/core/db.ts` 和网站端 `server/server.mjs` 的 `rowToGame` 必须返回相同字段名**。

> ⚠️ 曾踩坑：网站端 `rowToGame` 把 `genre` 写成 `genres`（复数），与前端 `genre` 不一致，导致前端拿到 `undefined`，任何 `for...of game.genre` 直接抛 `is not iterable` 崩溃。因此两端 `rowToGame` 的字段命名必须与前端类型严格一致，一旦新增字段要同步改两处。

---

## 六、命令清单（两端都实现了的 IPC 命令）

| 命令 | 作用 | 桌面端 | 网站端 |
|------|------|:------:|:------:|
| `get_games` | 全部游戏列表 | ✅ | ✅ |
| `get_game` | 单个游戏详情 | ✅ | ✅ |
| `get_settings` | 用户设置 | ✅ | ✅ |
| `get_announcement` | 公告 | ✅ | ✅ |
| `read_image` | 单张封面（base64） | ✅ | ✅ |
| `read_images_batch` | 批量封面（base64） | ✅ | ✅ |
| `get_game_html_page` | 游戏详情 HTML | ✅ | ✅ |
| `launch_game` / `launch_game_path` / `test_script` | 启动游戏 | ✅ | ❌ |
| `save_settings` 等写操作 | 写设置/写库 | ✅ | ❌ |

> 网站端对「启动游戏」类命令返回 `{ launched: false, error: "网站版不支持启动游戏" }`，前端据此给出提示，不会崩。

---

## 七、部署与测试

### 网站端

- **一键部署**：双击 `deploy-web.bat`（构建前端 → 清理 8080 旧进程 → 启动 `server/server.mjs`）
- **一键测试**：双击 `test-web.bat`（同 deploy，另检查数据目录）
- **端口**：默认 8080，可用 `PORT` 环境变量覆盖
- **访问**：`http://localhost:8080`

两个脚本启动前都会检测 8080 端口占用并自动停止旧进程，避免 `EADDRINUSE`。

### 桌面端

- `dev-client.bat` 启动开发版（设 `YUNGAME_DATA_DIR` 指向 `dev-data`）
- `package.bat` 打出便携 exe 到 `release/`（**纯产物目录**，不碰数据）
- `build-release.bat` 出**正式包**（全 X 盘，数据随包）；
  `build-prerelease.bat` 出**测试/预发布包**（全 D 盘）。
  两个脚本都**双击即用、不带参数**，内部 = 打包 + 按模式生成 `config.json`。
  各模式用哪些目录（封面/音乐/详情页+视频/库/公告）只写在 `path-modes.json` 一张表里，
  `config.json` 由它生成并被测试校验一致 —— 详见 [路径模式与出包](./docs/design/release-build.md)

> `release/` 与 `dev-data/` 的边界是刻意的：前者是随时可删掉重打的产物，后者是开发/测试态的数据根
> （2026-09-14 之前两者共用一个路径，清一次打包目录就等于清数据）。

---

## 八、当前状态与限制

- ✅ 网站端已跑通：游戏列表、封面、游戏详情、公告、设置读取
- ✅ 网站端有游戏库完整数据（1271 游戏 / 1248 封面）
- ❌ 网站端不支持启动游戏（设计如此）
- ⚠️ 网站端登录/权限、写设置、写库尚未完全覆盖（可后续补）
- ⚠️ 网站端通知（EventSource）未做

---

## 九、排查经验（本架构常见坑）

1. **字段名不一致**导致前端拿到 `undefined` → `is not iterable` 崩溃。改代码前先核对两端 `rowToGame` 与前端类型。
2. **压缩版 vendor 的错误信息不可信**。遇到 `t.pure is not invalid` 这类假错误，先拆包 + 关压缩（vite 的 `manualChunks` 按包拆分、`minify: false`）看真实 stack，别急着怀疑框架兼容性。
3. **命令两边都要实现**。前端 `read_image`（单图）和 `read_images_batch`（批量）都有人用，网站端缺一个封面就全空白。
4. **数据库字段可能是脏数据**。数组字段（genre/developer 等）前端应做防御（`Array.isArray` 兜底），后端 `arr()` 要兼容「已是数组 / JSON 字符串 / 分隔符文本」多种形态。

---

> 如需在文档基础上补充架构图或某块详细说明，或把某部分（如登录）从网站端补齐，告诉我即可。
