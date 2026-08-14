# 双端架构（桌面 + 网站 一套代码）

Playday 的核心能力之一：**一套前端源码**既能跑桌面端（Electron），也能一键部署为网站端（浏览器），复用同一份数据。切换只在传输层一处，前端组件/状态/页面零分叉。

## 设计目标

1. **前端零分叉**——桌面端和网站端跑的是 `src/` 同一套组件、store、页面。
2. **传输层抽象**——前端不关心数据来自 Electron IPC 还是 HTTP，只管调命令。
3. **单一数据源**——两端都读写 `release/data/` 下同一份数据（桌面端能写，网站端目前只读）。

## 传输层：`src/api/ipc.ts`

这是整套兼容架构的枢纽：

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

- **命令名（cmd）两端完全一致**：桌面端对应 `ipcMain.handle(cmd, ...)`，网站端对应 `server.mjs` 的 `case cmd`。
- **参数统一对象包装**：前端始终用 `{ path, id, ... }` 对象传参，两端 handler 自己解析。
- 前端 `src/api/client.ts` 把常用命令封装成方法（`getGames()`、`readImage()` 等），业务代码不直接碰传输层。
- `isDesktop()` 判断当前是否在 Electron（`!!window.ipc`）。

## 类型化客户端：`src/api/client.ts`

把所有命令封装成类型安全的方法，业务代码统一从这里调用：

```ts
api.getGames()          // → call("get_games")
api.readImage(path)     // → call("read_image", { path })
api.loginPersonal(...)  // → call("login_personal", {...})
api.adminListUsers()    // → call("admin_list_users")
```

## 网站端后端：`server/server.mjs`

Node 内置 `http`（零依赖），复用 `release/data` 同一份数据：

- **数据目录**：`DATA_DIR = YUNGAME_DATA_DIR || server/../release/data`，默认复用桌面端数据。
- **API**：实现 `/api/<cmd>`，用 sql.js 读 `library/library.db`。
- **静态服务**：`/CoverImages/*`、`/Game_Details/*`、前端产物 `dist/`。
- **只读模式**：网站版**不支持启动游戏**（`launch_game`/`test_script` 返回"网站版不支持启动游戏"），主要只读浏览。

## 命令清单

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

> 网站端对"启动游戏"类命令返回 `{ launched: false, error: "网站版不支持启动游戏" }`，前端据此给出提示，不会崩。

## 部署与测试

- **一键部署**：`deploy-web.bat`（构建前端 → 清理 8080 旧进程 → 启动 server）。
- **一键测试**：`test-web.bat`。
- **端口**：默认 8080，可用 `PORT` 环境变量覆盖。
- 两个脚本启动前都会检测 8080 端口占用并自动停止旧进程，避免 `EADDRINUSE`。

## 常见坑（排查经验）

1. **字段名不一致**：网站端 `rowToGame` 的字段命名必须与前端类型严格一致。曾把 `genre` 写成 `genres`（复数），导致前端拿到 `undefined`，任何 `for...of game.genre` 抛 `is not iterable` 崩溃。两端字段命名要同步。
2. **命令两边都要实现**：前端 `read_image`（单图）和 `read_images_batch`（批量）都有人用，网站端缺一个封面就全空白。
3. **压缩版 vendor 的错误信息不可信**：遇到 `t.pure is not invalid` 这类假错误，先拆包 + 关压缩（`manualChunks` 按包拆分、`minify: false`）看真实 stack，别急着怀疑框架兼容性。
