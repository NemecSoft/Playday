// 综合主题/配色/字体设计器——"整套视觉预设"库。
// 每个预设是一整套（配色 + 形状 + 字体 + 卡片 + 背景渐变 + 圆角），点一下整套应用；
// 应用后可在此基础上分项微调（见 DesignerSection）。
import type { DesignerConfig } from "../../shared/models";

export interface DesignerPreset {
  id: string;
  name: string;
  /** 默认标签（i18n 可用时覆盖） */
  defaultLabel: string;
  /** 描述（可选） */
  desc?: string;
  /** 预设的缩略预览主色（用于卡片缩略图背景） */
  previewColors: [string, string];
  /** 一整套 DesignerConfig（不含 presetId，应用时填入） */
  config: Omit<DesignerConfig, "presetId">;
}

export const DESIGNER_PRESETS: DesignerPreset[] = [
  {
    id: "dark-modern",
    name: "modern-dark",
    defaultLabel: "现代暗黑",
    desc: "默认：暗黑 + 苹果圆润 + 系统字体",
    previewColors: ["#171a1f", "#2563eb"],
    config: {
      paletteId: "p-dark",
      bgMode: "solid",
      panelMode: "solid",
      radius: 14,
      styleId: "apple",
      fontFamily: "",
      cardFontSize: 15,
      cardDescFontSize: 11,
      cardFontBold: false,
      cardBg: "panel",
      cardBorder: true,
      cardText: {
        color: "#fff8e7", stroke: true, strokeColor: "#000000", strokeWidth: 1.5,
        glow: false, glowColor: "#a040c8", glowBlur: 10,
        shadow: true, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 1, shadowBlur: 2,
        bg: false, bgColor: "#000000", bgOpacity: 0.5,
      },
    },
  },
  {
    id: "bright-clean",
    name: "bright-clean",
    defaultLabel: "明亮清爽",
    desc: "浅色：明亮 + 苹果 + 白卡",
    previewColors: ["#f3f5f9", "#2563eb"],
    config: {
      paletteId: "p-light",
      bgMode: "solid",
      panelMode: "solid",
      radius: 12,
      styleId: "apple",
      fontFamily: "",
      cardFontSize: 15,
      cardDescFontSize: 11,
      cardFontBold: false,
      cardBg: "solid",
      cardBgColor: "#ffffff",
      cardBorder: true,
      cardText: {
        color: "#1b2430", stroke: false, strokeColor: "#000000", strokeWidth: 0,
        glow: false, glowColor: "#2563eb", glowBlur: 0,
        shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
        bg: false, bgColor: "#000000", bgOpacity: 0,
      },
    },
  },
  {
    id: "soft-neumorph",
    name: "soft-neumorph",
    defaultLabel: "软浮雕",
    desc: "柔和：暗黑 + 软浮雕 + 大圆角",
    previewColors: ["#1c1e26", "#9db2d0"],
    config: {
      paletteId: "p-dark",
      bgMode: "solid",
      panelMode: "solid",
      radius: 18,
      styleId: "s2",
      fontFamily: "",
      cardFontSize: 15,
      cardDescFontSize: 11,
      cardFontBold: false,
      cardBg: "panel",
      cardBorder: false,
      cardText: {
        color: "#e8eaed", stroke: false, strokeColor: "#000000", strokeWidth: 0,
        glow: false, glowColor: "#ffffff", glowBlur: 0,
        shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
        bg: false, bgColor: "#000000", bgOpacity: 0,
      },
    },
  },
  {
    id: "recordly",
    name: "recordly",
    defaultLabel: "Recordly",
    desc: "克制 SaaS：浅色 + 蓝橙渐变描边",
    previewColors: ["#f3f5f9", "#fd8152"],
    config: {
      paletteId: "p-recordly",
      bgMode: "solid",
      panelMode: "solid",
      radius: 14,
      styleId: "recordly",
      fontFamily: "",
      cardFontSize: 15,
      cardDescFontSize: 11,
      cardFontBold: false,
      cardBg: "solid",
      cardBgColor: "#ffffff",
      cardBorder: true,
      cardText: {
        color: "#1b2430", stroke: false, strokeColor: "#000000", strokeWidth: 0,
        glow: false, glowColor: "#2563eb", glowBlur: 0,
        shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
        bg: false, bgColor: "#000000", bgOpacity: 0,
      },
    },
  },
  {
    id: "fluent",
    name: "fluent",
    defaultLabel: "Fluent 微软",
    desc: "微软 Fluent 2：深灰表面 + 微软蓝 + 中等圆角 + Segoe UI",
    previewColors: ["#1b1b1b", "#0f6cbd"],
    config: {
      paletteId: "p-fluent",
      bgMode: "solid",
      panelMode: "solid",
      radius: 6,
      styleId: "fluent",
      fontFamily: "",
      cardFontSize: 15,
      cardDescFontSize: 11,
      cardFontBold: false,
      cardBg: "panel",
      cardBorder: true,
      cardText: {
        color: "#f3f3f3", stroke: false, strokeColor: "#000000", strokeWidth: 0,
        glow: false, glowColor: "#0f6cbd", glowBlur: 0,
        shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
        bg: false, bgColor: "#000000", bgOpacity: 0,
      },
    },
  },
  {
    id: "fluent-light",
    name: "fluent-light",
    defaultLabel: "Fluent 微软 · 白",
    desc: "微软 Fluent 2 浅色：白/浅灰表面 + 微软蓝 + 中等圆角",
    previewColors: ["#f3f3f3", "#0f6cbd"],
    config: {
      paletteId: "p-fluent-light",
      bgMode: "solid",
      panelMode: "solid",
      radius: 6,
      styleId: "fluent",
      fontFamily: "",
      cardFontSize: 15,
      cardDescFontSize: 11,
      cardFontBold: false,
      cardBg: "solid",
      cardBgColor: "#ffffff",
      cardBorder: true,
      cardText: {
        color: "#1b1b1b", stroke: false, strokeColor: "#000000", strokeWidth: 0,
        glow: false, glowColor: "#0f6cbd", glowBlur: 0,
        shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
        bg: false, bgColor: "#000000", bgOpacity: 0,
      },
    },
  },
  {
    id: "neon-gradient",
    name: "neon-gradient",
    defaultLabel: "霓虹渐变",
    desc: "炫酷：暗黑渐变背景 + 大圆角 + 荧光字",
    previewColors: ["#0b0f1a", "#6d5df6"],
    config: {
      paletteId: "p-dark",
      bgMode: "gradient",
      bgGradient: { from: "#0b0f1a", to: "#2a1b3d", angle: 135 },
      panelMode: "gradient",
      panelGradient: { from: "#141a2e", to: "#241b3a", angle: 135 },
      radius: 20,
      styleId: "apple",
      fontFamily: "",
      cardFontSize: 15,
      cardDescFontSize: 11,
      cardFontBold: true,
      cardBg: "panel",
      cardBorder: true,
      cardText: {
        color: "#ffffff", stroke: false, strokeColor: "#000000", strokeWidth: 0,
        glow: true, glowColor: "#6d5df6", glowBlur: 15,
        shadow: false, shadowColor: "#000000", shadowOffsetX: 0, shadowOffsetY: 0, shadowBlur: 0,
        bg: false, bgColor: "#000000", bgOpacity: 0,
      },
    },
  },
];
