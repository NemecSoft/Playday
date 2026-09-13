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
import {
  resolveAnnouncementFile,
  resolveConfiguredDir,
  resolveConfiguredPath,
  resolveLibraryPaths,
  type LibraryPaths,
} from "../../shared/pathConfig";

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

// 数据库路径：权威库 → 运行时副本 的**复制关系固定**，两个**目录**都可配置：
//   settings.sourceLibraryDir（权威库目录，默认 <库根>/Admin）—— 只读数据来源；
//   settings.libraryDir      （库根，默认数据根）—— 运行时副本所在，也是权威库的默认父目录。
//   权威库      <权威库目录>/library.db        —— 手工维护的 games.json + 脚本写入
//                                                （import-games.bat → playday-db.mjs）；
//   运行时副本  <库根>/library/library.db      —— 客户端每次启动从权威库复制一份再用。
//
// 为什么是"目录"而不是"db 文件路径"：
//   核心原因是"玩家正在玩的时候被更新破坏库"—— 存档操作要读库里的存档路径，
//   库被更新动作破坏就存不了档。所以权威库只读、运行时副本每次从它重建，写只落副本。
//   只开放目录、文件名固定 library.db，是为了保住"副本永远由权威库复制而来"这条
//   唯一性约束（否则可能配出一个跟权威库无关的库文件）。
//
// 解析规则在 shared/pathConfig.ts（零依赖纯函数 + 单测），网站端 server/paths.mjs 同语义
// （有 parity 测试盯着）。
export function libraryPaths(): LibraryPaths {
  return resolveLibraryPaths({
    // 留空时默认挂在数据根下；相对路径以 appRoot（exe 所在目录）为基准。
    dataRoot: configRoot(),
    baseDir: appRoot(),
    libraryDir: readSettingsField("libraryDir"),
    sourceLibraryDir: readSettingsField("sourceLibraryDir"),
  });
}

// 源库路径（数据唯一来源，只读不写）。
export function sourceDatabasePath(): string {
  return libraryPaths().source;
}

// 运行时库路径（客户端每次启动复制一份再用，读写都是它）。
export function runtimeDatabasePath(): string {
  return libraryPaths().runtime;
}

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

// ---- 可配置目录（config.json → settings.xxxDir）----
// 统一语义（实现在 shared/pathConfig.ts，有单测）：
//   未配置 / 空串 → 默认目录 <数据根>/<默认名>；绝对路径原样；
//   相对路径 → 以 **appRoot()（exe 所在目录）** 为基准，不以数据根为基准。
//
// 目录清单（config.json 字段 → 默认）：
//   coverImagesDir   → <数据根>/CoverImages    封面图（按游戏名同名匹配）
//   gameDetailsDir   → <数据根>/Game_Details   详情页 HTML/视频 + 修改器/游戏存档子目录
//   announcementsDir → <数据根>/announcements  公告 announcement.html
//   libraryDir       → <数据根>                数据库库根（见上：库路径两级结构）

// 封面图目录。
export function coverImagesDir(): string {
  return resolveConfiguredDir(readSettingsField("coverImagesDir"), configRoot(), "CoverImages", appRoot());
}

// 读取 config.json 里 settings 下某个"自定义路径"字段（目录或文件都适用）。
// 支持：绝对路径原样使用；相对路径以 appRoot()（exe 所在目录）为基准解析；
// 未配置（含空串）返回 null（用默认）。
export function configuredPath(field: string): string | null {
  return resolveConfiguredPath(readSettingsField(field), appRoot());
}

// 读取 config.json 里 settings 下的原始值（不做任何路径解析）。
// 注意：这里直接解析 config.json，不 import settings.ts，避免 paths ↔ settings 循环依赖。
function readSettingsField(field: string): unknown {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as { settings?: Record<string, unknown> };
    return parsed?.settings?.[field];
  } catch {
    // config.json 不存在或损坏：视为未配置，走默认。
    return undefined;
  }
}

// 游戏静态详情页目录（HTML + 视频由内置 HTTP 服务器托管；修改器/游戏存档也在它下面）。
export function gamesHtmlDir(): string {
  return resolveConfiguredDir(readSettingsField("gameDetailsDir"), configRoot(), "Game_Details", appRoot());
}

// 应用自带字体目录（settings.fontsDir）。
// 未配置 → <应用 exe 同级>/fonts（开发态 = 工程根），**与旧行为完全一致**；
// 打包版还会去 <resources>/fonts 兜底（见 electron/core/fonts.ts 的 fontsDirCandidates）。
// ⚠️ 默认基准是 appRoot 而不是数据根：字体是"程序自带资源"，跟程序走；数据根会被
//    YUNGAME_DATA_DIR / 便携布局改变，拿它当默认会变成"换个启动方式就找不到字体"。
export function fontsDir(): string {
  return resolveConfiguredDir(readSettingsField("fontsDir"), appRoot(), "fonts", appRoot());
}

// 运行库安装包目录（settings.runtimeDir）：VC++ 运行库 x64/x86、VP9 解码扩展。
// 未配置 → <应用 exe 同级>/runtime；打包版还有 <resources>/runtime 兜底（见 runtimeSetup.ts）。
// ⚠️ 默认基准是 appRoot 而不是数据根：这是"程序自带资源"，跟程序走 —— 与 fontsDir 同一个道理。
// 取值由 path-modes.json 定（正式机 X:/YunGame/Playnite/runtime、测试机 D:/... 同路径）。
export function runtimeDir(): string {
  return resolveConfiguredDir(readSettingsField("runtimeDir"), appRoot(), "runtime", appRoot());
}

// 开机自启工具 YunGameStart 所在目录（settings.yungamestartDir）。
// 未配置 → <应用 exe 同级>/yungamestart。目前**没有代码消费者**：工具由用户自己开机启动
// （快捷键丢进 shell:startup，见 docs/design/yungamestart.md）。落位是为了让"工具在哪"
// 从配置里读得到 —— 运维脚本可以直接读 config.json，将来要在客户端里拉起它也不必再找路径。
export function yungamestartDir(): string {
  return resolveConfiguredDir(readSettingsField("yungamestartDir"), appRoot(), "yungamestart", appRoot());
}

// 背景音乐目录（settings.musicDir）。
// 未配置 → <数据根>/music（与封面/详情页等数据目录的约定一致，留空时是"数据旁边的 music"）；
// 目录不存在或没有音频文件 → 视为没有背景音乐（前端不显示音乐控件）。
export function musicDir(): string {
  return resolveConfiguredDir(readSettingsField("musicDir"), configRoot(), "music", appRoot());
}

// 公告目录。
export function announcementsDir(): string {
  return resolveConfiguredDir(readSettingsField("announcementsDir"), configRoot(), "announcements", appRoot());
}

// 公告文件名：<公告目录>/announcement.html
export function announcementFile(): string {
  return resolveAnnouncementFile(readSettingsField("announcementsDir"), configRoot(), appRoot());
}

// 存档备份工具 GameSaveHelper.exe 的路径（<主程序目录>/config.json 的
// settings.gameSaveHelperPath）。绝对路径原样；相对路径以应用 exe 所在目录为基准；未配置返回 null。
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
