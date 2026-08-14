// PostCSS 配置：让 Tailwind 的 @tailwind 指令能被处理成真正的 CSS。
// Vite 会自动读取这个文件。autoprefixer 负责给 CSS 加浏览器前缀（新环境一般可省，
// 但保留无害，符合主流搭建方式）。
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
