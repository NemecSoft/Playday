// Settings store, loaded/saved through the backend.

import { create } from "zustand";
import { api } from "../api/client";
import type { AppSettings, DeepPartial, Platform, CardTextStyle } from "../types/models";
import { DEFAULT_CARD_TEXT } from "../types/models";
import { CARD_DESC_LINES, effectiveCardDescFontSize } from "../utils/cardText";
import { coverStyleFilter } from "../utils/coverStyle";
import { DEFAULT_SETTINGS } from "../../shared/models";
// 主题改由顶栏 ThemeTopPicker 预设切换（themeApply.ts 注入 :root），
// 不再走设计器（applyDesigner 会用旧 designer.paletteId 覆盖刚选的配色，
// 导致"切主题不生效"，已移除）。DesignerSection 文件保留备查。

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

/**
 * 把网格卡片行间距（cardRowGap）注入到 :root 的 CSS 变量上。
 * .grid-card 的 padding-bottom 读 var(--card-row-gap)，所以滑块调整即时生效。
 * 兜底：字段缺失或非法值时落到 6px（保持老版默认间距，不破坏现有布局）。
 */
export function applyGridRowGap(s: Partial<AppSettings>) {
  if (typeof document === "undefined") return; // SSR 兜底
  const v = Math.max(0, Math.min(60, Number(s.cardRowGap) || 0));
  document.documentElement.style.setProperty("--card-row-gap", `${v}px`);
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
  // 简介字号：CSS .grid-desc 用 var(--card-desc-font-size) 读取。
  // 0 = 跟随游戏名字号（默认，"和游戏名一样大"）；显式值范围 9~28。
  // GridView 也会订阅这个值参与精确行高公式（3 行截断高度依赖字号）。
  // clamp 与"跟随"规则统一在 utils/cardText.ts（避免两处重复）。
  const descSize = effectiveCardDescFontSize(s.cardDescFontSize, size);
  root.setProperty("--card-desc-font-size", `${descSize}px`);
  // 简介默认显示行数：同时供 CSS（-webkit-line-clamp）与 GridView 的行高公式使用 ——
  // 唯一来源是 utils/cardText.ts 的 CARD_DESC_LINES（别在两处各写一份数字）。
  root.setProperty("--card-desc-lines", String(CARD_DESC_LINES));
  // 封面渲染风格 → CSS 变量。三处封面（卡片 / 详情大图 / 资讯）都读它；
  // 非法值由 coverStyleFilter 回退成 none（老配置没有这个字段）。
  root.setProperty("--cover-style-filter", coverStyleFilter(s.coverStyle));
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
  // 属性名注意：这里原来是 ds.cardBg，和 designerApply 写的 data-card-bg
  // （"solid"/"gradient"/"panel" = 卡片背景模式）**撞在同一个属性上**，谁后写谁生效。
  // 结果每次启动 applyCardTextStyles 都会把它冲成 "0"/"1"，
  // 使 CSS 的 :root[data-card-bg="solid"|"gradient"] 永不匹配（卡片背景模式失灵）。
  // 改用独立的 data-card-text-bg（文字的底片开关）。
  ds.cardTextBg = bg ? "1" : "0";
}

interface SettingsState {
  settings: AppSettings;
  platforms: Platform[];
  loaded: boolean;

  load: () => Promise<void>;
  // 补丁语义：允许只改嵌套对象里的字段（如 save({ cardText: { color } })）。
  // 主进程 writeSettings 会做一层深合并，所以这里传部分嵌套对象是安全的。
  save: (s: DeepPartial<AppSettings>) => Promise<void>;
  /** 只改内存不落盘：给 Ctrl+滚轮这类高频操作用（滚完由调用方 debounce 后再 save）。 */
  apply: (s: DeepPartial<AppSettings>) => void;
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
    // 配色由 main.tsx 的 restoreLibraryTheme 恢复（localStorage + config.json 双保险），
    // 这里只做卡片文字/行距。
    applyCardTextStyles(merged);
    applyGridRowGap(merged);
  },

  save: async (partial) => {
    const current = get().settings;
    const localCardText = partial.cardText
      ? { ...current.cardText, ...partial.cardText }
      : current.cardText;
    // 只把"本次改动的字段"发给主进程（不发明文全量）。
    // 主进程会先读盘上的 config.json 再合并，因此用户手工编辑过的配置
    // （数据库/封面/详情页路径等）不会被内存里的旧值覆盖——这是之前
    // "手改 config.json 被应用重启后清掉"的根因。
    const saved = await api.saveSettings(partial);
    set({
      settings: {
        ...saved,
        // 主进程返回的是"盘上配置 + 本次改动"，cardText 可能只有部分字段，做个合并兜底。
        cardText: saved.cardText ? { ...saved.cardText, ...localCardText } : localCardText,
      } as AppSettings,
    });
    // 注意：这里不能再 applyDesigner——否则保存 themeId 时会用旧设计器配色
    // 覆盖刚选的主题（"切主题不生效"的根因）。
    applyCardTextStyles(saved);
    applyGridRowGap(saved);
  },

  apply: (partial) => {
    const merged = { ...get().settings, ...partial } as AppSettings;
    set({ settings: merged });
  },

  loadPlatforms: async () => {
    const platforms = await api.getPlatforms();
    set({ platforms });
  },
}));