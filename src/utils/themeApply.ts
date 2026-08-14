// Runtime theme application for the 96-palette theme library.
//
// Static shadcn themes (dark/light/cyberpunk/chinese) live in tokens.css and
// are switched via next-themes' `data-theme` attribute. The dynamic library
// themes (themeLibrary.ts) instead inject their tokens onto :root at runtime,
// overriding the CSS variables so every component — migrated (shadcn tokens)
// or not (legacy --bg-base/--text-primary) — follows the chosen palette.

import type { ThemePaletteTokens } from "./themeLibrary";
import type { StyleVars } from "./styleLibrary";

const STORAGE_KEY = "app-theme";
const STYLE_KEY = "app-style";

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
};

/** Apply a palette's tokens onto :root (documentElement inline style). */
export function applyPaletteTheme(palette: ThemePaletteTokens): void {
  const root = document.documentElement;
  (Object.keys(palette) as (keyof ThemePaletteTokens)[]).forEach((k) => {
    root.style.setProperty(KEY_TO_VAR[k], palette[k]);
  });
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
