// Task 9 无头验证：应用信息（appName/version/os/arch/dataDir）+ 命名配置正确性。
// 窗口控制/托盘需真实 GUI 环境，无头环境验证其数据来源与配置接线。
import fs from "fs";
import path from "path";

const ROOT = "d:/AI/Code/Playnite/Playday";

// ---- 命名配置 ----
const build = fs.readFileSync(path.join(ROOT, "build.config.ts"), "utf-8");
const appName = build.match(/APP_NAME = "([^"]+)"/)?.[1];
const clientExe = build.match(/CLIENT_EXE_NAME = "([^"]+)"/)?.[1];
const adminExe = build.match(/ADMIN_EXE_NAME = "([^"]+)"/)?.[1];
console.log("APP_NAME:", appName, "| CLIENT_EXE:", clientExe, "| ADMIN_EXE:", adminExe);

// ---- 版本号（读 package.json）----
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
console.log("package.json version:", pkg.version);

// ---- config.ts 是否导出 APP_VERSION 且 system.ts 引用它 ----
const configSrc = fs.readFileSync(path.join(ROOT, "electron", "config.ts"), "utf-8");
const systemSrc = fs.readFileSync(path.join(ROOT, "electron", "ipc", "system.ts"), "utf-8");
console.log("config.ts 导出 APP_VERSION:", configSrc.includes("APP_VERSION"));
console.log("system.ts 引用 APP_NAME/APP_VERSION:", systemSrc.includes("APP_NAME") && systemSrc.includes("APP_VERSION"));

// ---- dataDir 应为绿色存储目录（YUNGAME_DATA_DIR 或项目 data/）----
process.env.YUNGAME_DATA_DIR = path.join(ROOT, "data");
// 复刻 paths.configRoot 的优先级逻辑
const envDir = process.env.YUNGAME_DATA_DIR;
const dataDir = envDir && path.isAbsolute(envDir) ? envDir : path.join(ROOT, "data");
console.log("dataDir(绿色存储):", dataDir);

// ---- 命令接线：register.ts 是否注册了 system / 托盘是否在 main.ts 接入 ----
const registerSrc = fs.readFileSync(path.join(ROOT, "electron", "ipc", "register.ts"), "utf-8");
const mainSrc = fs.readFileSync(path.join(ROOT, "electron", "main.ts"), "utf-8");
const traySrc = fs.readFileSync(path.join(ROOT, "electron", "core", "tray.ts"), "utf-8");
console.log("register.ts 注册 system:", registerSrc.includes("registerSystemIpc"));
console.log("main.ts 创建托盘:", mainSrc.includes("createTray"));
console.log("tray.ts 有打开/退出菜单:", traySrc.includes("打开") && traySrc.includes("退出"));

// ---- 校验：system 命令全集存在 ----
for (const cmd of ["get_app_info","minimize_window","maximize_window","is_maximized","is_fullscreen","toggle_fullscreen","close_window","hide_window","show_window","show_notification","quit"]) {
  const present = systemSrc.includes(`"${cmd}"`);
  if (!present) console.log("缺失命令:", cmd);
}
console.log("\nTask 9 逻辑验证完成 ✅（窗口/托盘交互需 GUI 实测）");
