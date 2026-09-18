// 公告窗口底部按钮的**默认焦点**（2026-09-18 用户指出：焦点跑到「退出」上了）。
//
// 怎么测：窗口一出来，浏览器把焦点给**文档里第一个可聚焦元素**；所以
// "默认焦点在进入系统" 等价于 "「进入系统」排在「退出（取消进入）」前面"。
// 测试环境是 node（配置里没装 jsdom），用 renderToString 断言文档顺序最直接。
//
// 视觉位置与文档顺序无关：「退出（取消进入）」是绝对定位靠右的（global.css 的 .ann-quit-btn），
// 排在后面照样在右边、主按钮照样居中 —— 下面各有一条断言盯着这两件事。

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";

// 组件只在 useEffect / 事件处理里调 api，SSR 两条都不执行；mock 掉是为了不让测试
// 依赖 ipc 桥的初始化方式（那是另一回事）。
vi.mock("../../api/client", () => ({
  api: {
    getAnnouncement: () => Promise.resolve({ html: "" }),
    getServerStatus: () => Promise.resolve({ maintenance: false, level: 1 }),
    getLibraryAge: () => Promise.resolve({ outdated: false, ageDays: 0 }),
    enterSystem: () => Promise.resolve({ ok: true }),
    quit: () => Promise.resolve(),
  },
}));

// t 换成 [key]：既断言"用了哪个键"，又语种无关（与 TierBadge 的渲染测试同一种做法）。
vi.mock("../../i18n", () => ({
  useI18n: () => ({ t: (k: string) => `[${k}]` }),
}));

import AnnouncementWindow from "../AnnouncementWindow";

/** 渲染一次（appName 走 preload 桥，这里直接摆上）。 */
function render(): string {
  (globalThis as unknown as { window: unknown }).window = {
    electronConfig: { appName: "PlayDay" },
  };
  return renderToString(<AnnouncementWindow />);
}

describe("公告窗口：底部按钮", () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("「进入系统」排在「退出（取消进入）」前面 —— 默认焦点落在进入系统上", () => {
    const html = render();
    const enter = html.indexOf("[ann_enter]");
    const quit = html.indexOf("[ann_quit]");
    expect(enter).toBeGreaterThan(-1);
    expect(quit).toBeGreaterThan(-1);
    // 反过来写过的后果：回车 = 退出（用户踩到并指出来的那个坑）
    expect(enter).toBeLessThan(quit);
  });

  it("「进入系统」带 autoFocus —— 不只靠文档顺序兜着", () => {
    expect(render()).toMatch(/autofocus/i);
  });

  it("「退出（取消进入）」仍是次要样式（靠右那套），没退化成主按钮", () => {
    expect(render()).toContain("ann-quit-btn");
  });
});
