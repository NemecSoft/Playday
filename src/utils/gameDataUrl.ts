/**
 * 「游戏资料」选项卡里那个**总目录页**的地址（`<详情根>/index.html`）。
 *
 * 两个细节都不能"简化"（都是实测出来的，见 docs/design/game-details.md 的「游戏资料」一节）：
 *   1) 必须带 **`/games/`** 前缀 —— 本地服务器只托管这个前缀下的静态文件；
 *   2) 必须带 **`index.html`** —— 裸 `/games/` 会被服务器的防路径穿越规则判成"空目录"，
 *      直接返回 **403**（实测），页面上表现为一片空白，很难查。
 *
 * 为什么总目录页能直接嵌进 iframe：它里面的卡片是**相对链接**
 * （`007%EF%BC%9A…/index.html`、`images/cover.jpg`），在 `/games/` 这个基准下
 * 正好落到服务器已支持的静态路由上。
 *
 * @param serverBaseUrl 主进程给的服务器 base URL（如 `http://127.0.0.1:10029`）；
 *                      空串 = 服务器没起来 → 返回空串，调用方据此显示"不可用"。
 */
export function gameDataPageUrl(serverBaseUrl: string): string {
  const base = (serverBaseUrl || "").replace(/\/+$/, "");
  return base ? `${base}/games/index.html` : "";
}
