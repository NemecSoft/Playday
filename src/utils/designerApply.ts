// 综合主题/配色/字体设计器——运行时应用。
// 把 DesignerConfig 应用为 CSS 变量：配色（palette）+ 形状（style/radius）+
// 背景渐变（bg/panel）+ 字体 + 卡片（背景/边框/文字）。
// 这是设计器的"单一应用入口"，预设一键应用和分项微调都走这里。
import type { DesignerConfig } from "../../shared/models";
import { themeLibrary } from "./themeLibrary";
import { styleLibrary } from "./styleLibrary";
import { applyPaletteTheme, clearPaletteTheme, applyStyleVars } from "./themeApply";

/** 把渐变 spec 转成 CSS linear-gradient 字符串 */
function gradientCss(g: { from: string; to: string; angle: number }): string {
  return `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`;
}

/**
 * 应用整套设计器配置到界面。
 * - paletteId → 配色
 * - styleId → 形状（radius 会被下面的 designer.radius 覆盖）
 * - radius → 全局圆角
 * - bgMode/panelMode + 渐变 → 背景/面板（渐变时覆盖单色变量）
 * - fontFamily → 字体
 * - cardBg/cardBorder/cardText → 卡片
 */
export function applyDesigner(designer: DesignerConfig): void {
  const root = document.documentElement;

  // 1) 配色：清掉上一次的调色板变量，再按 paletteId 注入
  clearPaletteTheme();
  const paletteEntry = themeLibrary.find((p) => p.id === designer.paletteId);
  if (paletteEntry) {
    applyPaletteTheme(paletteEntry.palette);
    document.body.dataset.themeId = designer.paletteId;
  }

  // 2) 形状：按 styleId 应用样式变量（含 radius/glow/shadow/font/blur/fx）
  const styleEntry = styleLibrary.find((s) => s.id === designer.styleId);
  if (styleEntry) {
    applyStyleVars(styleEntry.vars);
  }

  // 3) 全局圆角：designer.radius 覆盖 style 里的 radius（手动值优先）
  root.style.setProperty("--radius", `${designer.radius}px`);

  // 4) 背景 / 面板渐变：gradient 时注入渐变变量覆盖单色变量
  if (designer.bgMode === "gradient" && designer.bgGradient) {
    root.style.setProperty("--bg-base-gradient", gradientCss(designer.bgGradient));
    root.dataset.bgMode = "gradient";
  } else {
    root.style.removeProperty("--bg-base-gradient");
    root.dataset.bgMode = "solid";
  }
  if (designer.panelMode === "gradient" && designer.panelGradient) {
    root.style.setProperty("--bg-panel-gradient", gradientCss(designer.panelGradient));
    root.dataset.panelMode = "gradient";
  } else {
    root.style.removeProperty("--bg-panel-gradient");
    root.dataset.panelMode = "solid";
  }

  // 5) 字体
  root.style.setProperty("--font-ui", designer.fontFamily || "");

  // 6) 卡片
  //    - 背景：solid（用 cardBgColor）/ gradient / panel（跟随面板，不设）
  if (designer.cardBg === "solid" && designer.cardBgColor) {
    root.style.setProperty("--card-bg-solid", designer.cardBgColor);
    root.dataset.cardBg = "solid";
  } else if (designer.cardBg === "gradient" && designer.cardGradient) {
    root.style.setProperty("--card-bg-gradient", gradientCss(designer.cardGradient));
    root.dataset.cardBg = "gradient";
  } else {
    root.dataset.cardBg = "panel";
  }
  //    - 边框
  root.style.setProperty("--card-border-enabled", designer.cardBorder ? "1" : "0");
  //    - 文字：卡片文字由 cardText 驱动（复用 --card-text-* 变量，CSS 组件读取）
  const ct = designer.cardText;
  root.style.setProperty("--card-text-color", ct.color);
  root.style.setProperty("--card-text-stroke-enabled", ct.stroke ? "1" : "0");
  root.style.setProperty("--card-text-stroke-color", ct.strokeColor);
  root.style.setProperty("--card-text-stroke-width", `${ct.strokeWidth}px`);
  root.style.setProperty("--card-text-glow-enabled", ct.glow ? "1" : "0");
  root.style.setProperty("--card-text-glow-color", ct.glowColor);
  root.style.setProperty("--card-text-glow-blur", `${ct.glowBlur}px`);
  root.style.setProperty("--card-text-shadow-enabled", ct.shadow ? "1" : "0");
  root.style.setProperty("--card-text-shadow-color", ct.shadowColor);
  root.style.setProperty("--card-text-shadow-x", `${ct.shadowOffsetX}px`);
  root.style.setProperty("--card-text-shadow-y", `${ct.shadowOffsetY}px`);
  root.style.setProperty("--card-text-shadow-blur", `${ct.shadowBlur}px`);
  root.style.setProperty("--card-text-bg-enabled", ct.bg ? "1" : "0");
  root.style.setProperty("--card-text-bg-color", ct.bgColor);
  root.style.setProperty("--card-text-bg-opacity", `${ct.bgOpacity}`);
}
