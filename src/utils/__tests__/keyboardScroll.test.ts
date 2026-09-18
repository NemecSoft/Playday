// 通用快捷键的键位规则（可执行说明）。
// 实现：src/utils/keyboardScroll.ts（这里只测"纯决策"部分，DOM 解析不测）。
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyScrollAction,
  historyActionFor,
  isActivatableTarget,
  isTypingTarget,
  pageKeysBelongToField,
  pageStep,
  scrollMatchFor,
  type KeyLike,
} from "../keyboardScroll";

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, ...mods });
/** 造一个只带这几个字段的"假元素"，够 isTypingTarget / isActivatableTarget 判断。 */
const el = (fields: Record<string, unknown>) => fields as unknown as Element;

describe("scrollMatchFor：滚动键位映射", () => {
  it("Home / End 到最上 / 最下（带不带 Ctrl 都认）", () => {
    expect(scrollMatchFor(key("Home"))?.action).toBe("top");
    expect(scrollMatchFor(key("End"))?.action).toBe("bottom");
    expect(scrollMatchFor(key("Home", { ctrlKey: true }))?.action).toBe("top");
    expect(scrollMatchFor(key("End", { ctrlKey: true }))?.action).toBe("bottom");
  });

  it("PageUp / PageDown 翻上一屏 / 下一屏", () => {
    expect(scrollMatchFor(key("PageUp"))?.action).toBe("pageUp");
    expect(scrollMatchFor(key("PageDown"))?.action).toBe("pageDown");
  });

  it("空格 = 下一页，Shift+空格 = 上一页（浏览器习惯）", () => {
    expect(scrollMatchFor(key(" "))).toEqual({ action: "pageDown", source: "space" });
    expect(scrollMatchFor(key(" ", { shiftKey: true }))).toEqual({ action: "pageUp", source: "space" });
  });

  it("Ctrl+空格 不拦（那是输入法切换）", () => {
    expect(scrollMatchFor(key(" ", { ctrlKey: true }))).toBeNull();
  });

  it("Ctrl+PageUp/PageDown 不拦（浏览器里是切换标签页，不是滚动）", () => {
    expect(scrollMatchFor(key("PageDown", { ctrlKey: true }))).toBeNull();
    expect(scrollMatchFor(key("PageUp", { ctrlKey: true }))).toBeNull();
  });

  it("Alt / Win 组合一律不碰（留给别的功能，如 Alt+滚轮调封面）", () => {
    expect(scrollMatchFor(key("Home", { altKey: true }))).toBeNull();
    expect(scrollMatchFor(key("End", { metaKey: true }))).toBeNull();
    expect(scrollMatchFor(key(" ", { altKey: true }))).toBeNull();
  });

  it("其它键返回 null：不抢键（打字、回车、方向键、F5 刷新都要正常）", () => {
    for (const k of ["a", "Enter", "ArrowDown", "ArrowUp", "F5", "Escape", "Tab"]) {
      expect(scrollMatchFor(key(k)), `${k} 不该被当成滚动键`).toBeNull();
    }
  });
});

describe("historyActionFor：Alt+← / Alt+→ 后退前进", () => {
  it("Alt+← 后退、Alt+→ 前进", () => {
    expect(historyActionFor(key("ArrowLeft", { altKey: true }))).toBe("back");
    expect(historyActionFor(key("ArrowRight", { altKey: true }))).toBe("forward");
  });

  it("不按 Alt 就不是历史导航（裸方向键留给列表/焦点移动）", () => {
    expect(historyActionFor(key("ArrowLeft"))).toBeNull();
    expect(historyActionFor(key("ArrowRight"))).toBeNull();
  });

  it("带 Ctrl/Win 的组合不是历史导航", () => {
    expect(historyActionFor(key("ArrowLeft", { altKey: true, ctrlKey: true }))).toBeNull();
    expect(historyActionFor(key("ArrowLeft", { altKey: true, metaKey: true }))).toBeNull();
  });
});

describe("pageStep：翻一屏滚多少", () => {
  it("照抄 Chromium：可视高 - 40px（留一点重叠，不漏行）", () => {
    expect(pageStep(800)).toBe(760);
    expect(pageStep(400)).toBe(360);
  });

  it("容器还没量出高度 / 数值异常时给 1，避免「滚 0」被当成按键没反应", () => {
    expect(pageStep(0)).toBe(1);
    expect(pageStep(Number.NaN)).toBe(1);
    expect(pageStep(-5)).toBe(1);
  });

  it("极矮容器也至少滚 1px", () => {
    expect(pageStep(30)).toBe(1);
  });
});

describe("该不该把键让出去", () => {
  it("输入框 / 文本域 / 可编辑区：让（Home/End 在里头是移动光标）", () => {
    expect(isTypingTarget(el({ tagName: "INPUT" }))).toBe(true);
    expect(isTypingTarget(el({ tagName: "TEXTAREA" }))).toBe(true);
    expect(isTypingTarget(el({ tagName: "SELECT" }))).toBe(true);
    expect(isTypingTarget(el({ tagName: "DIV", isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el({ tagName: "DIV" }))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("按钮 / 链接 / 菜单项：空格要还给它们（空格 = 激活）", () => {
    expect(isActivatableTarget(el({ tagName: "BUTTON" }))).toBe(true);
    expect(isActivatableTarget(el({ tagName: "A" }))).toBe(true);
    expect(
      isActivatableTarget(el({ tagName: "DIV", getAttribute: () => "menuitem" })),
    ).toBe(true);
    expect(
      isActivatableTarget(el({ tagName: "DIV", getAttribute: () => null })),
    ).toBe(false);
  });
});

describe("pageKeysBelongToField：PgUp/PgDn 在哪些输入控件里属于它自己", () => {
  it("textarea / select / 可编辑区：自己有滚动区（或选项列表）→ 让回去", () => {
    expect(pageKeysBelongToField(el({ tagName: "TEXTAREA" }))).toBe(true);
    expect(pageKeysBelongToField(el({ tagName: "SELECT" }))).toBe(true);
    expect(pageKeysBelongToField(el({ tagName: "DIV", isContentEditable: true }))).toBe(true);
  });

  it("单行 input（顶栏搜索框）：这两个键它自己不用 → 不让，交给列表翻页", () => {
    // 这条就是"搜完想在列表里 PageDown 却没反应"的根因回归测试。
    expect(pageKeysBelongToField(el({ tagName: "INPUT" }))).toBe(false);
    expect(pageKeysBelongToField(el({ tagName: "DIV" }))).toBe(false);
    expect(pageKeysBelongToField(null)).toBe(false);
  });
});

describe("applyScrollAction：到顶 / 到底 / 翻屏", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** 假容器：只用到 scrollTo / scrollBy 和三个尺寸属性，不需要真 DOM。 */
  const container = (
    init: { scrollTop?: number; clientHeight?: number; scrollHeight?: number } = {},
  ) => {
    const to: Array<{ top?: number }> = [];
    const by: Array<{ top?: number }> = [];
    const node = {
      scrollTop: init.scrollTop ?? 0,
      clientHeight: init.clientHeight ?? 800,
      scrollHeight: init.scrollHeight ?? 8000,
      scrollTo: (o: { top?: number }) => to.push(o),
      scrollBy: (o: { top?: number }) => by.push(o),
    };
    return { node: node as unknown as HTMLElement, to, by };
  };

  it("Home → 滚到 0", () => {
    const { node, to } = container({ scrollTop: 3000 });
    applyScrollAction(node, "top");
    expect(to.map((o) => o.top)).toEqual([0]);
  });

  it("PageDown / PageUp → 按一屏（可视高 − 40px）上下翻，而不是跳到底", () => {
    const down = container();
    applyScrollAction(down.node, "pageDown");
    expect(down.by.map((o) => o.top)).toEqual([760]);

    const up = container();
    applyScrollAction(up.node, "pageUp");
    expect(up.by.map((o) => o.top)).toEqual([-760]);
  });

  it("Ctrl+End：一次没到底 → 下一帧再校一次（窗口化列表的总高度会变大）", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    // 假容器不会真的滚动，所以第一次之后仍然"没到底" → 应当再校一次。
    const { node, to } = container({ scrollTop: 0 });
    applyScrollAction(node, "bottom");
    expect(to.map((o) => o.top)).toEqual([8000, 8000]);
  });

  it("Ctrl+End：已经到底 → 不多滚一次", () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const { node, to } = container({ scrollTop: 7200, clientHeight: 800, scrollHeight: 8000 });
    applyScrollAction(node, "bottom");
    expect(to.map((o) => o.top)).toEqual([8000]);
  });
});
