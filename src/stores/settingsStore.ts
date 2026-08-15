// Settings store, loaded/saved through the backend.

import { create } from "zustand";
import { api } from "../api/client";
import type { AppSettings, Platform, CardTextStyle } from "../types/models";
import { DEFAULT_CARD_TEXT } from "../types/models";

// 把"卡片字号/加粗/自定义文字样式"应用到 :root 的 CSS 自定义属性上。
// 让 .grid-card .title 用 var(--card-title-size/color/stroke/glow/shadow/bg) 即可生效。
// 安全兜底：字段缺失或非法值时用默认值，避免 NaN 注入到 CSS。
// 把 "#aabbcc" + alpha 0..1 转成 "rgba(170,187,204,0.42)"，用于背景填充合成。
function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function applyCardTextStyles(s: Partial<AppSettings>) {
  if (typeof document === "undefined") return; // SSR 兜底
  const size = Math.max(10, Math.min(28, Number(s.cardFontSize) || 15));
  const weight = s.cardFontBold ? 700 : 500;

  // 合并 cardText 字段：缺字段用 DEFAULT_CARD_TEXT 兜底；缺整个对象用默认对象
  const ct: CardTextStyle = {
    ...DEFAULT_CARD_TEXT,
    ...(s.cardText || {}),
  } as CardTextStyle;
  const stroke = !!ct.stroke;
  const glow = !!ct.glow;
  const shadow = !!ct.shadow;
  const bg = !!ct.bg;
  const strokeW = stroke ? Math.max(0, Math.min(3, Number(ct.strokeWidth) || 1)) : 0;
  const glowBlur = glow ? Math.max(0, Math.min(30, Number(ct.glowBlur) || 0)) : 0;
  const shBlur = shadow ? Math.max(0, Math.min(20, Number(ct.shadowBlur) || 0)) : 0;
  const shX = shadow ? Math.max(-10, Math.min(10, Number(ct.shadowOffsetX) || 0)) : 0;
  const shY = shadow ? Math.max(-10, Math.min(10, Number(ct.shadowOffsetY) || 0)) : 0;
  const bgOp = bg ? Math.max(0, Math.min(1, Number(ct.bgOpacity) || 0)) : 0;

  const root = document.documentElement.style;
  root.setProperty("--card-title-size", `${size}px`);
  root.setProperty("--card-title-weight", String(weight));
  // 别名字号按标题 80% 缩放（11px 对应 14px 标题），保持视觉比例。
  root.setProperty("--card-alt-size", `${Math.max(9, Math.round(size * 0.8))}px`);
  // 用户自定义颜色/描边/发光/阴影/背景。CSS 用 var(--card-...) 读取。
  root.setProperty("--card-text-color", ct.color || "#fff8e7");
  root.setProperty("--card-stroke-color", ct.strokeColor || "#000000");
  root.setProperty("--card-stroke-width", `${strokeW}px`);
  root.setProperty("--card-glow-color", ct.glowColor || "#a040c8");
  root.setProperty("--card-glow-blur", `${glowBlur}px`);
  root.setProperty("--card-shadow-color", ct.shadowColor || "#000000");
  root.setProperty("--card-shadow-offset-x", `${shX}px`);
  root.setProperty("--card-shadow-offset-y", `${shY}px`);
  root.setProperty("--card-shadow-blur", `${shBlur}px`);
  // 背景色：开启时把 hex + bgOpacity 合成 rgba，让 CSS 拿到的是最终色（带透明度）；
  // 关闭或 opacity=0 时给 transparent，CSS 自然不显示背景块——彻底解决
  // "取消勾选仍有背景"的 bug。
  const bgRgba = bg && bgOp > 0 ? hexToRgba(ct.bgColor || "#000000", bgOp) : "transparent";
  root.setProperty("--card-bg-color", bgRgba);
  root.setProperty("--card-bg-opacity", String(bgOp));
  // 把"哪些效果启用"也写到 dataset，让 CSS 选择器判断是否真的应用
  const ds = document.documentElement.dataset;
  ds.cardStroke = stroke ? "1" : "0";
  ds.cardGlow = glow ? "1" : "0";
  ds.cardShadow = shadow ? "1" : "0";
  ds.cardBg = bg ? "1" : "0";
}

const DEFAULT_SETTINGS: AppSettings = {
  startupBehavior: "StartNormal",
  enableTray: true,
  minimizeToTray: false,
  closeToTray: false,
  language: "en-US",
  firstTimeWizardComplete: false,
  databasePath: undefined,
  autoBackupEnabled: true,
  gridViewImage: "Cover",
  detailsViewImage: "Background",
  listViewImage: "Icon",
  showInstalledOnly: false,
  showHidden: false,
  showFavorites: false,
  sortOrder: "Name",
  sortDirection: "Ascending",
  fullscreenMode: false,
  controllerSupport: false,
  loginEnabled: false,
  loginType: "wechat",
  loggedIn: false,
  username: undefined,
  trackPlaytime: true,
  cardWidth: 180,
  cardGap: 8,
  sidebarWidth: 210,
  enterpriseConfigPath: "D:/1.json",
  currentUserKind: "",
  currentUserName: "",
  currentUserLevel: 3,
  fontFamily: "",
  cardFontSize: 15,
  cardFontBold: false,
  cardText: DEFAULT_CARD_TEXT,
  themeId: undefined,
  styleId: undefined,
};

interface SettingsState {
  settings: AppSettings;
  platforms: Platform[];
  loaded: boolean;

  load: () => Promise<void>;
  save: (s: Partial<AppSettings>) => Promise<void>;
  loadPlatforms: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  platforms: [],
  loaded: false,

  load: async () => {
    // 如果 main.tsx 已经预加载并注入了 settings（治本：避免启动闪烁），
    // 这里直接返回，不再 invoke——否则会在 React 渲染途中再次切换语言，
    // 引发"先英文再中文"的闪烁。
    if (get().loaded) return;
    const raw = await api.getSettings();
    // 用 DEFAULT_SETTINGS 兜底：老 config.json / web 端没合并默认值时，
    // 缺的字段（cardFontSize/cardText 等）会用默认，避免 undefined 导致后续渲染出错。
    const merged = { ...DEFAULT_SETTINGS, ...(raw as Partial<AppSettings>) } as AppSettings;
    // cardText 单独合并：缺整个对象用默认；缺字段用默认字段
    merged.cardText = { ...DEFAULT_CARD_TEXT, ...(merged.cardText || {}) } as CardTextStyle;
    set({ settings: merged, loaded: true });
    applyCardTextStyles(merged);
  },

  save: async (partial) => {
    const current = get().settings;
    const next: AppSettings = {
      ...current,
      ...partial,
      cardText: partial.cardText
        ? { ...current.cardText, ...partial.cardText }
        : current.cardText,
    } as AppSettings;
    const saved = await api.saveSettings(next);
    set({ settings: saved });
    applyCardTextStyles(saved);
  },

  loadPlatforms: async () => {
    const platforms = await api.getPlatforms();
    set({ platforms });
  },
}));