// 版本徽标的「品牌前缀」（2026-09-15 需求）：文案 = 品牌 + 档位（如 `YunGame黄金版`）。
// 2026-09-15 徽标从**顶栏中央挪到右下角状态栏**（背景音乐右边），测试跟着组件一起搬来，
// 断言一个字没改 —— 挪位置不该改文案规则。
//
// 品牌**不能写死在 JSX 里** —— 它是 build.config.ts 的 APP_NAME，经主进程同步 IPC →
// preload → window.electronConfig.appName 传到渲染层。
//
// 用 renderToString（不执行 useEffect），并把 i18n 的 t 换成 `[key:vars]` 形式：既能断言
// "用了哪个 key"，又能断言"品牌真的作为变量传进去了"，且语种无关。

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";

// 等级（1 = 黄金版，2 = 钻石版）。zustand v5 在 renderToString 下取的是**初始快照**，
// 所以必须用 vi.mock 摆 —— 用 useAuthStore.setState 设的值 SSR 读不到（假绿），
// 这条坑在 GameDetailPage 的渲染测试里已经记过一次。
const auth = vi.hoisted(() => ({ state: { loaded: true, userLevel: 1 } }));
vi.mock("../../stores/authStore", () => ({
  useAuthStore: (sel: (s: { loaded: boolean; userLevel: number }) => unknown) => sel(auth.state),
}));

// mock 的 t：带变量时输出 `[key:变量值]` —— 品牌有没有传进去，一眼可断言。
vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (k: string, vars?: Record<string, string>) =>
      vars ? `[${k}:${Object.values(vars).join(",")}]` : `[${k}]`,
  }),
}));

import TierBadge from "../TierBadge";

const BRAND = "PlayDay";

/** 渲染一次。appName = undefined 表示"网站端"（浏览器里没有 preload 桥）。 */
function render(userLevel: number, appName: string | undefined): string {
  auth.state = { loaded: true, userLevel };
  (globalThis as unknown as { window: unknown }).window = {
    electronConfig: appName === undefined ? undefined : { appName },
  };
  return renderToString(<TierBadge />);
}

describe("TierBadge 徽标：品牌前缀", () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("黄金版（1）：用带品牌的键，且品牌作为变量传了进去", () => {
    const html = render(1, BRAND);
    expect(html).toContain("tier_badge_gold");
    expect(html).toContain(BRAND);
    // 不许退回无品牌的旧键（那会让徽标又只剩"黄金版"）
    expect(html).not.toContain("[tier_gold]");
  });

  it("钻石版（>=2）：用钻石版的键，品牌同样在", () => {
    const html = render(2, BRAND);
    expect(html).toContain("tier_badge_diamond");
    expect(html).toContain(BRAND);
  });

  it("换品牌 → 徽标跟着变（这就是『预留改成 PlayDay』要的效果）", () => {
    const html = render(1, "另一个品牌");
    expect(html).toContain("另一个品牌");
    expect(html).not.toContain(BRAND);
  });

  it("网站端没有 preload 桥：退化成只显示档位，不抛错", () => {
    const html = render(1, undefined);
    expect(html).toContain("tier_badge_gold");
  });

  it("档位类名跟着等级走（状态栏里靠它上色的）", () => {
    expect(render(1, BRAND)).toContain("tier-badge gold");
    expect(render(2, BRAND)).toContain("tier-badge diamond");
  });
});
