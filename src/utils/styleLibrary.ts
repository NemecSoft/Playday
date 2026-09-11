// Hand-curated style library — 7 signature visual styles.
//
// (This file was previously auto-generated with 67 style categories by
// scripts/gen-styles.py. It is now a small, hand-authored collection of
// high-identity styles. It keeps the same StyleVars / StyleEntry shape so the
// runtime injection (themeApply.ts) and the ThemesSection picker work
// unchanged.)
//
// Each style contributes non-color design variables (radius/glow/shadow/font/
// blur) plus an optional `fx` effect tag. The `fx` tag drives strong,
// style-specific CSS effects in globals.css via `:root[data-fx="..."]`,
// giving every signature style a recognizable visual identity.

export interface StyleVars {
  radius: string;
  glow: string;
  shadow: string;
  font: string;
  blur: string;
  /**
   * Effect feature tag driving style-specific CSS in globals.css via
   * `:root[data-fx="..."]`. Empty string means no extra effect.
   */
  fx?: string;
}

export interface StyleEntry {
  id: string;
  name: string;
  zh: string;
  category: string;
  vars: StyleVars;
}

export const styleLibrary: StyleEntry[] = [
  {
    id: "apple",
    name: "Apple",
    zh: "苹果",
    category: "设计",
    vars: {
      radius: "16px",
      glow: "none",
      shadow: "glass",
      font: "inherit",
      blur: "16px",
      fx: "apple",
    },
  },
  {
    id: "s2",
    name: "Neumorphism",
    zh: "软浮雕",
    category: "圆润",
    vars: {
      radius: "16px",
      glow: "none",
      shadow: "soft",
      font: "inherit",
      blur: "0px",
      fx: "soft",
    },
  },
  {
    id: "s3",
    name: "Glassmorphism",
    zh: "毛玻璃",
    category: "圆润",
    vars: {
      radius: "16px",
      glow: "none",
      shadow: "glass",
      font: "inherit",
      blur: "12px",
      fx: "glass",
    },
  },
  {
    id: "s4",
    name: "Brutalism",
    zh: "粗野硬朗",
    category: "方正",
    vars: {
      radius: "0px",
      glow: "none",
      shadow: "hard",
      font: "monospace",
      blur: "0px",
      fx: "brutal",
    },
  },
  {
    id: "s35",
    name: "Cyberpunk / Sci-Fi HUD",
    zh: "赛博朋克 / 科幻HUD",
    category: "未来",
    vars: {
      radius: "8px",
      glow: "neon",
      shadow: "none",
      font: "monospace",
      blur: "0px",
      fx: "cyber",
    },
  },
  {
    id: "s43",
    name: "Pixel Art",
    zh: "像素风",
    category: "复古",
    vars: {
      radius: "2px",
      glow: "none",
      shadow: "none",
      font: "monospace",
      blur: "0px",
      fx: "pixel",
    },
  },
  {
    id: "s10",
    name: "Retro-Futurism / Vaporwave",
    zh: "复古未来 / 蒸汽波",
    category: "复古",
    vars: {
      radius: "2px",
      glow: "neon",
      shadow: "neon",
      font: "monospace",
      blur: "0px",
      fx: "retro",
    },
  },
  {
    id: "recordly",
    name: "Recordly",
    zh: "Recordly",
    category: "SaaS",
    vars: {
      radius: "14px",
      glow: "none",
      shadow: "soft",
      font: "inherit",
      blur: "0px",
      fx: "recordly",
    },
  },
  {
    id: "fluent",
    name: "Fluent 2",
    zh: "Fluent 微软",
    category: "微软",
    vars: {
      // Fluent 2 设计系统：中等圆角（borderRadiusLarge=6px，偏方正克制）、
      // 无霓虹特效、克制的柔和阴影、Segoe UI 主字体（Windows 平台 Fluent 主字体）。
      radius: "6px",
      glow: "none",
      shadow: "soft",
      font: "'Segoe UI', system-ui, sans-serif",
      blur: "0px",
      fx: "",
    },
  },
];
