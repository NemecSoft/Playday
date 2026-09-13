// 通用快捷键的键位规则（可执行说明）。
// 实现：src/utils/keyboardScroll.ts（这里只测"纯决策"部分，DOM 解析不测）。
import { describe, expect, it } from "vitest";
import {
  historyActionFor,
  isActivatableTarget,
  isTypingTarget,
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
