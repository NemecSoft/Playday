# vendor：随包发布的第三方前端资源

| 文件 | 说明 |
|---|---|
| `DPlayer.min.js` | [DPlayer](https://github.com/DIYgod/DPlayer) **1.27.1**（MIT）。详情页的**内置播放器**用它 —— 原生 `<video controls>` 是 shadow DOM，做不出"网页全屏 + 全屏"并排的按钮，也删不掉菜单里的"下载"项。 |
| `DPlayer.LICENSE.txt` | DPlayer 的 MIT 许可原文（**随包分发必须保留**）。 |

- **SHA256**（`DPlayer.min.js`）：`930AA94317D71F1459823CDA409DA8453078AF00FE405027C67932445EC997E8`
- **体积**：304,629 字节（297.5 KB）
- **来源**：`https://cdn.jsdelivr.net/npm/dplayer@1.27.1/dist/DPlayer.min.js`
  （样式已内联在这个 js 里，不需要额外 css 文件）

## 怎么送到页面

由**本地 HTTP 服务器**按 `/vendor/<文件名>` 提供：

- 路由：`electron/core/gameServer.ts`
- 解析（含防穿越白名单）：`electron/core/vendorAssets.ts`
- 查找顺序：`<exe 同级>/vendor` → `<resources>/vendor`
  （打包时由 `electron-builder.yml` 的 `extraResources` 带上，见 `docs/design/directory-structure.md`）

为什么不直接给页面 `file://`：详情页是跨源 iframe 里的静态页，读不到 `file://`；
开发态页面自己还是 `http://localhost:5173`。与字体（`fonts/`）走的是同一套做法。

## 升级步骤

1. 先确认新版本仍然满足我们的三个前提：控制条里**没有下载项**、
   有 `.dplayer-full-in-icon`（网页全屏）与 `.dplayer-full-icon`（全屏）两个按钮。
   （压缩文件里搜 `dplayer-download` 就够判断 —— 1.27.1 没有。）
2. 覆盖 `DPlayer.min.js`、更新上面的版本号与 SHA256、换 `DPlayer.LICENSE.txt`。
3. 跑一遍真引擎验证：`docs/design/game-details.md` 的「内置播放器」一节写了要量哪几项
   （能播、能拖、两个全屏按钮、网页全屏**真的铺满**）。
4. `npm run check`。

> 我们只在注入脚本里**配置**它、并用一小段 CSS 藏掉本地视频用不到的控件
> （发弹幕 / 弹幕设置 / 无线投屏）；没有改它的源码 —— 所以升级就是换个文件。
