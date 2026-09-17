import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 渲染进程构建配置。客户端与管理端共用同一份 src，靠 URL 上的
// ?window=admin 这类标记区分要渲染哪个界面，所以这里只配一个入口即可。
// 用 .mts 后缀强制 Vite 按 ESM 加载本配置，避免 "Vite's Node API is deprecated"
// 的 CJS 警告（package.json 未设 "type":"module"，若叫 .ts 会被当 CommonJS 加载）。
export default defineConfig({
  // ⚠️ base 必须是相对路径 "./"：打包版窗口用 electron/windows.ts 的 win.loadFile() 加载
  // dist/index.html —— 那是 **file:// 协议**，而默认的 base "/" 会把 /assets/index-xxx.js
  // 解析到**盘根**（file:///D:/assets/…）→ 模块加载失败 → React 永不挂载，界面上只剩
  // index.html 里那句静态的 "Playday 加载中..."，而且**没有任何报错**（模块加载失败不触发
  // window.onerror，所以 boot 屏的错误处理器也不响）。2026-09-17 用户实测：部署版第一次
  // 启动就卡在那里。开发态没事是因为 dev 走 http://localhost:5173/，绝对路径在那儿是对的。
  // 网站端（server.mjs）在根路径提供 dist/，相对路径同样正确。
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    // 每次构建前清空 dist：之前是 false，导致 dist 里积了 496 个陈旧产物 / 45.88MB
    // （含 107 个 HorrorValleyView 历史副本、一个 1.27MB 的已删依赖 chunk）。
    // 陈旧产物不参与运行，但会让"这个 chunk 还在不在"这类判断失真（删依赖后以为没删干净）。
    emptyOutDir: true,
    // ---- 打包取舍：**性能优先，体积可以让**（2026-09-14 用户明确要求）----
    // 1. target: esnext —— Electron 的 Chromium 很新，原生支持最新 JS 语法。
    //    不再为老浏览器转译/打 polyfill，代码原样输出，运行时更快、更省内存。
    // 2. minify: "esbuild" —— 2026-09-14 恢复。此前是"临时诊断配置"（minify: false，
    //    为定位 "t.pure is not invalid" 那种被压成一行的运行时错误），之后一直没还原：
    //    结果是发布包里跑的是**未压缩**、68 个碎 chunk 的代码，每次启动都要多解析约 1.4 MB 源码。
    //    压缩只影响源码文本量，不改语义 —— 启动解析更快、内存更省（收益虽不巨大但零风险）。
    // 3. sourcemap: true —— 体积换可调试性：压缩后仍能在 DevTools 里看到原始源码与精确行号
    //    （当初要靠"关压缩 + 按包拆 chunk"才能读错误栈，现在用 sourcemap 拿到同样信息，
    //    却不必牺牲启动速度）。.map 只在打开 DevTools 时才读，运行期零成本。
    // 4. manualChunks —— 从"每个 npm 包一个 chunk"（68 个）收敛成 3 类：React 运行时、
    //    其余第三方、业务代码。本地应用读本地文件，chunk 越多启动越慢（每次都是一个
    //    独立的加载+解析回合，且拿不到"大 chunk 惰性解析"的好处）。
    target: "esnext",
    minify: "esbuild",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return; // 业务代码留在各自的入口 chunk 里
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
});
