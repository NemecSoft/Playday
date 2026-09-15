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
//
// 本文件还提供一条**平台小秘密**：连按 5 次 Ctrl+H → 切换"显示被平台隐藏的游戏"
//（见下面 SECRET_* 常量与 ③ 那段）。

import { useEffect, useRef } from "react";
import { useGamesStore } from "../stores/gamesStore";
import { useUIStore } from "../stores/uiStore";
import { useI18n } from "../i18n";
import { api } from "../api/client";
import {
  applyScrollAction,
  historyActionFor,
  isActivatableTarget,
  isTypingTarget,
  resolveScrollTarget,
  scrollMatchFor,
} from "../utils/keyboardScroll";

/**
 * Alt+←/→ 走的是**选项卡访问历史**（`utils/tabs.ts` 的 `backTab` / `forwardTab`）。
 * 2026-09-15 改版：以前这是"路由前进/后退"（主页 ↔ 详情页），详情页改成选项卡之后，
 * 等价的行为就是"回上一个访问过的选项卡"。
 */
/** 小秘密：连按几次 Ctrl+H 才算触发（5 次 = 平台运维才知道的组合）。 */
const SECRET_PRESSES = 5;
/** 两次 Ctrl+H 之间超过这个毫秒数就重新计数（免得日常按键被凑数）。 */
const SECRET_WINDOW_MS = 2000;

export function useGlobalShortcuts() {
  const { t } = useI18n();
  const showHidden = useGamesStore((s) => s.showHidden);
  const toggleHidden = useGamesStore((s) => s.toggleHidden);
  const hiddenTotal = useGamesStore((s) => s.games.filter((g) => g.hidden).length);

  // 指针位置：keydown 时用它判断"指针停在哪个可滚区上"（与滚轮直觉一致）。
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  // ③ 平台小秘密（2026-09-15 需求）：连按 5 次 Ctrl+H → 切换"显示被平台隐藏的游戏"。
  //    背景：平台会把"这台机器 / 这个渠道不提供"的游戏标成 hidden（见
  //    scripts/migrate-playnite/README.md），列表里正常**不显示**；运维要查看时用这个
  //    组合键临时显示出来，再按 5 次收回。
  //    为什么做成"连按 N 次"而不是一个普通开关：这是个不该被玩家碰到的入口，
  //    写在设置里就等于给了公开开关。计数规则（按其它键 / 间隔超时清零）也是为了防误触。
  useEffect(() => {
    let presses = 0;
    let lastAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastAt > SECRET_WINDOW_MS) presses = 0;
      lastAt = now;
      const isSecret =
        (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "h" || e.key === "H");
      if (!isSecret) {
        presses = 0;
        return;
      }
      presses += 1;
      if (presses < SECRET_PRESSES) return;
      presses = 0;
      const willShow = !showHidden;
      toggleHidden();
      void api.showNotification(
        t(willShow ? "secret_hidden_on" : "secret_hidden_off"),
        willShow ? t("secret_hidden_on_body", { count: String(hiddenTotal) }) : "",
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHidden, toggleHidden, hiddenTotal, t]);

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
        // 用 getState() 取最新的选项卡状态：这个监听只装一次（下面的依赖为空），
        // 走 hook 订阅反而得把回调塞进依赖、每次渲染重装一遍监听。
        const ui = useUIStore.getState();
        if (nav === "back") ui.backTab();
        else ui.forwardTab();
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
  }, []);
}
