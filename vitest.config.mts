import { defineConfig } from "vitest/config";

// 单元测试配置。刻意保持极简：
//  - node 环境足够（待测的都是纯逻辑）。需要 DOM 的文件在文件头写
//    `// @vitest-environment jsdom` 单独声明。
//  - 只跑 src/ 与 shared/ 下的 *.test.ts(x)。主进程侧的启动路径/进程判定逻辑
//    被刻意抽到 shared/（纯函数、不 import electron），就是为了能在这里直接测。
//  - 断言用 vitest 自带 expect，不引入额外断言/测试库。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "shared/**/*.test.ts"],
    globals: false,
  },
});
