// 全局通用快捷键（滚动 / 后退前进）——**注册在 window 上，一处生效全应用可用**。
//
// 为什么做成一个 hook 而不是散在各组件里：快捷键是"全局行为"，散着写必然出现
// "这个页面能用、那个页面不能用"，以及互相抢键（`/` 与 Ctrl+F 各写一份那种）。
// 键位与判定规则集中在 src/utils/keyboardScroll.ts（纯逻辑、有单测），这里只做两件事：
//   ① 装监听、按规则派发；② 把"不该抢键"的场景排除掉（输入框、按钮上的空格）。
//
// 不与本文件冲突的既有快捷键（都已存在，别重复实现）：
//   Ctrl+滚轮 整页缩放（ZoomIndicator）、Alt+滚轮 调封面（GridView）、
//   `/` 或 Ctrl+F 聚焦搜索（Toolbar）、F11 全屏（TopBar）、Esc 关设置（SettingsModal）。

import { useEffect, useRef } from "react";
import {
  applyScrollAction,
  historyActionFor,
  isActivatableTarget,
  isTypingTarget,
  resolveScrollTarget,
  scrollMatchFor,
} from "../utils/keyboardScroll";

/**
 * @param navigate react-router 的 navigate —— Alt+←/→ 用它做后退/前进
 *                 （本应用是 HashRouter：主页 ↔ 详情页就是一次前进/后退）。
 */
export function useGlobalShortcuts(navigate?: (delta: number) => void) {
  // 指针位置：keydown 时用它判断"指针停在哪个可滚区上"（与滚轮直觉一致）。
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as Element | null;

      // ① 后退 / 前进：Alt+← / Alt+→。
      //    在输入框里也放行 —— Alt+← 在文本框里没有标准含义，而"返回上一页"是通用预期。
      const nav = historyActionFor(e);
      if (nav) {
        e.preventDefault();
        navigate?.(nav === "back" ? -1 : 1);
        return;
      }

      // ② 滚动类：Home / End / PageUp / PageDown / 空格。
      const match = scrollMatchFor(e);
      if (!match) return;

      // 输入框 / 文本域 / 可编辑区里，这些键属于它自己（Home/End 移动光标、空格打空格）。
      // ⚠️ 例外：**Ctrl+Home / Ctrl+End 仍然滚**。浏览器里它们是"光标移到开头/结尾"，
      //   但在本应用里用户要的就是"一键到最上/最下"（需求点名了这两个键），
      //   而且"搜索完想回到列表顶部"恰恰是焦点还在搜索框时最常发生的场景 ——
      //   所以这里刻意偏离浏览器一点：输入框内 Home/End 管光标，Ctrl+Home/End 管列表。
      const ctrlJump = e.ctrlKey && (e.key === "Home" || e.key === "End");
      if (isTypingTarget(el) && !ctrlJump) return;
      // 焦点在按钮/链接上时，空格的含义是"激活它"，不抢（PageDown 等照常滚动，浏览器也这样）。
      if (match.source === "space" && isActivatableTarget(el)) return;

      const target = resolveScrollTarget(pointerRef.current);
      if (!target) return;
      e.preventDefault();
      applyScrollAction(target, match.action);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}
