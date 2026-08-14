// Tailwind CSS 配置。
// 项目从 PlayniteTauri（Rust/Tauri）移植过来时保留了 Tailwind 类名，但 Electron 版一直
// 漏装了 Tailwind 依赖，导致 flex/grid 等工具类全部失效、界面布局混乱。这里补上。
// content 扫描 src 里所有可能写类名的文件（tsx/ts/html/css）。
//
// 颜色：项目在 global.css 里用 CSS 变量定义了一套主题色（--bg-base / --accent / --border 等），
// 组件里写的是 tailwind 颜色类名（bg-base / text-accent / border-border 等）。这里把每个
// 颜色名映射到对应 CSS 变量，让这些类名真的能用上主题色。
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx,css}"],
  theme: {
    extend: {
      colors: {
        // 背景
        base: "var(--bg-base)",
        panel: "var(--bg-panel)",
        card: "var(--bg-card)",
        input: "var(--bg-input)",
        sidebar: "var(--bg-sidebar)",
        "item-hover": "var(--bg-item-hover)",
        "item-active": "var(--bg-item-active)",
        muted: "var(--bg-item-hover)",
        // 文字
        foreground: "var(--text-primary)",
        "primary-text": "var(--text-primary)",
        "secondary-text": "var(--text-secondary)",
        dim: "var(--text-dim)",
        // 强调色
        accent: "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-soft": "var(--accent-soft)",
        // 边框
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        // 危险/告警
        danger: "var(--danger)",
      },
    },
  },
  // 有些类名是"在字符串里拼出来的"（不是完整写在 className= 里），Tailwind 扫描不到，
  // 这类必须手动放进 safelist 才能生成对应的 CSS，否则运行时没样式。暂时先留空，
  // 如果后续发现某些动态类名失效，往这里补即可。
  safelist: [],
  plugins: [],
};
