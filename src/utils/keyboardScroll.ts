// 通用滚动/前进后退快捷键的**纯逻辑 + 目标解析**（键位决策可单测，DOM 解析集中在文件后半）。
//
// 键位选择参照 **Chromium 的滚动键位**（本项目就是个 Electron 浏览器壳，
// 用户对 Home/End/PageUp/PageDown/空格 的预期应该和浏览器完全一致）：
//
//   Home / Ctrl+Home    → 到最上面
//   End  / Ctrl+End     → 到最下面
//   PageUp              → 上一屏
//   PageDown            → 下一屏
//   Space / Shift+Space → 下一屏 / 上一屏（浏览器习惯：空格翻页）
//   Alt+← / Alt+→       → 后退 / 前进（详情页 ↔ 主页，浏览器习惯）
//
// 作用对象的选择：**焦点所在的可滚区优先，其次是指针下的可滚区**（见 resolveScrollTarget）。
// 这样弹窗、侧栏、详情页各自滚自己，不会出现"按 PageDown 结果背景网格动了"。

export type ScrollAction = "top" | "bottom" | "pageUp" | "pageDown";

/** 只用到这几个字段，便于单测直接构造对象（不需要真实 DOM）。 */
export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export interface ScrollMatch {
  action: ScrollAction;
  /** 来自空格键的翻页要额外让给"焦点在按钮上"的场景（空格 = 激活按钮）。 */
  source: "key" | "space";
}

/** 是否存在多个滚动动作的歧义键（Alt/Win 组合一律不碰，留给别的功能，如 Alt+滚轮调封面）。 */
export function scrollMatchFor(e: KeyLike): ScrollMatch | null {
  if (e.altKey || e.metaKey) return null;

  // Ctrl 组合里只认 Home/End。Ctrl+Space 是输入法切换、Ctrl+PageUp 等在浏览器里是"切换标签页"，
  // 都不该被我们拿来做滚动。
  if (e.ctrlKey) {
    if (e.key === "Home") return { action: "top", source: "key" };
    if (e.key === "End") return { action: "bottom", source: "key" };
    return null;
  }

  if (e.key === "Home") return { action: "top", source: "key" };
  if (e.key === "End") return { action: "bottom", source: "key" };
  if (e.key === "PageDown") return { action: "pageDown", source: "key" };
  if (e.key === "PageUp") return { action: "pageUp", source: "key" };
  // 空格：现代浏览器 event.key 就是 " "，旧的是 "Spacebar"，都认。
  if (e.key === " " || e.key === "Spacebar") {
    return { action: e.shiftKey ? "pageUp" : "pageDown", source: "space" };
  }
  return null;
}

/** Alt+← / Alt+→ = 后退 / 前进。 */
export function historyActionFor(e: KeyLike): "back" | "forward" | null {
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.key === "ArrowLeft") return "back";
  if (e.key === "ArrowRight") return "forward";
  return null;
}

/**
 * 翻一屏滚多少像素。
 * Chromium 的 PageDown 用的是"可视高 - 40px"（留一点重叠，读者不会漏掉一行），这里照抄。
 * 容器还没量出高度（0）时给 1，避免滚 0 变成"按键没反应"。
 */
export function pageStep(clientHeight: number): number {
  const h = Number(clientHeight);
  if (!Number.isFinite(h) || h <= 0) return 1;
  return Math.max(1, Math.round(h - 40));
}

/** 焦点在输入类元素里（输入框/文本域/下拉/可编辑区）→ 这些键要还给输入框自己用（Home/End 移动光标）。 */
export function isTypingTarget(el: Element | null | undefined): boolean {
  const node = el as (HTMLElement & { tagName?: string }) | null | undefined;
  const tag = node?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return node?.isContentEditable === true;
}

/** 焦点在"可激活元素"上（按钮/链接/菜单项…）→ 空格是"激活它"，不该被我们抢来做翻页。 */
export function isActivatableTarget(el: Element | null | undefined): boolean {
  const node = el as (HTMLElement & { tagName?: string }) | null | undefined;
  const tag = node?.tagName?.toLowerCase();
  if (tag === "button" || tag === "a" || tag === "summary" || tag === "label") return true;
  const role = typeof node?.getAttribute === "function" ? node.getAttribute("role") : null;
  return role === "button" || role === "menuitem" || role === "option" || role === "tab" || role === "checkbox";
}

// ============================================================================
// 以下是 DOM 部分（不参与单测）
// ============================================================================

/** 这个元素自己或它的祖先里，第一个"真的能上下滚"的容器。 */
export function findScrollable(start: Element | null | undefined): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let node = start as HTMLElement | null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
    const scrollableByStyle = !!style && /(auto|scroll|overlay)/.test(style.overflowY);
    if (scrollableByStyle && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * 在某个子树里找第一个"真的能上下滚"的元素（弹窗用：弹窗的滚动条在它内部，
 * 而弹窗本身通常不是滚动容器）。
 */
export function findScrollableWithin(root: Element | null | undefined): HTMLElement | null {
  if (!root || typeof root.querySelectorAll !== "function") return null;
  for (const node of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    const style = typeof getComputedStyle === "function" ? getComputedStyle(node) : null;
    const scrollableByStyle = !!style && /(auto|scroll|overlay)/.test(style.overflowY);
    // clientHeight > 0 = 可见；不可见的滚动容器（display:none）不能当目标。
    if (scrollableByStyle && node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
  }
  return null;
}

/**
 * 决定"这次翻页/跳转该滚谁"。优先级：
 *   1) 有弹窗 → 弹窗内部的滚动区（**绝不滚背景**：指针可能在弹窗外的背景上）
 *   2) 焦点所在的可滚区（侧栏/详情页/网格各自滚自己）
 *   3) 鼠标指针下的可滚区（和滚轮直觉一致）
 *   4) 兜底：主内容区 .content，再不行整页
 */
export function resolveScrollTarget(pointer?: { x: number; y: number } | null): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const dialog = document.querySelector('[role="dialog"]');
  if (dialog) {
    return findScrollableWithin(dialog) ?? findScrollable(document.activeElement);
  }

  const fromFocus = findScrollable(document.activeElement);
  if (fromFocus) return fromFocus;

  if (pointer && typeof document.elementFromPoint === "function") {
    const under = document.elementFromPoint(pointer.x, pointer.y);
    const fromPointer = findScrollable(under);
    if (fromPointer) return fromPointer;
  }

  const main = document.querySelector<HTMLElement>(".content");
  if (main) return main;
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

/** 真正执行滚动。尊重 prefers-reduced-motion（减弱动效时直接跳，不做平滑动画）。 */
export function applyScrollAction(el: HTMLElement, action: ScrollAction): void {
  const behavior: ScrollBehavior =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";

  if (action === "top") {
    el.scrollTo({ top: 0, behavior });
    return;
  }
  if (action === "bottom") {
    el.scrollTo({ top: el.scrollHeight, behavior });
    return;
  }
  const step = pageStep(el.clientHeight);
  el.scrollBy({ top: action === "pageDown" ? step : -step, behavior });
}
