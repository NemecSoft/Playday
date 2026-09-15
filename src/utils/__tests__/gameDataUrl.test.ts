// 「游戏资料」总目录页的地址拼装。两个细节都是实测出来的坑，所以钉住：
//   1) 必须带 `/games/` 前缀（服务器只托管这个前缀下的静态文件）；
//   2) 必须**带 index.html** —— 裸 `/games/` 会被防穿越规则判成空目录，直接 403。
// 谁把地址"简化"成 `/games/` 或 `/`，这里就红 —— 否则界面上只会看到一片空白，很难查。

import { describe, expect, it } from "vitest";
import { gameDataPageUrl } from "../gameDataUrl";

describe("gameDataPageUrl：总目录页地址", () => {
  it("拼成 <base>/games/index.html", () => {
    expect(gameDataPageUrl("http://127.0.0.1:10029")).toBe(
      "http://127.0.0.1:10029/games/index.html",
    );
  });

  it("base 末尾多余的 / 不会拼出双斜杠", () => {
    expect(gameDataPageUrl("http://127.0.0.1:10029/")).toBe(
      "http://127.0.0.1:10029/games/index.html",
    );
  });

  it("不是裸 /games/（那个会 403），一定带 index.html", () => {
    const u = gameDataPageUrl("http://127.0.0.1:10029");
    expect(u).not.toBe("http://127.0.0.1:10029/games/");
    expect(u).toContain("/games/index.html");
  });

  it("base 为空（服务器没起来）→ 返回空串，调用方据此显示不可用", () => {
    expect(gameDataPageUrl("")).toBe("");
  });
});
