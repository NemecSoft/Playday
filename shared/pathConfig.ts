// 数据目录配置的解析规则 —— 纯函数，零 import（只复用同目录的路径词法工具）。
//
// 为什么单独抽出来：
//   1) 同一套规则要同时满足**桌面端**（electron/core/paths.ts）和**网站端**
//      （server/paths.mjs）。网站端此前把 CoverImages / Game_Details / announcements /
//      library 全部写死，桌面端配了自定义目录它读不到 —— "配了没用"。
//   2) 规则短但容易写歪（相对/绝对/空串/未配置四种情况），抽出来才有单测；
//      scripts/check-architecture.mjs 也据此禁止别处再写死这些目录名。
//
// 语义（settings 下的 xxxDir / xxxPath 字段一律如此）：
//   | 配置值            | 结果                                          |
//   | 未配置 / "" / 空白 | 默认目录：<数据根>/<默认名>                    |
//   | 绝对路径           | 原样（D:\x、D:/x、\\server\share）             |
//   | 相对路径           | 以**应用 exe 所在目录**（appRoot）为基准        |
//
// ⚠️ 两个"根"必须分清（踩过一次：把相对路径的基准当成了数据根）：
//   dataRoot —— 只在字段**留空**时决定默认目录（<数据根>/<默认名>）；
//   baseDir  —— 相对路径的基准 = **应用 exe 所在目录**（见 electron/core/paths.ts 的 appRoot()：
//               打包版 = exe 所在目录；开发态 = 工程根）。
//   为什么相对路径不跟数据根：数据根本身会被 YUNGAME_DATA_DIR / exe 位置改变 ——
//   拿它当基准，"同一个相对路径"在不同启动方式下会指到不同地方，用户没法预期。
//   exe 所在目录是用户唯一能自己判断的锚点（"就在程序旁边"），也是绿色便携的本意。
//
// 关于 library（数据库）—— 双库机制的设计意图，改代码前务必读懂：
//   核心原因：玩家可能**正在游戏**，而存档操作要读库里的存档路径（save_paths）。
//   此时一旦发生"更新"（更新游戏库/程序），<库根>/library/library.db 可能被破坏，
//   玩家就做不了存档 —— 这是这套设计要解决的主要问题。
//   所以拆成两份，把"更新破坏"限制在可丢弃的临时文件上：
//     权威库（源库） <权威库目录>/library.db —— 唯一数据来源，只读（手工/脚本维护）；
//     运行时副本     <库根>/library/library.db —— 每次启动从权威库**复制**一份，
//                     **所有读写都只发生在副本上**；副本坏了/被覆盖，重启重建即可
//                     （副本打不开时还有自愈：坏文件留档 + 从权威库重建，见 db.ts）。
//   要保的约束是"**复制关系固定**"：运行时副本永远由配置的权威库复制而来，
//   不会出现"配置的库"与"实际在用的库"两个互不相干的数据源。
//   因此可配置的是两个**目录**（权威库目录 + 库根），而不是某个具体 db 文件路径。
import { isAbsolutePath, joinPaths, normalizePath } from "./launchPaths";

/** 库路径解析入参。 */
export interface LibraryPathOptions {
  /** 数据根：字段**留空**时的默认根。 */
  dataRoot: string;
  /**
   * 相对路径的基准 = 应用 exe 所在目录（appRoot）。
   * 缺省 = dataRoot（网站端等没有"exe"的场景，保持旧行为）。
   */
  baseDir?: string;
  /** 库根（settings.libraryDir）：运行时库的位置，也是权威库的默认父目录。空 = 数据根。 */
  libraryDir?: unknown;
}

/** 库路径：库根 + 权威库 + 运行时副本。 */
export interface LibraryPaths {
  /** 库根（默认 = 数据根）。 */
  root: string;
  /** 权威库目录（默认 <库根>/Admin）。 */
  sourceDir: string;
  /** 权威库：<权威库目录>/library.db（手工/脚本维护，数据唯一来源，只读）。 */
  source: string;
  /** 运行时副本：<库根>/library/library.db（每次启动从权威库复制一份再用）。 */
  runtime: string;
}

/**
 * 解析一个"可配置路径"字段。
 * @param baseDir 相对路径的基准 = 应用 exe 所在目录（appRoot）。
 * @returns 未配置（含空串/空白/非字符串）返回 null；否则返回绝对路径。
 */
export function resolveConfiguredPath(raw: unknown, baseDir: string): string | null {
  const p = typeof raw === "string" ? raw.trim() : "";
  if (!p) return null;
  // 绝对路径原样（仅规范分隔符与 . / ..）；相对路径以 baseDir（exe 所在目录）补全。
  // 注意：`\Data` 这类"只有根没有盘符"的写法按相对路径处理（挂在 exe 目录下），
  // 比 Node 的 path.resolve 更符合"配置里写相对路径"的直觉。
  return isAbsolutePath(p) ? normalizePath(p) : joinPaths(baseDir, p);
}

/**
 * 解析一个"可配置目录"字段。
 * @param dataRoot    字段**留空**时的默认根（默认目录 = <dataRoot>/<defaultName>）。
 * @param defaultName 未配置时的默认子目录名（相对数据根）。传 "" 表示默认就是数据根本身。
 * @param baseDir     相对路径的基准 = 应用 exe 所在目录；缺省 = dataRoot（旧行为）。
 */
export function resolveConfiguredDir(
  raw: unknown,
  dataRoot: string,
  defaultName: string,
  baseDir: string = dataRoot,
): string {
  const configured = resolveConfiguredPath(raw, baseDir);
  if (configured) return configured;
  return defaultName ? joinPaths(dataRoot, defaultName) : dataRoot;
}

/**
 * 解析库路径。
 *   libraryDir（库根）→ 运行时副本位置；也是权威库的父目录。空 = 数据根。
 * 权威库固定在 <库根>/Admin（**推导，不可配置** —— 2026-09-17 收口）。
 * 两者都是"目录"，文件名固定 library.db —— 复制关系因此永远唯一。
 * 相对路径一律以 appRoot（exe 所在目录）为基准，不以数据根为基准。
 */
export function resolveLibraryPaths(opts: LibraryPathOptions): LibraryPaths {
  const { dataRoot } = opts;
  const baseDir = opts.baseDir ?? dataRoot;
  // 留空时库根 = 数据根，保持旧布局（<数据根>/Admin/library.db、<数据根>/library/library.db）。
  const root = resolveConfiguredPath(opts.libraryDir, baseDir) ?? dataRoot;
  const sourceDir = joinPaths(root, "Admin");
  return {
    root,
    sourceDir,
    source: joinPaths(sourceDir, "library.db"),
    runtime: joinPaths(root, "library/library.db"),
  };
}

/**
 * 公告目录：`<库根>/announcements`。
 *
 * 2026-09-17 起公告目录**不再单独配置**：它跟着库根走 —— 与"权威库固定 `<库根>/Admin`"同一个
 * 道理（复制关系只有一种可能，配置里少一个能写歪的地方）。
 * ⚠️ 目录名写在这里而不是调用方：`scripts/check-architecture.mjs` 会拦"在别处拼这些数据目录名"。
 */
export function resolveAnnouncementsDir(libraryRoot: string): string {
  return joinPaths(libraryRoot, "announcements");
}

/** 公告文件：`<库根>/announcements/announcement.html`。 */
export function resolveAnnouncementFile(libraryRoot: string): string {
  return joinPaths(libraryRoot, "announcements/announcement.html");
}
