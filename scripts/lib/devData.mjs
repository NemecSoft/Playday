// 开发态数据路径的**唯一来源**（bat / 脚本都从这里取，别各自写死目录名）。
//
// 为什么要有它：`dev-data` 这个名字以前散落在 8 个 bat + 8 个脚本里，各自 path.join 拼一遍。
// 哪天把数据挪个位置，就得全文搜索着改 —— 而漏一个的后果不是报错，是**静默写到别处**
// （脚本往新目录写、客户端还在读老目录，表现成"改了没生效"），正是最难查的那类问题。
//
// 取值顺序（与桌面端 electron/core/paths.ts 的 configRoot() 保持一致）：
//   1. 环境变量 YUNGAME_DATA_DIR（绝对路径）—— 供 bat / 临时重定向用；
//   2. path-modes.json 的 modes.dev.libraryDir：绝对路径原样；相对路径以**仓库根**为基准
//      （仓库根就是开发态的 appRoot，与桌面端语义一致）。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 仓库根（开发态的 appRoot）。 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** 路径模式表（三种模式的目录规则，见 docs/design/release-build.md）。 */
export const RULES_FILE = path.join(ROOT, "path-modes.json");

/** 读规则表原文。 */
export function readRules() {
  return JSON.parse(fs.readFileSync(RULES_FILE, "utf-8"));
}

/** 开发态数据根（绝对路径）。 */
export function devDataDir() {
  const env = process.env.YUNGAME_DATA_DIR;
  if (env && path.isAbsolute(env)) return env;
  const raw = readRules()?.modes?.dev?.libraryDir;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw new Error("path-modes.json 的 modes.dev.libraryDir 为空 —— 开发态数据根必须显式配置");
  }
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("//") ? value : path.join(ROOT, value);
}

/** 权威库（源库）：`<数据根>/Admin/library.db` —— 两级结构固定，见 shared/pathConfig.ts。 */
export const adminDbPath = (root = devDataDir()) => path.join(root, "Admin", "library.db");

/** 运行时副本：`<数据根>/library/library.db`（客户端启动时从权威库复制一份）。 */
export const runtimeDbPath = (root = devDataDir()) => path.join(root, "library", "library.db");

/** 数据根相对仓库的路径（git status 里显示的就是这个；数据在仓库外时返回 ""）。 */
export function dataDirGitPath(root = devDataDir()) {
  const rel = path.relative(ROOT, root).split(path.sep).join("/");
  return rel && !rel.startsWith("..") ? rel : "";
}

/** 列出缺失的必需文件（齐了就返回空数组）—— bat / 脚本的前置检查用它。 */
export function missingDevData(root = devDataDir()) {
  return [adminDbPath(root), runtimeDbPath(root)].filter((p) => !fs.existsSync(p));
}
