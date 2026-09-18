import { defineConfig } from "vitest/config";

// 单元测试配置。刻意保持极简：
//  - node 环境足够（待测的都是纯逻辑）。需要 DOM 的文件在文件头写
//    `// @vitest-environment jsdom` 单独声明。
//  - 跑 src/ 与 shared/ 下的 *.test.ts(x)。主进程侧的启动路径/进程判定逻辑
//    优先抽到 shared/（纯函数、不 import electron），就是为了能在这里直接测。
//  - 也跑 electron/ 下的 *.test.ts，但**有硬约束：不得 import electron**
//    （node 环境里没有 electron 模块，测不了也跑不起来），只许依赖 node 内置模块。
//    为什么需要这条：有些主进程逻辑天生离不开 fs（如 core/videoLibrary.ts 的视频
//    扫描/分类）—— 它既不能放 shared/（shared/ 会被打进渲染层 bundle，不能出现
//    node 内置模块），又值得单测；靠 vitest 自动收集会**静默不执行**（配置里写了
//    include，没列到的目录一律不跑），所以显式列进来。
//  - 也跑 scripts/ 下的 *.test.mjs：脚本里也有"规则型"逻辑值得锁住
//    （如 scripts/playnite-savepaths.mjs 的存档路径解析 —— 判据与切分方式都是从真实
//    数据里反推出来的，靠人记住迟早会漂）。同样只许依赖 node 内置模块；
//    **唯一例外是 chroma-js**：配色工具链的核心算法都在它上面（scripts/lib/md3Color.mjs，
//    MD3 色调体系），不引它这几条性质就没法测。它是 devDependency、不进应用包，
//    所以放行（渲染层仍然不许依赖它）。
//  - 断言用 vitest 自带 expect，不引入额外断言/测试库。
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      "shared/**/*.test.ts",
      "electron/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    globals: false,
  },
});
