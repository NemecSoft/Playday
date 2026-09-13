// 应用自带字体（fonts 目录）的加载与应用 —— 前端的**单一入口**。
//
// 需求：界面字体用我们自己的字体（默认 fonts\字酷堂清楷 简.ttf），**不依赖系统字体**；
// 只有 fonts 文件夹不存在时才回退系统字体。
//
// 三步（都在这里做，别在组件里各写一遍）：
//   1) 问主进程要字体清单（IPC get_ui_fonts；字体文件由本地 HTTP 服务器提供，
//      因为开发态页面是 http://localhost:5173，读不了 file:// 字体）；
//   2) 注入 @font-face（<style id="playday-ui-fonts">）；
//   3) 设置 --font-ui —— 用**内联样式**（优先级最高），所以自带字体盖过主题自带的字体；
//      用户在字体下拉里显式选别的字体，也是走这里覆盖。
//
// 时序：main.tsx 在渲染前 fire-and-forget 调用 setupUiFonts()，字体晚到没关系
// （@font-face 用 font-display: swap，加载完自动替换，不会白屏也不会卡启动）。

import { api } from "../api/client";
import { SYSTEM_FONT_OPTION, toFontOptions, type FontOption } from "./fonts";

/** 自带字体后面跟随的系统兜底：自带字体缺某个字形（比如生僻字）时用它。 */
const SYSTEM_FALLBACK = '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
const STYLE_ID = "playday-ui-fonts";

export interface UiFontsState {
  /** fonts 目录存在且里面有可用字体。 */
  found: boolean;
  /** 实际使用的字体目录（排查用）。 */
  dir: string;
  /** 默认字体的 family（"" = 没找到 → 用系统字体）。 */
  defaultFamily: string;
  /** 下拉选项（第一项固定是"系统默认字体"）。 */
  options: FontOption[];
}

let state: UiFontsState = {
  found: false,
  dir: "",
  defaultFamily: "",
  options: [SYSTEM_FONT_OPTION],
};
let pending: Promise<UiFontsState> | null = null;

/** 已经拿到的字体信息（同步读，给"渲染时想知道默认字体是啥"的地方用）。 */
export function uiFontsState(): UiFontsState {
  return state;
}

/** 拉一次字体清单并注入 @font-face。幂等：多次调用共用同一个 Promise。 */
export function loadUiFonts(): Promise<UiFontsState> {
  if (pending) return pending;
  pending = (async () => {
    try {
      const info = await api.getUiFonts();
      injectFontFaces(info.fonts);
      state = {
        found: info.found,
        dir: info.dir,
        defaultFamily: info.defaultFamily,
        options: toFontOptions(info.fonts),
      };
    } catch (e) {
      // 拿不到（Web 端、主进程老版本、服务器起不来…）→ 什么都不做 = 系统字体。
      console.warn("[uiFont] 读取自带字体失败，改用系统字体:", e);
    }
    return state;
  })();
  return pending;
}

/** CSS 字符串里安全的字体名（font-family 用双引号包住，名字里的引号/反斜杠要清掉）。 */
function safeFamilyName(family: string): string {
  return family.replace(/["\\]/g, "").trim();
}

function injectFontFaces(fonts: { family: string; url: string }[]): void {
  if (typeof document === "undefined") return;
  // 不写 format(...)：ttf/otf/ttc 让浏览器自己嗅探，省得扩展名与 format 对不上就整条失效。
  const css = fonts
    .filter((f) => safeFamilyName(f.family) && f.url)
    .map(
      (f) =>
        `@font-face{font-family:"${safeFamilyName(f.family)}";src:url("${f.url}");font-display:swap;}`,
    )
    .join("\n");
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

/**
 * 应用"字体大小"（百分比）。
 *
 * 只改 `--ui-font-scale` 这一个变量，**界面尺寸一律不动**：
 * 每一处 font-size 在构建期已被 postcss-font-scale.cjs 包成 `calc(Npx * var(--ui-font-scale))`，
 * 所以改这个值就等于"全部文字乘一个系数"，而宽度/高度/padding/间距完全不变。
 *
 * @param percent 百分比（100 = 原始）。非法值按 100 处理。
 */
export function applyUiFontScale(percent: number | null | undefined): void {
  if (typeof document === "undefined") return;
  const n = Number(percent);
  const pct = Number.isFinite(n) && n > 0 ? Math.max(50, Math.min(250, n)) : 100;
  document.documentElement.style.setProperty("--ui-font-scale", String(pct / 100));
}

/**
 * 应用界面字体。
 * @param family 字体名；空串/null → 移除内联变量（回退系统/主题字体）。
 */
export function applyUiFont(family: string | null | undefined): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const name = safeFamilyName(family ?? "");
  if (name) el.style.setProperty("--font-ui", `"${name}", ${SYSTEM_FALLBACK}`);
  else el.style.removeProperty("--font-ui");
}

/**
 * 一站式：加载字体 + 应用。
 * @param preferred 用户显式选的字体（settings.fontFamily）；为空则用自带默认字体，
 *                  自带默认字体也没有（fonts 目录不存在/找不到默认文件）→ 系统字体。
 */
export async function setupUiFonts(preferred?: string): Promise<void> {
  const st = await loadUiFonts();
  applyUiFont((preferred ?? "").trim() || st.defaultFamily);
}
