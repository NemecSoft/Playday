import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 管理端（Playday.Admin.exe）独立构建配置。
// 输出到 ./dist-admin（独立于客户端的 ./dist）。
// 打包时管理端入口用 dist-admin 作为前端产物，加载 admin/index.html。
export default defineConfig({
  root: "admin",
  // 相对 base，产物可放在任意路径（portable）。
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist-admin",
    emptyOutDir: true,
  },
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
  },
});
