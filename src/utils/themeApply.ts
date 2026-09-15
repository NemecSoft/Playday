// Runtime theme application for the 96-palette theme library.
//
// Static shadcn themes (dark/light/cyberpunk/chinese) live in tokens.css and
// are switched via next-themes' `data-theme` attribute. The dynamic library
// themes (themeLibrary.ts) instead inject their tokens onto :root at runtime,
// overriding the CSS variables so every component — migrated (shadcn tokens)
// or not (legacy --bg-base/--text-primary) — follows the chosen palette.

import { api } from "../api/client";
import type { ThemePaletteTokens } from "./themeLibrary";
import type { StyleVars } from "./styleLibrary";
import { isDarkBackground } from "./titlePalette";

const STORAGE_KEY = "app-theme";
const STYLE_KEY = "app-style";

/**
 * "详情页主题需要重载"的通知事件。
 * 详情页的颜色是**服务器发 HTML 时**注入的（见 electron/core/detailTheme.ts），
 * 已经在看的那个 iframe 不会自己变色 —— 要重载才会去服务器拿新的。谁在看详情页谁监听
 * （目前只有 `src/pages/GameDetailPage.tsx`）。
 */
export const DETAIL_THEME_EVENT = "yungame:detail-theme-changed";

/**
 * Shadow presets (enum from styleLibrary) → concrete box-shadow.
 * `soft` is a Neumorphism-style dual-sided shadow (highlight top-left, shade
 * bottom-right) so surfaces read as softly extruded. Best paired with a
 * near-single-colour palette (card ≈ background) for the classic soft UI.
 */
const SHADOW_MAP: Record<string, string> = {
  none: "none",
  soft:
    "-6px -6px 14px rgba(255,255,255,0.28), 6px 6px 16px rgba(0,0,0,0.32), inset -1px -1px 2px rgba(255,255,255,0.22), inset 1px 1px 2px rgba(0,0,0,0.12)",
  hard: "4px 4px 0 rgba(0,0,0,0.28)",
  deep: "0 20px 60px rgba(0,0,0,0.4)",
  glass:
    "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
  neon: "0 0 12px var(--accent-soft), 0 0 24px var(--accent-soft)",
  aurora: "0 0 8px var(--accent-soft), 0 0 24px var(--accent-soft)",
};

/** Glow presets (enum) → concrete text-shadow. */
const GLOW_MAP: Record<string, string> = {
  none: "none",
  neon: "0 0 6px var(--accent-soft), 0 0 12px var(--accent-soft)",
  aurora: "0 0 8px var(--accent-soft), 0 0 20px var(--accent-soft)",
  glass: "0 1px 2px rgba(255,255,255,0.3)",
};

/** Map a ThemePaletteTokens key to the CSS variable name it sets. */
const KEY_TO_VAR: Record<keyof ThemePaletteTokens, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  cardForeground: "--card-foreground",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  secondary: "--secondary",
  secondaryForeground: "--secondary-foreground",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  border: "--border",
  ring: "--ring",
  // legacy business variables
  bgBase: "--bg-base",
  bgTop: "--bg-top",
  bgSidebar: "--bg-sidebar",
  bgPanel: "--bg-panel",
  bgItemHover: "--bg-item-hover",
  bgItemActive: "--bg-item-active",
  bgInput: "--bg-input",
  borderStrong: "--border-strong",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textDim: "--text-dim",
  accent: "--accent",
  accentHover: "--accent-hover",
  accentSoft: "--accent-soft",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  // 可选字段：游戏名固定色（见 themeLibrary.ts 的 titleColor 说明）。
  // 放进这张表还有两个附带好处：切主题时会被 clearPaletteTheme() 一并清掉（不会串色）；
  // 主题没定义该字段时下面是 undefined，不注入，自动回落到 CSS 默认的 var(--ui-accent)。
  titleColor: "--title-fill",
};

/** Apply a palette's tokens onto :root (documentElement inline style). */
export function applyPaletteTheme(palette: ThemePaletteTokens): void {
  const root = document.documentElement;
  // 先清空上一次配色注入的所有变量，再应用新配色。
  // 否则新配色里没定义（未覆盖）的变量会保留上一个配色残留的值，
  // 造成"切换配色后颜色残留/串色"的问题。
  clearPaletteTheme();
  (Object.keys(palette) as (keyof ThemePaletteTokens)[]).forEach((k) => {
    const value = palette[k];
    // 可选字段（目前只有 titleColor）没定义时**什么都不注入**：让它回落到 CSS 默认值，
    // 而不是写一个空串把变量清成空（那会让标题变透明/继承错色）。
    if (!value) return;
    root.style.setProperty(KEY_TO_VAR[k], value);
  });
  // 顺手把新配色同步给主进程（详情页 HTML 注入用，见 syncDetailTheme）。
  // 刻意**不 await**：切主题本身要立刻生效，不能被一次 IPC 拖住。
  void syncDetailTheme();
}

/**
 * 把**当前生效的**配色变量同步给主进程（详情页注入用）。
 *
 * 为什么读 `:root` 的计算值，而不是直接用传进来的 palette 对象：
 *   设置主题的入口不止一个（顶栏下拉 / 设置里的配色与风格 / 设计器 / 启动恢复），
 *   让每个入口各自记得来调一次"同步"，迟早会漏一个 —— 而且漏了不报错，只是详情页颜色不对。
 *   读计算值 = "界面现在实际是什么颜色，就注入什么颜色"，与谁来设置无关。
 *
 * 成功之后派发 DETAIL_THEME_EVENT：详情页的颜色是服务器发 HTML 时注入的，
 * 正在看的那个 iframe 必须重载才会变（由 GameDetailPage 监听）。
 *
 * 失败一律静默：网站端（server.mjs）没有这条命令，详情页保持它自己的颜色即可 ——
 * 这是锦上添花的能力，不该在主界面上弹任何东西。
 */
export async function syncDetailTheme(): Promise<void> {
  try {
    const cs = getComputedStyle(document.documentElement);
    const vars: Record<string, string> = {};
    for (const name of Object.values(KEY_TO_VAR)) {
      const v = cs.getPropertyValue(name).trim();
      if (v) vars[name] = v;
    }
    if (Object.keys(vars).length === 0) return;
    await api.setDetailTheme(vars, isDarkBackground());
    window.dispatchEvent(new Event(DETAIL_THEME_EVENT));
  } catch {
    /* 静默：见函数说明 */
  }
}

/** Clear any runtime-injected palette (fall back to static data-theme). */
export function clearPaletteTheme(): void {
  const root = document.documentElement;
  (Object.values(KEY_TO_VAR)).forEach((v) => {
    root.style.removeProperty(v);
  });
}

export function getStoredThemeId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function storeThemeId(id: string | null): void {
  if (id) localStorage.setItem(STORAGE_KEY, id);
  else localStorage.removeItem(STORAGE_KEY);
}

/** Restore the previously chosen library theme on startup.
 *  `gradientClass` 可选：传入当前选中 palette 的 gradientClass 字段，
 *  用于恢复 body 专属 class（如钻石版、5 套新渐变配色）。 */
export function restoreLibraryTheme(
  library: { id: string; palette: ThemePaletteTokens }[],
  gradientClass?: string,
): void {
  const id = getStoredThemeId();
  if (!id) return;
  const entry = library.find((t) => t.id === id);
  if (entry) {
    applyPaletteTheme(entry.palette);
    // 让"钻石版渐变"这类需要专属背景的 palette 在重启后也能正确触发。
    document.body.dataset.themeId = id;
    document.body.classList.toggle(
      "theme-diamond",
      gradientClass === "theme-diamond",
    );
  }
}

/* ---- Style application (non-color design variables) ---- */

/** Apply a style's non-color variables onto :root. */
export function applyStyleVars(vars: StyleVars): void {
  const root = document.documentElement;
  root.style.setProperty("--radius", vars.radius);
  root.style.setProperty("--glow", GLOW_MAP[vars.glow] || "none");
  root.style.setProperty("--shadow", SHADOW_MAP[vars.shadow] || "none");
  root.style.setProperty("--font-ui", vars.font);
  root.style.setProperty("--blur", vars.blur || "0px");
  // Toggle frosted-glass mode for surfaces when the style has a blur.
  const glassOn = (vars.blur || "0px") !== "0px";
  root.dataset.glass = glassOn ? "1" : "";
  // Effect feature tag → :root[data-fx] drives style-specific CSS effects.
  root.dataset.fx = vars.fx || "";
}

export function getStoredStyleId(): string | null {
  return localStorage.getItem(STYLE_KEY);
}

export function storeStyleId(id: string | null): void {
  if (id) localStorage.setItem(STYLE_KEY, id);
  else localStorage.removeItem(STYLE_KEY);
}

/** Restore the previously chosen style on startup. */
export function restoreStyle(styles: { id: string; vars: StyleVars }[]): void {
  const id = getStoredStyleId();
  if (!id) return;
  const entry = styles.find((s) => s.id === id);
  if (entry) applyStyleVars(entry.vars);
}
