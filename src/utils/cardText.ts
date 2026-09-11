// 卡片文字相关的共享工具。
// 单一数据源：卡片简介字号 clamp 逻辑只在此处定义，settingsStore 和 GridView 都引用，
// 避免两处各自写 `Math.max(9, Math.min(16, ...))` 导致改一处漏一处。

/** 卡片简介字号的合法范围（9~16px），默认 11px。
 *  供设置持久化（settingsStore）和卡片行高公式（GridView）统一使用。 */
export function clampCardDescFontSize(value: number | string | null | undefined): number {
  const n = Number(value) || 11;
  return Math.max(9, Math.min(16, n));
}
