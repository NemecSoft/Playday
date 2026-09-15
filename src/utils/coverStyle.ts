// 封面渲染风格（设置 → 外观）——纯逻辑、零依赖，规则可单测。
//
// 为什么单独一个文件：滤镜"长什么样"是产品决定，注入给 CSS 的是字符串。
// 两件事都要能测（非法配置回退、每个风格对应哪串滤镜），所以从组件/CSS 里抽出来。
//
// 应用范围：游戏卡片封面、详情页大图、资讯封面（三处都读同一个 CSS 变量
// `--cover-style-filter`，由 settingsStore 注入）。
//
// ⚠️ 与"锁定态"的关系：黄金版看钻石版游戏会叠加 `grayscale(.6) brightness(.62)`。
// 两者都用 filter，所以 locked 规则里必须把本变量**拼在**锁定滤镜前面
// （见 global.css 的 .grid-card.locked .cover img），否则会互相覆盖。

export const COVER_STYLES = ["none", "vivid", "soft", "sepia", "contrast"] as const;
export type CoverStyle = (typeof COVER_STYLES)[number];

export const DEFAULT_COVER_STYLE: CoverStyle = "none";

/** 每个风格对应的 CSS filter 值（"none" 表示不处理）。 */
const FILTERS: Record<CoverStyle, string> = {
  none: "none",
  // 鲜艳：提高饱和度 + 略提对比，暗环境/大屏更抓眼。
  vivid: "saturate(1.25) contrast(1.08)",
  // 柔和：略降饱和 + 提亮，长时间看不刺眼。
  soft: "saturate(0.85) brightness(1.06)",
  // 怀旧：泛黄 + 略暖。
  sepia: "sepia(0.55) saturate(1.05) contrast(1.02)",
  // 高对比：拉开明暗，适合本身偏灰的封面。
  contrast: "contrast(1.35) saturate(1.1)",
};

/**
 * 把配置里的任意值收敛成合法风格。
 * 非法/缺失/老配置一律回退 `none`（原图）—— 宁可当没设，也不要用一个"半个滤镜"。
 */
export function clampCoverStyle(value: unknown): CoverStyle {
  const v = typeof value === "string" ? value.trim() : "";
  return (COVER_STYLES as readonly string[]).includes(v) ? (v as CoverStyle) : DEFAULT_COVER_STYLE;
}

/** 风格 → CSS filter 值（直接写进 `--cover-style-filter`）。 */
export function coverStyleFilter(value: unknown): string {
  return FILTERS[clampCoverStyle(value)];
}
