// 网站端的路径解析（零依赖，纯函数 + 读配置）。
//
// ⚠️ 本文件与桌面端的 shared/pathConfig.ts 是**同一套语义的两份实现**：
// 网站端要能 `node server/server.mjs` 直接跑（不能 import TS），所以用 .mjs 重写了一份。
// shared/pathConfig.test.ts 里有一组 **parity 用例**逐项比对两者结果 ——
// 改了一边忘了另一边会直接测失败，不会悄悄漂移。
//
// 之前的问题（本次修复）：
//   1) server.mjs 把 CoverImages / Game_Details / announcements / library 全写死 →
//      桌面端配了自定义目录，网站端读不到（"配了没用"）。
//   2) config.json 读的是 <数据根>/config.json，而桌面端的 config.json 在
//      <主程序目录> 下（见 electron/core/paths.ts 的 configPath）→ 读不到真配置。
import fs from "node:fs";
import path from "node:path";

// ---- 与 shared/launchPaths.ts 相同的词法工具（保持逐字一致，parity 测试盯着）----
// 分隔符统一用 `/`（输出的规范形式）；输入两种都收；交给 cmd 时才换回 `\`。
const SEP = "/";

function isAbsolutePath(p) {
  return /^[a-zA-Z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p);
}

function normalizePath(p) {
  const raw = String(p);
  // 保留 UNC 前缀（\\server\share / //server/share）：开头两个斜杠不是空段，
  // 丢掉会变成相对路径。统一输出 //server/share。
  const unc = /^[\\/]{2}[^\\/]/.test(raw);
  const parts = raw.split(/[\\/]/);
  const out = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (out.length) out.pop();
      else out.push("..");
    } else {
      out.push(part);
    }
  }
  const joined = out.join(SEP);
  return unc ? SEP + SEP + joined : joined;
}

function joinPaths(base, rest) {
  return normalizePath(`${base}${SEP}${rest}`);
}

// ---- 与 shared/pathConfig.ts 相同的解析规则 ----

/**
 * 未配置（含空串/空白/非字符串）→ null；绝对路径原样；
 * 相对路径以 baseDir（= 应用所在目录，与桌面端 appRoot 同义）为基准。
 */
export function resolveConfiguredPath(raw, baseDir) {
  const p = typeof raw === "string" ? raw.trim() : "";
  if (!p) return null;
  return isAbsolutePath(p) ? normalizePath(p) : joinPaths(baseDir, p);
}

/**
 * 未配置 → <dataRoot>/<defaultName>（defaultName 传 "" 表示默认就是数据根）。
 * baseDir 缺省 = dataRoot（旧行为；网站端/桌面端都会显式传"应用所在目录"）。
 */
export function resolveConfiguredDir(raw, dataRoot, defaultName, baseDir = dataRoot) {
  const configured = resolveConfiguredPath(raw, baseDir);
  if (configured) return configured;
  return defaultName ? joinPaths(dataRoot, defaultName) : dataRoot;
}

/** 库路径：权威库目录与库根都可配置，复制关系（权威 → 运行时副本）固定。 */
export function resolveLibraryPaths(opts) {
  const { dataRoot } = opts;
  const baseDir = opts.baseDir ?? dataRoot;
  const root = resolveConfiguredPath(opts.libraryDir, baseDir) ?? dataRoot;
  const sourceDir = joinPaths(root, "Admin");
  return {
    root,
    sourceDir,
    source: joinPaths(sourceDir, "library.db"),
    runtime: joinPaths(root, "library/library.db"),
  };
}

/** 公告目录：<库根>/announcements（2026-09-17 起不再单独配置 —— 与桌面端 shared/pathConfig.ts 同语义）。 */
export function resolveAnnouncementsDir(libraryRoot) {
  return joinPaths(libraryRoot, "announcements");
}

/** 公告文件：<库根>/announcements/announcement.html。 */
export function resolveAnnouncementFile(libraryRoot) {
  return joinPaths(libraryRoot, "announcements/announcement.html");
}

// ---- 读配置 ----

/**
 * 读 config.json。优先 <appRoot>/config.json（与桌面端一致）；
 * 找不到再退回旧位置 <dataRoot>/config.json（历史布局，桌面端有一次性迁移）。
 * @returns {{ file: string, settings: Record<string, unknown>, fromLegacy: boolean }}
 */
export function readSettingsFile({ dataRoot, appRoot }) {
  const primary = path.join(appRoot, "config.json");
  const legacy = path.join(dataRoot, "config.json");
  const file = fs.existsSync(primary) ? primary : fs.existsSync(legacy) ? legacy : primary;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return { file, settings: parsed?.settings || {}, fromLegacy: file === legacy && !fs.existsSync(primary) };
  } catch {
    return { file, settings: {}, fromLegacy: false };
  }
}

/**
 * 网站端需要的全部路径，一次算清。
 * 支持的自定义项与桌面端完全一致（config.json → settings）：
 *   coverImagesDir / gameDetailsDir / libraryDir
 * （公告目录与权威库目录 2026-09-17 起不再单独配置：固定 <库根>/announcements 与 <库根>/Admin）
 */
export function resolveServerPaths({ dataRoot, appRoot }) {
  const { file: configFile, settings } = readSettingsFile({ dataRoot, appRoot });
  // 相对路径的基准 = "应用所在目录"（网站端 = server/ 的上一级，即工程根/程序目录），
  // 与桌面端 appRoot() 同义 —— 两边必须一致，否则 parity 测试会失败。
  const baseDir = appRoot;
  const library = resolveLibraryPaths({
    dataRoot,
    baseDir,
    libraryDir: settings.libraryDir,
  });
  return {
    configFile,
    settings,
    library,
    /** 运行时库（网站端只读它，与桌面端用的是同一个文件）。 */
    dbPath: library.runtime,
    coverDir: resolveConfiguredDir(settings.coverImagesDir, dataRoot, "CoverImages", baseDir),
    detailsDir: resolveConfiguredDir(settings.gameDetailsDir, dataRoot, "Game_Details", baseDir),
    // 公告跟着库根走（2026-09-17 起不再单独配置公告目录）
    announcementsFile: resolveAnnouncementFile(library.root),
  };
}
