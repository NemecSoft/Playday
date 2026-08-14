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

// 数据库文件路径：<数据根>/library/library.db
export function databasePath(): string {
  return path.join(configRoot(), "library", "library.db");
}

// 应用设置文件路径：<数据根>/config.json
export function configPath(): string {
  return path.join(configRoot(), "config.json");
}

// 封面图目录：<数据根>/CoverImages（用户把图片按游戏名丢这里，程序自动匹配）
export function coverImagesDir(): string {
  return path.join(configRoot(), "CoverImages");
}

// 游戏静态详情页目录：<数据根>/Game_Details
export function gamesHtmlDir(): string {
  return path.join(configRoot(), "Game_Details");
}

// 公告目录：<数据根>/announcements
export function announcementsDir(): string {
  return path.join(configRoot(), "announcements");
}

// 公告文件名：<公告目录>/announcement.html
export function announcementFile(): string {
  return path.join(announcementsDir(), "announcement.html");
}
