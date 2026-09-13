// PostCSS 配置：让 Tailwind 的 @tailwind 指令能被处理成真正的 CSS。
// Vite 会自动读取这个文件。autoprefixer 负责给 CSS 加浏览器前缀（新环境一般可省，
// 但保留无害，符合主流搭建方式）。
//
// 第三个插件是**本项目自己的**：把 font-size（和同规则里的绝对 line-height）包上
// `var(--ui-font-scale)`，实现"设置里调字体大小" —— 只动文字，不动界面尺寸。
// 它必须排在 tailwindcss **之后**：这样 Tailwind 生成的 text-xs / text-[11px] 也一起被覆盖到。
// 详见 postcss-font-scale.cjs 的文件头说明。
const tailwindcss = require("tailwindcss");
const autoprefixer = require("autoprefixer");
const fontScale = require("./postcss-font-scale.cjs");

module.exports = {
  plugins: [tailwindcss(), fontScale(), autoprefixer()],
};
