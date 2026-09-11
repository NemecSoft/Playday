// 绿色存储路径解析。
// 所有数据（数据库 config.json 封面图等）都放在"可执行文件所在目录"下，
// 不写注册表、不写 C 盘用户目录，保证整个程序拷到哪都能用。
// 解析顺序：
//   1. 如果设置了自定义数据目录（通过环境变量 YUNGAME_DATA_DIR 覆盖，方便测试/管理端重定向），优先用它。
//   2. 打包后（exe）：若 exe 同级有 data 目录就当作数据根（绿色便携模式），否则用 exe 同级目录。
//   3. 开发态（npm run dev，不在打包后的 exe 里）回退到项目根目录，避免污染打包目录。

import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

// 判断当前是否处于"打包后的生产环境"（electron-builder 会把资源放到 resources/app.asar）。
function isPackaged(): boolean {
  // app.isPackaged 在 Electron 里区分 dev / 生产构建。
  return app.isPackaged;
}

// 返回数据根目录（config.json / library.db / CoverImages 等都放在这里）。
export function configRoot(): string {
  // 测试或管理端可通过环境变量指定数据目录（必须是绝对路径）。
  const envDir = process.env.YUNGAME_DATA_DIR;
  if (envDir && path.isAbsolute(envDir)) {
    return envDir;
  }

  if (isPackaged()) {
    const exeDir = path.dirname(process.execPath);
    // 绿色便携模式：如果 exe 同级有 data 目录，就用它当数据根。
    // 这样把整个文件夹（exe + data）拷到哪都能直接跑，数据全集中在 data 里。
    // （参照 VS Code portable 把 user-data 重定向到 <app>/data 的做法）
    const portableData = path.join(exeDir, "data");
    if (fs.existsSync(portableData) && fs.statSync(portableData).isDirectory()) {
      return portableData;
    }
    // 否则回退 exe 所在目录（老布局：数据直接放 exe 同级）。
    return exeDir;
  }

  // 开发环境：回退到项目根目录（Playday/），方便调试，不污染打包目录。
  // __dirname 在打包后是 resources/app.asar/electron/core，往上三级到项目根。
  return path.resolve(__dirname, "..", "..", "..");
}

// 源库路径：<数据根>/Admin/library.db
// 管理端应用已移除，这个库现在由"手工维护的 games.json + 批处理/脚本"写入
// （import-games.bat → playday-db.mjs），是数据的唯一来源。
export function sourceDatabasePath(): string {
  return path.join(configRoot(), "Admin", "library.db");
}

// 运行时库路径（客户端每次启动用它）：<数据根>/library/library.db
export function runtimeDatabasePath(): string {
  return path.join(configRoot(), "library", "library.db");
}

// 数据库文件路径（不做配置，固定"源库 → 运行时库"两级）：
//   源库 <数据根>/Admin/library.db —— 数据来源（手工/脚本维护）；
//   运行时库 <数据根>/library/library.db —— 客户端每次启动从源库复制一份再用，
//   这样运行中的数据不会被外部改动影响，重启即拿到最新数据。
// 为什么不做成可配置：一旦允许自定义，复制目标就会指向另一个文件，
// 出现"配置的库 / 被复制的库"两个不同的数据库，数据来源就不唯一了。
export function databasePath(): string {
  return runtimeDatabasePath();
}

// 主程序所在目录（config.json 的家）：
//   打包版 = exe 所在目录（config.json 与主程序同级，方便用户直接找到改）；
//   开发态 = 项目根（Playday/）。
// 注意与 configRoot() 的区别：configRoot 可被 YUNGAME_DATA_DIR 重定向到数据目录，
// 而 config.json 始终跟主程序走，不进数据目录。
export function appRoot(): string {
  if (isPackaged()) {
    return path.dirname(process.execPath);
  }
  // 开发环境：项目根（__dirname 在打包后是 resources/app.asar/electron/core，往上三级到项目根）。
  return path.resolve(__dirname, "..", "..", "..");
}

// 应用设置文件路径：<主程序目录>/config.json（不再放数据目录里）。
export function configPath(): string {
  return path.join(appRoot(), "config.json");
}

// 旧版 config.json 位置（<数据根>/config.json），用于一次性自动迁移。
export function legacyConfigPath(): string {
  return path.join(configRoot(), "config.json");
}

// 封面图目录：默认 <数据根>/CoverImages（图片按游戏名同名丢进去，程序自动匹配）。
// 可通过 config.json 的 settings.coverImagesDir 自定义；
// 支持绝对路径或相对路径（相对路径以数据根为基准解析）。
export function coverImagesDir(): string {
  return configuredPath("coverImagesDir") ?? path.join(configRoot(), "CoverImages");
}

// 读取 config.json 里 settings 下某个"自定义路径"字段（目录或文件都适用）。
// 支持：绝对路径原样使用；相对路径以数据根为基准解析；未配置（含空串）返回 null（用默认）。
// 注意：这里直接解析 config.json，不 import settings.ts，避免 paths ↔ settings 循环依赖。
export function configuredPath(field: string): string | null {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as { settings?: Record<string, unknown> };
    const p = parsed?.settings?.[field];
    if (p && typeof p === "string" && p.trim() !== "") {
      // path.resolve：绝对路径原样返回，相对路径以数据根为基准补全。
      return path.resolve(configRoot(), p.trim());
    }
    return null;
  } catch {
    // config.json 不存在或损坏：没有自定义路径，用默认。
    return null;
  }
}

// 游戏静态详情页目录。
// 默认是 <数据根>/Game_Details；如果用户设置了 gameDetailsDir（config.json），
// 则整体替换为该目录（支持相对路径，以数据根为基准；HTML + 视频都由内置 HTTP 服务器托管）。
export function gamesHtmlDir(): string {
  return configuredPath("gameDetailsDir") ?? path.join(configRoot(), "Game_Details");
}

// 公告目录：<数据根>/announcements
export function announcementsDir(): string {
  return path.join(configRoot(), "announcements");
}

// 公告文件名：<公告目录>/announcement.html
export function announcementFile(): string {
  return path.join(announcementsDir(), "announcement.html");
}

// 存档备份工具 GameSaveHelper.exe 的路径（<主程序目录>/config.json 的
// settings.gameSaveHelperPath）。绝对路径原样；相对路径以数据根为基准；未配置返回 null。
export function gameSaveHelperExePath(): string | null {
  return configuredPath("gameSaveHelperPath");
}

// 游戏根目录（<主程序目录>/config.json 的 settings.defaultGameRootPath）：
// 游戏按「相对路径」存放时的基准目录，例如 `..\Z\Supermarket Simulator` 配合
// `X:\YunGame\Playnite` 解析成 `X:\YunGame\Z\Supermarket Simulator`。
// 生产环境是 X:\YunGame\Playnite、测试环境是 D:\YunGame\Playnite —— 靠配置解耦，
// 不在代码里写死。未配置（含空串）时回退到数据根，保持旧行为。
export function defaultGameRootPath(): string {
  return configuredPath("defaultGameRootPath") ?? configRoot();
}
