// PostCSS 插件：让"字体大小"可以全局缩放 —— **只动文字，不动界面尺寸**。
//
// 需求：设置里要能调"字体大小"，但**不要调整界面大小**（弹窗、按钮、封面都不许跟着变）。
//
// 为什么写成 PostCSS 插件，而不是手改那 100 多处 font-size：
//   ① src/styles/global.css 里有 130+ 处写死的 font-size；
//   ② 界面里还有大量 Tailwind 工具类（text-xs / text-sm / text-[11px] …），
//      它们是在构建时生成 CSS 的，手改源码根本改不到；
//   ③ 手改必然漏，而且以后新写的又会漏回原样。
//   放在 PostCSS 链的**最后**，就能一次覆盖"自己的 CSS + Tailwind 生成的工具类"。
//
// 规则（保守优先，宁可不动也不要弄坏）：
//   1. 只改 font-size，且只认 px / rem 这两种绝对可乘的单位；
//      值里已经含 var() / calc() 的一律跳过（避免套娃，比如 var(--card-desc-font-size)）。
//   2. 同一条规则里的**绝对单位 line-height**（px / rem）一起缩放：
//      Tailwind 的 text-* 就是 font-size + line-height 成对给的，只放大字号会让
//      多行文字挤在没变大的行框里。无单位行高（如 1.5）本来就相对字号，自动跟随，不动。
//   3. 其他一律不碰：width/height/padding/margin/gap 都是界面尺寸，改了就成"界面缩放"了。
//
// 缩放因子变量 --ui-font-scale 的默认值在 src/styles/global.css 的 :root 里（默认 1）。
// 运行时由 src/utils/uiFont.ts 的 applyUiFontScale() 改写。

/** 已经含变量/表达式 → 不动。 */
const HAS_EXPR = /var\(|calc\(|env\(/;
/** 可缩放的绝对值：数字 + px/rem。 */
const SCALABLE = /^(-?\d*\.?\d+)(px|rem|)$/;

module.exports = () => ({
  postcssPlugin: "playday-font-scale",
  Declaration(decl) {
    if (decl.prop !== "font-size") return;
    const value = decl.value.trim();
    if (HAS_EXPR.test(value)) return;
    const m = value.match(SCALABLE);
    if (!m) return;
    // 无单位（理论上不该出现在 font-size 上）也按 px 语义处理；这里只放行 px/rem。
    if (!m[2]) return;

    decl.value = `calc(${value} * var(--ui-font-scale))`;

    // 同一条规则里的绝对行高一起缩放（见文件头说明 2）。
    const rule = decl.parent;
    const nodes = rule && Array.isArray(rule.nodes) ? rule.nodes : null;
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type !== "decl" || node.prop !== "line-height") continue;
      const lv = String(node.value).trim();
      if (HAS_EXPR.test(lv)) continue;
      const lm = lv.match(SCALABLE);
      if (!lm || !lm[2]) continue;
      node.value = `calc(${lv} * var(--ui-font-scale))`;
    }
  },
});

module.exports.postcss = true;
