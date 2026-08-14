import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 渲染进程构建配置。客户端与管理端共用同一份 src，靠 URL 上的
// ?window=admin 这类标记区分要渲染哪个界面，所以这里只配一个入口即可。
// 用 .mts 后缀强制 Vite 按 ESM 加载本配置，避免 "Vite's Node API is deprecated"
// 的 CJS 警告（package.json 未设 "type":"module"，若叫 .ts 会被当 CommonJS 加载）。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    // emptyOutDir: true, // IDE 安全策略禁用：清空 >50 文件需要确认。改为手动删 dist。
    emptyOutDir: false,
    // 性能优先（不关心体积）：
    // 1. target: esnext —— Electron 的 Chromium 很新，原生支持最新 JS 语法。
    //    不再为老浏览器转译/打 polyfill，代码原样输出，运行时更快、更省内存。
    // 2. manualChunks —— 把 React 框架等"几乎不变"的依赖单独拆成 vendor chunk。
    //    启动时 vendor 与业务代码分开解析；业务代码改动不会触发 vendor 重新
    //    解析，二次启动/热更更快。
    target: "esnext",
    // 临时诊断配置：关闭压缩 + 按包拆分，便于定位 "t.pure is not invalid"
    // 这类只在 vendor 里出现、被 minify 压成一行的运行时错误。
    // 定位后需恢复 minify: "esbuild" 和下方 manualChunks 的生产优化配置。
    minify: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 按 node_modules 下的顶层包名拆分成独立 chunk（如 vendor-react、vendor-router）。
          // 这样浏览器错误栈会精确指向具体是哪个第三方库抛的错，而不是挤在一行 vendor。
          if (id.includes("node_modules")) {
            const match = id.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
            const name = match ? match[1].replace("@", "").replace("/", "-") : "misc";
            return "vendor-" + name;
          }
        },
      },
    },
  },
});
